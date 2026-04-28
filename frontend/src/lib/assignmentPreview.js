/* AI-ASSISTED
 * Simulation Controller
 * Matt Krueger, April 2026 
 */

export const PREVIEW_ANIMATION_MS = 3000;

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
    simStartMs: simTimeAtStartS != null ? simTimeAtStartS * 1000 : null,
    durationMs,
    userDurationS: Number.isFinite(userDurationS) ? userDurationS : null,
  };
}

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
    }
  }, durationMs);
  return {
    transfer,
    cancel() {
      clearTimeout(timer);
    },
  };
}
