/**
 * Choice distribution for an empty restroom (scheduler.md assumptions 1–3).
 * - 3 fixtures: first (100−m)/2%, middle m%, third (100−m)/2%
 * - 2 fixtures: 50% / 50%
 * - 1 fixture: 100%
 * - n>3: equal split (spec silent; reasonable default)
 */
export function distributeWithinGroup(count, middlePct) {
  const m = Math.min(100, Math.max(0, middlePct));
  if (count <= 0) return [];
  if (count === 1) return [100];
  if (count === 2) return [50, 50];
  if (count === 3) {
    const side = (100 - m) / 2;
    return [side, m, side];
  }
  const eq = 100 / count;
  return Array.from({ length: count }, () => eq);
}

/**
 * Case 1: empty restroom, next user pee — assumptions 1 + 3 (shy → stalls).
 * Returns length-6 array: percent 0–100 per toilet index (0 = toilet 1).
 */
export function computeEmptyPeePercents(config) {
  const types = config.toiletTypes.map((t) => String(t).toLowerCase());
  const stallIdx = types
    .map((t, i) => (t === "stall" ? i : -1))
    .filter((i) => i >= 0);
  const urinalIdx = types
    .map((t, i) => (t === "urinal" ? i : -1))
    .filter((i) => i >= 0);

  let pStall = config.shyPeerPct / 100;
  let pUrinal = 1 - pStall;
  if (urinalIdx.length === 0) {
    pStall = 1;
    pUrinal = 0;
  } else if (stallIdx.length === 0) {
    pStall = 0;
    pUrinal = 1;
  }

  const stallShares = distributeWithinGroup(
    stallIdx.length,
    config.middleToiletFirstChoicePct
  );
  const urinalShares = distributeWithinGroup(
    urinalIdx.length,
    config.middleToiletFirstChoicePct
  );

  const pct = new Array(6).fill(0);
  stallIdx.forEach((idx, j) => {
    pct[idx] += pStall * stallShares[j];
  });
  urinalIdx.forEach((idx, j) => {
    pct[idx] += pUrinal * urinalShares[j];
  });
  return pct;
}

/**
 * Case 2: empty restroom, next user poo — assumption 2 (stalls only).
 */
export function computeEmptyPooPercents(config) {
  const types = config.toiletTypes.map((t) => String(t).toLowerCase());
  const stallIdx = types
    .map((t, i) => (t === "stall" ? i : -1))
    .filter((i) => i >= 0);

  const stallShares = distributeWithinGroup(
    stallIdx.length,
    config.middleToiletFirstChoicePct
  );

  const pct = new Array(6).fill(0);
  stallIdx.forEach((idx, j) => {
    pct[idx] = stallShares[j];
  });
  return pct;
}

export function formatModelPercent(value) {
  if (value <= 0) return "0%";
  const rounded = Math.round(value * 10) / 10;
  const s = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${s}%`;
}
