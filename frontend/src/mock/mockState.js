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
    { id: 1, usagePct: 30 },
    { id: 2, usagePct: 32 },
    { id: 3, usagePct: 6 },
  ],

  restroomConditions: {
    stalls: [
      { id: 1, condition: "Clean (Priority 1)" },
      { id: 2, condition: "Fair (Priority 2)" },
      { id: 3, condition: "Out-of-Order (Priority N/A)" },
    ],
    urinals: [
      { id: 1, condition: "Clean (Priority 1)" },
      { id: 2, condition: "Clean (Priority 1)" },
      { id: 3, condition: "Dirty (Priority 3)" },
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
