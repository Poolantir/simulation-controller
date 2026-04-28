/* AI-ASSISTED
 * Simulation Controller
 * Matt Krueger, April 2026 
 */

const T_C_BY_CONDITION = {
  Clean: 1.0,
  Fair: 0.75,
  Dirty: 0.5,
  Horrendous: 0.1,
  "In-Use": 0,
  "Out-of-Order": 0,
  "Currently Being Cleaned": 0,
  "Non-Existent": 0,
};

export function toiletCleanlinessWeight(condition) {
  if (condition == null) return 1;
  return T_C_BY_CONDITION[condition] ?? 1;
}

export function shareForGroup(count, middlePct) {
  const m = Math.min(100, Math.max(0, middlePct)) / 100;
  if (count <= 0) return [];
  if (count === 1) return [1];
  if (count === 2) return [0.5, 0.5];
  if (count === 3) {
    const side = (1 - m) / 2;
    return [side, m, side];
  }
  return Array.from({ length: count }, () => 1 / count);
}

export function computeBehavioralTree({
  config,
  restroomConditions,
  userType = "pee",
  allClean = false,
  showToiletClassification = true,
}) {
  const toiletTypes = config.toiletTypes.map((t) => String(t).toLowerCase());
  const stallIdx = toiletTypes
    .map((t, i) => (t === "stall" ? i : -1))
    .filter((i) => i >= 0);
  const urinalIdx = toiletTypes
    .map((t, i) => (t === "urinal" ? i : -1))
    .filter((i) => i >= 0);

  const conditionFor = (globalIdx) => {
    const type = toiletTypes[globalIdx];
    if (type !== "stall" && type !== "urinal") return "Non-Existent";
    if (allClean) return "Clean";
    if (!restroomConditions) return "Clean";
    const pool =
      type === "stall" ? restroomConditions.stalls : restroomConditions.urinals;
    const entry = pool?.find(
      (x) => x.id === globalIdx + 1 || x.id === String(globalIdx + 1)
    );
    return entry?.condition ?? "Clean";
  };

  const shy = Math.min(100, Math.max(0, config.shyPeerPct)) / 100;

  let groupProbStall;
  let groupProbUrinal;
  if (userType === "poo") {
    groupProbStall = stallIdx.length > 0 ? 1 : 0;
    groupProbUrinal = 0;
  } else {
    if (stallIdx.length === 0) {
      groupProbStall = 0;
      groupProbUrinal = urinalIdx.length > 0 ? 1 : 0;
    } else if (urinalIdx.length === 0) {
      groupProbStall = 1;
      groupProbUrinal = 0;
    } else {
      groupProbStall = shy;
      groupProbUrinal = 1 - shy;
    }
  }

  const stallShares = shareForGroup(
    stallIdx.length,
    config.middleToiletFirstChoicePct
  );
  const urinalShares = shareForGroup(
    urinalIdx.length,
    config.middleToiletFirstChoicePct
  );

  const stallTC = stallIdx.map((i) => toiletCleanlinessWeight(conditionFor(i)));
  const urinalTC = urinalIdx.map((i) =>
    toiletCleanlinessWeight(conditionFor(i))
  );

  const stallWeights = stallShares.map((s, j) => s * stallTC[j]);
  const urinalWeights = urinalShares.map((s, j) => s * urinalTC[j]);
  const stallSum = stallWeights.reduce((a, b) => a + b, 0);
  const urinalSum = urinalWeights.reduce((a, b) => a + b, 0);

  const stallNorm = stallWeights.map((w) =>
    stallSum > 0 ? w / stallSum : 0
  );
  const urinalNorm = urinalWeights.map((w) =>
    urinalSum > 0 ? w / urinalSum : 0
  );

  const leafPercents = new Array(toiletTypes.length).fill(0);
  stallIdx.forEach((idx, j) => {
    leafPercents[idx] = groupProbStall * stallNorm[j] * 100;
  });
  urinalIdx.forEach((idx, j) => {
    leafPercents[idx] = groupProbUrinal * urinalNorm[j] * 100;
  });

  const level1Labels = [
    formatModelPercent(groupProbStall * 100),
    formatModelPercent(groupProbUrinal * 100),
  ];

  const level2StallLabels = stallNorm.map((v) =>
    formatModelPercent(v * 100)
  );
  const level2UrinalLabels = urinalNorm.map((v) =>
    formatModelPercent(v * 100)
  );

  void showToiletClassification;

  return {
    toiletTypes,
    stallIdx,
    urinalIdx,
    groupProbs: { stall: groupProbStall, urinal: groupProbUrinal },
    leafPercents,
    labels: {
      level1: level1Labels,
      stall: level2StallLabels,
      urinal: level2UrinalLabels,
    },
  };
}

export function roundModelPercent(value) {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100) / 100;
}

export function formatModelPercent(value) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "0%";
  const rounded = Math.round(value * 10) / 10;
  const s = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${s}%`;
}

