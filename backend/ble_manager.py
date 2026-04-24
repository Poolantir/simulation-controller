"""
BLE connection manager for the 6 Poolantir nodes.

Runs a dedicated asyncio event loop in a background thread. For each of the
six configured nodes we periodically scan for the advertised
`NODE_N_SERVICE` UUID and, once seen, maintain a `BleakClient` connection.
Writes to the matching `NODE_N_CHARACTERISTIC` are scheduled onto the BLE
loop via `run_coroutine_threadsafe` so Flask request handlers never touch
the event loop directly.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
from typing import Any, Callable, Dict, Optional

from bleak import BleakClient, BleakScanner

log = logging.getLogger(__name__)

NODE_IDS = (1, 2, 3, 4, 5, 6)
RECONNECT_INTERVAL_S = 5.0
SCAN_TIMEOUT_S = 4.0


class _NodeState:
    __slots__ = (
        "id",
        "service_uuid",
        "char_uuid",
        "client",
        "address",
        "connected",
        "desired",
    )

    def __init__(self, node_id: int, service_uuid: str, char_uuid: str) -> None:
        self.id = node_id
        self.service_uuid = service_uuid
        self.char_uuid = char_uuid
        self.client: Optional[BleakClient] = None
        self.address: Optional[str] = None
        self.connected: bool = False
        # If False, the supervisor leaves this node alone. Flipped by the
        # user via the Test Bench Connect/Disconnect buttons. Defaults to
        # True so the backend still auto-connects on startup.
        self.desired: bool = True


class BleManager:
    """Thread-safe facade around a background BLE event loop."""

    def __init__(self) -> None:
        self._nodes: Dict[int, _NodeState] = {}
        for nid in NODE_IDS:
            service = os.getenv(f"NODE_{nid}_SERVICE")
            char = os.getenv(f"NODE_{nid}_CHARACTERISTIC")
            if not service or not char:
                log.warning("Node %d missing service/characteristic env; skipping", nid)
                continue
            self._nodes[nid] = _NodeState(nid, service.lower(), char.lower())

        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[threading.Thread] = None
        self._subscribers: list[Callable[[Dict[int, Dict[str, Any]]], None]] = []
        # Inbound-message subscribers get (node_id, payload_dict, raw_text).
        # `payload_dict` is None if the notification was not valid JSON.
        self._inbound_subscribers: list[
            Callable[[int, Optional[Dict[str, Any]], str], None]
        ] = []
        self._sub_lock = threading.Lock()
        self._state_lock = threading.Lock()
        self._started = threading.Event()

    # ---- lifecycle ----------------------------------------------------

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(
            target=self._run_loop, name="ble-manager", daemon=True
        )
        self._thread.start()
        self._started.wait(timeout=5.0)

    def _run_loop(self) -> None:
        loop = asyncio.new_event_loop()
        self._loop = loop
        asyncio.set_event_loop(loop)
        self._started.set()
        try:
            loop.run_until_complete(self._supervisor())
        except Exception:
            log.exception("BLE supervisor crashed")
        finally:
            loop.close()

    async def _supervisor(self) -> None:
        """Forever: kick a reconnect attempt for every currently-disconnected node
        whose desired state is connected."""
        while True:
            tasks = [
                asyncio.create_task(self._ensure_connected(node))
                for node in self._nodes.values()
                if node.desired and not node.connected
            ]
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
            await asyncio.sleep(RECONNECT_INTERVAL_S)

    # ---- per-node connect --------------------------------------------

    async def _ensure_connected(self, node: _NodeState) -> None:
        if node.connected or not node.desired:
            return
        try:
            log.info("Node %d: scanning for service %s", node.id, node.service_uuid)
            device = await BleakScanner.find_device_by_filter(
                lambda d, ad: node.service_uuid
                in [str(u).lower() for u in (ad.service_uuids or [])],
                timeout=SCAN_TIMEOUT_S,
            )
            if device is None:
                log.debug("Node %d: not found in scan", node.id)
                return

            client = BleakClient(
                device, disconnected_callback=lambda _c, nid=node.id: self._on_disconnect(nid)
            )
            await client.connect()
            if not client.is_connected:
                log.warning("Node %d: connect returned but client not connected", node.id)
                return

            with self._state_lock:
                node.client = client
                node.address = getattr(device, "address", None)
                node.connected = True
            log.info("Node %d: connected @ %s", node.id, node.address)

            # Subscribe to notifications on the same characteristic we write
            # to. ESP32 -> server traffic (IN-USE, COMPLETE, ECHO) arrives here.
            try:
                await client.start_notify(
                    node.char_uuid,
                    lambda _char, data, nid=node.id: self._on_notify(nid, bytes(data)),
                )
            except Exception as exc:
                log.warning("Node %d: start_notify failed: %s", node.id, exc)

            self._publish()
        except Exception as exc:
            log.warning("Node %d: connect failed: %s", node.id, exc)
            with self._state_lock:
                node.connected = False
                node.client = None

    def _on_notify(self, node_id: int, data: bytes) -> None:
        raw = data.decode("utf-8", errors="replace")
        try:
            payload: Optional[Dict[str, Any]] = json.loads(raw)
            if not isinstance(payload, dict):
                payload = None
        except Exception:
            payload = None
        log.info("Node %d <- %s", node_id, raw)
        with self._sub_lock:
            subs = list(self._inbound_subscribers)
        for cb in subs:
            try:
                cb(node_id, payload, raw)
            except Exception:
                log.exception("inbound subscriber raised")

    def _on_disconnect(self, node_id: int) -> None:
        node = self._nodes.get(node_id)
        if node is None:
            return
        with self._state_lock:
            node.connected = False
            node.client = None
            node.address = None
        log.info("Node %d: disconnected", node_id)
        self._publish()

    # ---- public API ---------------------------------------------------

    def snapshot(self) -> Dict[int, Dict[str, Any]]:
        with self._state_lock:
            return {
                nid: {
                    "connected": n.connected,
                    "address": n.address,
                    "desired": n.desired,
                }
                for nid, n in self._nodes.items()
            }

    def subscribe(self, callback: Callable[[Dict[int, Dict[str, Any]]], None]) -> Callable[[], None]:
        with self._sub_lock:
            self._subscribers.append(callback)

        def unsubscribe() -> None:
            with self._sub_lock:
                try:
                    self._subscribers.remove(callback)
                except ValueError:
                    pass

        return unsubscribe

    def subscribe_inbound(
        self,
        callback: Callable[[int, Optional[Dict[str, Any]], str], None],
    ) -> Callable[[], None]:
        """Register for node->server notifications.

        Callback receives (node_id, parsed_payload_or_None, raw_text).
        """
        with self._sub_lock:
            self._inbound_subscribers.append(callback)

        def unsubscribe() -> None:
            with self._sub_lock:
                try:
                    self._inbound_subscribers.remove(callback)
                except ValueError:
                    pass

        return unsubscribe

    def _publish(self) -> None:
        snap = self.snapshot()
        with self._sub_lock:
            subs = list(self._subscribers)
        for cb in subs:
            try:
                cb(snap)
            except Exception:
                log.exception("subscriber callback raised")

    def request_connect(self, node_id: int, timeout: float = 15.0) -> Dict[str, Any]:
        """User asked to connect node N. Flips desired=True and attempts a
        connect immediately, rather than waiting for the next supervisor tick.
        """
        node = self._nodes.get(node_id)
        if node is None:
            return {"ok": False, "error": f"unknown node {node_id}"}
        if self._loop is None:
            return {"ok": False, "error": "ble loop not running"}

        with self._state_lock:
            node.desired = True
        self._publish()
        if node.connected:
            return {"ok": True, "connected": True}

        fut = asyncio.run_coroutine_threadsafe(self._ensure_connected(node), self._loop)
        try:
            fut.result(timeout=timeout)
        except Exception as exc:
            return {"ok": False, "error": f"connect error: {exc}"}
        return {"ok": True, "connected": node.connected}

    def request_disconnect(self, node_id: int, timeout: float = 10.0) -> Dict[str, Any]:
        """User asked to disconnect node N. Flips desired=False so the
        supervisor stops reconnecting, and tears down the existing link."""
        node = self._nodes.get(node_id)
        if node is None:
            return {"ok": False, "error": f"unknown node {node_id}"}
        if self._loop is None:
            return {"ok": False, "error": "ble loop not running"}

        with self._state_lock:
            node.desired = False
        self._publish()

        fut = asyncio.run_coroutine_threadsafe(self._disconnect(node), self._loop)
        try:
            fut.result(timeout=timeout)
        except Exception as exc:
            return {"ok": False, "error": f"disconnect error: {exc}"}
        return {"ok": True, "connected": node.connected}

    async def _disconnect(self, node: _NodeState) -> None:
        client = node.client
        with self._state_lock:
            node.client = None
            node.address = None
            node.connected = False
        if client is not None:
            try:
                await client.disconnect()
            except Exception as exc:
                log.warning("Node %d: disconnect raised: %s", node.id, exc)
        self._publish()

    def send(self, node_id: int, payload: Dict[str, Any], timeout: float = 5.0) -> Dict[str, Any]:
        """Blocking send from any thread; schedules the coroutine on the BLE loop."""
        node = self._nodes.get(node_id)
        if node is None:
            return {"ok": False, "error": f"unknown node {node_id}"}
        if self._loop is None:
            return {"ok": False, "error": "ble loop not running"}
        fut = asyncio.run_coroutine_threadsafe(self._send(node, payload), self._loop)
        try:
            return fut.result(timeout=timeout)
        except Exception as exc:
            return {"ok": False, "error": f"send error: {exc}"}

    async def _send(self, node: _NodeState, payload: Dict[str, Any]) -> Dict[str, Any]:
        client = node.client
        if not node.connected or client is None or not client.is_connected:
            return {"ok": False, "error": "node not connected"}
        try:
            # ESP32 characteristic exposes PROPERTY_WRITE (request/ack path),
            # so use response=True for reliable delivery from macOS CoreBluetooth.
            data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
            await client.write_gatt_char(node.char_uuid, data, response=True)
            return {"ok": True}
        except Exception as exc:
            log.warning("Node %d: write failed: %s", node.id, exc)
            return {"ok": False, "error": str(exc)}
