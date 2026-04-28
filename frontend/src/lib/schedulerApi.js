/* AI-ASSISTED
 * Simulation Controller
 * Matt Krueger, April 2026 
 */

import { getApiBase } from "./nodesApi";

export const SCHEDULER_MODE_SIM = "SIM";
export const SCHEDULER_MODE_TEST = "TEST";
export const SCHEDULER_MODE_DUMMY = "DUMMY";

async function postJson(path, body) {
  try {
    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(`${getApiBase()}${path}`, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || `HTTP ${res.status}`, data };
    }
    return { ok: Boolean(data.ok), error: data.error, data };
  } catch (err) {
    return { ok: false, error: err?.message || "network error" };
  }
}

async function getJson(path) {
  try {
    const res = await fetch(`${getApiBase()}${path}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || `HTTP ${res.status}`, data };
    }
    return { ok: Boolean(data.ok), error: data.error, data };
  } catch (err) {
    return { ok: false, error: err?.message || "network error" };
  }
}

export function setSchedulerMode(mode) {
  return postJson("/api/scheduler/mode", { mode });
}

export function setSimRuntime(runtime) {
  return postJson("/api/scheduler/sim_runtime", { runtime });
}

export function enqueueUser(type) {
  return postJson("/api/scheduler/enqueue", { type });
}

export function sampleUserDuration(type) {
  return postJson("/api/scheduler/sample_duration", { type });
}

export function clearSchedulerQueue() {
  return postJson("/api/scheduler/queue/clear");
}

export function resetScheduler() {
  return postJson("/api/scheduler/reset");
}

export function postServerLogLine(line) {
  return postJson("/api/server-log", { line });
}

export function updateSchedulerConfig({
  restroomPreset,
  toiletTypes,
  shyPeerPct,
  middleToiletFirstChoicePct,
  restroomConditions,
} = {}) {
  const body = {};
  if (restroomPreset !== undefined) body.restroom_preset = restroomPreset;
  if (toiletTypes !== undefined) body.toilet_types = toiletTypes;
  if (shyPeerPct !== undefined) body.shy_peer_pct = shyPeerPct;
  if (middleToiletFirstChoicePct !== undefined)
    body.middle_toilet_first_choice_pct = middleToiletFirstChoicePct;
  if (restroomConditions !== undefined)
    body.restroom_conditions = restroomConditions;
  return postJson("/api/scheduler/config", body);
}

export function getSchedulerState() {
  return getJson("/api/scheduler/state");
}

const SCHEDULER_EVENT_NAMES = [
  "scheduler_state",
  "queue_updated",
  "queue_item_exited",
  "assignment_preview",
  "assignment_preview_cancelled",
  "assignment_started",
  "assignment_completed",
  "mode_changed",
  "config_updated",
  "sim_runtime_changed",
  "reset",
  "server_log",
];

export function openSchedulerStream(onEvent) {
  let es = null;
  let closed = false;
  let retryTimer = null;

  const connect = () => {
    if (closed) return;
    es = new EventSource(`${getApiBase()}/api/scheduler/stream`);
    for (const name of SCHEDULER_EVENT_NAMES) {
      es.addEventListener(name, (ev) => {
        try {
          const data = JSON.parse(ev.data);
          onEvent?.(name, data);
        } catch {
        }
      });
    }
    es.onerror = () => {
      if (closed) return;
      try {
        es.close();
      } catch {
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
      }
    }
  };
}

function numOrNaN(v) {
  return v == null ? NaN : Number(v);
}

export function schedulerSnapshotToFrontendState(snap) {
  if (!snap || typeof snap !== "object") return null;
  const fixtures = Array.isArray(snap.fixtures) ? snap.fixtures : [];

  const stalls = [];
  const urinals = [];
  const pendingTransfers = [];
  const activeFixtureUsers = {};
  const nowServer = numOrNaN(snap.now);
  const skewMs =
    Number.isFinite(nowServer) ? Date.now() - nowServer * 1000 : 0;
  for (const f of fixtures) {
    const id = Number(f?.id);
    if (!Number.isInteger(id)) continue;
    const kind = String(f?.kind || "").toLowerCase();
    const inUse = Boolean(f?.in_use);
    const usagePct = inUse ? 100 : 0;
    const outOfOrder = f?.condition === "Out-of-Order";
    const useCountRaw = numOrNaN(f?.use_count);
    const useCount = Number.isFinite(useCountRaw) ? useCountRaw : 0;
    if (kind === "stall") {
      stalls.push({ id, usagePct, outOfOrder, useCount });
    } else if (kind === "urinal") {
      urinals.push({ id, usagePct, outOfOrder, useCount });
    } else {
      if (id <= 3) stalls.push({ id, usagePct: 0, outOfOrder: false, useCount: 0 });
      else urinals.push({ id, usagePct: 0, outOfOrder: false, useCount: 0 });
    }

    if (inUse) {
      const busyUntilServer = numOrNaN(f?.busy_until);
      const qid = numOrNaN(f?.current_queue_item_id);
      const durationS = numOrNaN(f?.current_duration_s);
      const occR = numOrNaN(f?.occupancy_remaining_s);
      let busyUntilMs = null;
      if (Number.isFinite(busyUntilServer)) {
        busyUntilMs = busyUntilServer * 1000 + skewMs;
      } else if (Number.isFinite(occR) && occR >= 0) {
        busyUntilMs = null;
      }
      activeFixtureUsers[id] = {
        fixtureId: id,
        userNumber: Number.isInteger(qid) ? qid : null,
        userType: String(f?.current_user_type || "pee"),
        durationS: Number.isFinite(occR) && !Number.isFinite(busyUntilServer)
          ? occR
          : Number.isFinite(durationS)
            ? durationS
            : null,
        busyUntilMs,
      };
    }

    if (f?.reserved) {
      const qid = numOrNaN(f?.reserved_queue_item_id);
      const reservedUntil = numOrNaN(f?.reserved_until);
      const prPrev = numOrNaN(f?.preview_remaining_s);
      const reservedDurationS = numOrNaN(f?.reserved_duration_s);
      const pss = numOrNaN(f?.preview_started_sim_s);
      const remainingMs =
        Number.isFinite(reservedUntil) && Number.isFinite(nowServer)
          ? Math.max(0, (reservedUntil - nowServer) * 1000)
          : Number.isFinite(prPrev) && prPrev >= 0
          ? prPrev * 1000
          : 3000;
      pendingTransfers.push({
        queueItemId: Number.isInteger(qid) ? qid : null,
        fixtureId: id,
        userType: String(f?.reserved_user_type || "pee"),
        startedAt: Date.now(),
        simStartMs: Number.isFinite(pss) ? pss * 1000 : null,
        durationMs: remainingMs,
        userDurationS: Number.isFinite(reservedDurationS)
          ? reservedDurationS
          : null,
      });
    }
  }

  const queue = Array.isArray(snap.queue)
    ? snap.queue.map((q) => {
        const durationS = numOrNaN(q?.duration_s);
        const enqueuedAtSimS = numOrNaN(q?.enqueued_at_sim_s);
        return {
          id: Number(q.id),
          type: String(q.type),
          durationS: Number.isFinite(durationS) ? durationS : null,
          enqueuedAtSimS: Number.isFinite(enqueuedAtSimS) ? enqueuedAtSimS : 0,
        };
      })
    : [];

  return {
    mode: snap.mode,
    queue,
    stalls,
    urinals,
    pendingTransfers,
    activeFixtureUsers,
    satisfiedUsers: Number(snap.satisfied_users ?? 0),
    exitedUsers: Number(snap.exited_users ?? 0),
    totalArrivals: Number(snap.total_arrivals ?? 0),
    simTimeS: Number(snap.sim_time_s ?? 0),
    runtime: snap.runtime ?? "paused",
    startedAt: snap.started_at ?? null,
    now: snap.now ?? null,
  };
}
