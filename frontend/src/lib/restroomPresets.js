/* AI-ASSISTED
 * Simulation Controller
 * Matt Krueger, April 2026 
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

export function nonexistentSlotIndices(presetId) {
  return toiletTypesForPreset(presetId)
    .map((t, i) => (t === "nonexistent" ? i : -1))
    .filter((i) => i >= 0);
}
