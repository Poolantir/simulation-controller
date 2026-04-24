/**
 * Queue -> toilet "assignment preview" animation plumbing.
 *
 * The preview is the 3-second beat that runs *before* a user's
 * assignment actually takes effect (in-use flip in Dummy Mode / node
 * send in Sim Mode). During the preview an arrow + user icon is drawn
 * traveling from the queue item to the target fixture.
 *
 * The backend Dummy scheduler is authoritative for Dummy Mode: it
 * emits `assignment_preview` at reservation time and `assignment_started`
 * once the preview window completes. The frontend simply mirrors those
 * events into the `pendingTransfers` list and removes transfers as they
 * commit or cancel.
 *
 * Sim Mode currently has no auto-send flow, but any future hook that
 * dispatches a node command in response to queue activity should route
 * through `schedulePreviewCommit` so the same animation plays before
 * the effect is applied.
 */

/** Preview window in milliseconds. Kept in sync with backend
 * `PREVIEW_DURATION_S` (see `backend/scheduler.py`). */
export const PREVIEW_ANIMATION_MS = 3000;

/**
 * Build a frontend-side transfer record from an `assignment_preview`
 * SSE payload. Returns `null` if required fields are missing so
 * callers can short-circuit.
 */
export function transferFromPreviewEvent(data) {
  if (!data || typeof data !== "object") return null;
  const queueItemId = Number(data.queue_item_id);
  const fixtureId = Number(data.fixture_id);
  if (!Number.isInteger(queueItemId) || !Number.isInteger(fixtureId)) {
    return null;
  }
  const previewS = Number(data.preview_duration_s);
  const durationMs =
    Number.isFinite(previewS) && previewS > 0
      ? previewS * 1000
      : PREVIEW_ANIMATION_MS;
  const userDurationS = Number(data.duration_s);
  const simS = Number(data.sim_time_s);
  const simTimeAtStartS = Number.isFinite(simS) ? simS : null;
  return {
    queueItemId,
    fixtureId,
    userType: String(data.user_type || "pee"),
    startedAt: Date.now(),
    /** Milliseconds on the sim clock at preview start (sync with `simNowMs`). */
    simStartMs: simTimeAtStartS != null ? simTimeAtStartS * 1000 : null,
    durationMs,
    // User's sampled occupancy duration; shown as the static timer
    // label on the traveling marker so the identity (number + time)
    // stays consistent from queue -> toilet.
    userDurationS: Number.isFinite(userDurationS) ? userDurationS : null,
  };
}

/**
 * Drive a frontend-originated preview with a deferred commit callback.
 *
 * Intended as the Sim Mode (or any non-backend-authoritative) entry
 * point: `commit` is invoked once the preview window elapses, unless
 * `cancel` is called first on the returned handle. The returned handle
 * also exposes the transfer payload the UI should render during the
 * preview window.
 */
export function schedulePreviewCommit({
  queueItemId,
  fixtureId,
  userType,
  commit,
  durationMs = PREVIEW_ANIMATION_MS,
}) {
  const transfer = {
    queueItemId,
    fixtureId,
    userType,
    startedAt: Date.now(),
    durationMs,
  };
  const timer = setTimeout(() => {
    try {
      commit?.(transfer);
    } catch {
      /* caller-provided commit should not crash the coordinator */
    }
  }, durationMs);
  return {
    transfer,
    cancel() {
      clearTimeout(timer);
    },
  };
}
