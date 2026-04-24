/**
 * Thin client for the Flask/BLE backend.
 *
 * `openNodeStatusStream` wires up an EventSource that publishes
 * `connected`/`address` for each of the 6 nodes. The browser re-opens the
 * connection automatically when the backend drops it; we also layer a
 * manual retry in case the initial connect fails (e.g. backend not up yet).
 *
 * `sendToNode` posts a JSON payload to `/api/nodes/<id>/send`.
 */

const API_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  "http://localhost:5001";

export function getApiBase() {
  return API_BASE;
}

export const NODE_COUNT = 6;

/** Build a [false, false, ...] array of length 6. */
export function emptyConnections() {
  return Array.from({ length: NODE_COUNT }, () => false);
}

/**
 * Convert the backend snapshot ({"1": {connected,address}, ...}) into a
 * fixed-length boolean array indexed by `node_id - 1`.
 */
export function snapshotToConnections(snapshot) {
  const out = emptyConnections();
  if (!snapshot || typeof snapshot !== "object") return out;
  for (const [key, val] of Object.entries(snapshot)) {
    const id = Number(key);
    if (!Number.isInteger(id) || id < 1 || id > NODE_COUNT) continue;
    out[id - 1] = Boolean(val && val.connected);
  }
  return out;
}

/**
 * Subscribe to /api/nodes/stream. Returns a close() function.
 *
 * Handlers:
 *   onConnections(boolArray)       — initial snapshot + each status change
 *   onInbound({node_id, payload, raw})  — each ESP32 -> server notification
 *
 * Reconnects after 2s if the stream errors before `close()` is called.
 */
export function openNodeStatusStream(onConnections, onInbound) {
  let es = null;
  let closed = false;
  let retryTimer = null;

  const connect = () => {
    if (closed) return;
    es = new EventSource(`${API_BASE}/api/nodes/stream`);
    es.addEventListener("status", (ev) => {
      try {
        const snap = JSON.parse(ev.data);
        onConnections(snapshotToConnections(snap));
      } catch {
        /* ignore malformed frames */
      }
    });
    if (typeof onInbound === "function") {
      es.addEventListener("inbound", (ev) => {
        try {
          const evt = JSON.parse(ev.data);
          onInbound(evt);
        } catch {
          /* ignore malformed frames */
        }
      });
    }
    es.onerror = () => {
      if (closed) return;
      try {
        es.close();
      } catch {
        /* noop */
      }
      es = null;
      retryTimer = setTimeout(connect, 2000);
    };
  };

  connect();

  return function close() {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (es) {
      try {
        es.close();
      } catch {
        /* noop */
      }
    }
  };
}

async function postJson(path, body) {
  try {
    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}${path}`, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || `HTTP ${res.status}`, data };
    }
    return { ok: Boolean(data.ok), error: data.error, data };
  } catch (err) {
    return { ok: false, error: err?.message || "network error" };
  }
}

/**
 * Send a JSON command to a node. Returns `{ ok, error? }`; never throws.
 */
export async function sendToNode(id, payload) {
  return postJson(`/api/nodes/${id}/send`, payload);
}

/** Ask the backend to (re)connect node `id` via BLE. */
export async function connectNode(id) {
  return postJson(`/api/nodes/${id}/connect`);
}

/** Ask the backend to drop node `id` and stop auto-reconnecting. */
export async function disconnectNode(id) {
  return postJson(`/api/nodes/${id}/disconnect`);
}
