/* AI-ASSISTED
 * Simulation Controller
 * Matt Krueger, April 2026 
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

export function cleanlinessLabel(value) {
  if (value === NON_EXISTENT_CONDITION) return NON_EXISTENT_CONDITION;
  return CLEANLINESS_LABELS[value] ?? value;
}
