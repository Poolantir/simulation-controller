/**
 * Restroom presets — facility-backed layouts for the 6-slot toilet column.
 *
 * Each preset returns a fixed-length (6) array of slot tokens:
 *   - "stall"       → render stall fixture, participate in stall probabilities
 *   - "urinal"      → render urinal fixture, participate in urinal probabilities
 *   - "nonexistent" → slot is locked; rendered as a "Non-Existent" rectangle,
 *                     excluded from scheduler math, condition forced to "Non-Existent".
 *
 * Slot index i ↔ fixture id (i + 1). This matches the existing stall ids 1..3
 * and urinal ids 4..6 in mock state.
 */

export const RESTROOM_PRESETS = {
  maclean_2m: {
    id: "maclean_2m",
    label: "MacLean Hall 2nd Floor Mens Restroom",
    toiletTypes: ["stall", "stall", "stall", "urinal", "urinal", "urinal"],
  },
  seamen_1m: {
    id: "seamen_1m",
    label: "Seamen Center 1st Floor Mens Restroom",
    toiletTypes: ["stall", "stall", "nonexistent", "urinal", "urinal", "nonexistent"],
  },
};

export const DEFAULT_RESTROOM_PRESET = "maclean_2m";

export function toiletTypesForPreset(presetId) {
  const preset = RESTROOM_PRESETS[presetId] ?? RESTROOM_PRESETS[DEFAULT_RESTROOM_PRESET];
  return [...preset.toiletTypes];
}

export function restroomPresetOptions() {
  return Object.values(RESTROOM_PRESETS).map((p) => ({
    id: p.id,
    label: p.label,
  }));
}

/** Global-slot indices (0-based) that are locked to "nonexistent" for this preset. */
export function nonexistentSlotIndices(presetId) {
  return toiletTypesForPreset(presetId)
    .map((t, i) => (t === "nonexistent" ? i : -1))
    .filter((i) => i >= 0);
}
