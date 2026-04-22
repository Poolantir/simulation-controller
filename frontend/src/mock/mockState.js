export const defaultSimulationConfig = {
  toiletTypes: ["stall", "stall", "stall", "urinal", "urinal", "urinal"],
  shyPeerPct: 5,
  middleToiletFirstChoicePct: 2,
};

export const mockState = {
  elapsedTimeText: "Simulation Time Elapsed: 1hr 20min",

  queue: [
    { id: 1, type: "poo" },
    { id: 2, type: "pee" },
    { id: 3, type: "pee" },
    { id: 4, type: "pee" },
    { id: 5, type: "pee" },
    { id: 6, type: "pee" },
    { id: 7, type: "pee" },
    { id: 8, type: "pee" },
  ],

  stalls: [
    { id: 1, usagePct: 12 },
    { id: 2, usagePct: 20 },
    { id: 3, usagePct: 0, outOfOrder: true },
  ],

  urinals: [
    { id: 4, usagePct: 30 },
    { id: 5, usagePct: 32 },
    { id: 6, usagePct: 6 },
  ],

  restroomConditions: {
    stalls: [
      { id: 1, condition: "Clean" },
      { id: 2, condition: "Fair" },
      { id: 3, condition: "Out-of-Order" },
    ],
    urinals: [
      { id: 4, condition: "Clean" },
      { id: 5, condition: "Clean" },
      { id: 6, condition: "Dirty" },
    ],
  },

  logs: [
    "[Server] Started Simulation 4/26/2024 2:59:40 pm",
    "[User] Added 1 Pee 4/26/2024 2:59:40 pm",
    "[User] Added 1 Poo 4/26/2024 2:59:40 pm",
    "[User] Added 1 Pee 4/26/2024 2:59:40 pm",
    "[User] Added 1 Pee 4/26/2024 2:59:40 pm",
    "[User] Added 1 Pee 4/26/2024 2:59:40 pm",
    "[User] Added 1 Pee 4/26/2024 2:59:40 pm",
  ],
};
