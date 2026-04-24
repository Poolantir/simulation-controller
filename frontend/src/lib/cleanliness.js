/**
 * Cleanliness levels for restroom conditions.
 *
 * Ordered cleanest → dirtiest. Index 0 is the cap for +1 / Send Maintenance,
 * last index is the floor for −1. "Non-Existent" is excluded — locked slots
 * never participate in batch ops or dropdown choices.
 */
export const CLEANLINESS_LEVELS = [
  { value: "Clean", label: "Clean (100%)" },
  { value: "Fair", label: "Fair (75%)" },
  { value: "Dirty", label: "Dirty (50%)" },
  { value: "Horrendous", label: "Horrendous (10%)" },
  { value: "Out-of-Order", label: "Out-of-Order (0%)" },
];

export const CLEANLINESS_ORDER = CLEANLINESS_LEVELS.map((l) => l.value);

export const CLEANLINESS_LABELS = CLEANLINESS_LEVELS.reduce((acc, l) => {
  acc[l.value] = l.label;
  return acc;
}, {});

export const NON_EXISTENT_CONDITION = "Non-Existent";

/**
 * Step a condition by `delta` levels.
 *   delta = +1 → one level cleaner (toward "Clean", index 0)
 *   delta = -1 → one level dirtier (toward "Out-of-Order", last index)
 * Locked / unknown values pass through unchanged.
 */
export function bumpCondition(current, delta) {
  if (current === NON_EXISTENT_CONDITION) return current;
  const i = CLEANLINESS_ORDER.indexOf(current);
  if (i === -1) return current;
  const next = Math.max(
    0,
    Math.min(CLEANLINESS_ORDER.length - 1, i - delta)
  );
  return CLEANLINESS_ORDER[next];
}

/** Display text for a condition (falls back to the raw value). */
export function cleanlinessLabel(value) {
  if (value === NON_EXISTENT_CONDITION) return NON_EXISTENT_CONDITION;
  return CLEANLINESS_LABELS[value] ?? value;
}
