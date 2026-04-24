import { useMemo, useState } from "react";
import { CssBaseline, ThemeProvider, createTheme, Box } from "@mui/material";
import Header from "./components/Header/Header";
import Sidebar from "./components/Sidebar/Sidebar";
import SimulationDigitalTwin from "./components/SimulationDigitalTwin/SimulationDigitalTwin";
import TestConnectionsDialog from "./components/TestConnectionsDialog/TestConnectionsDialog";
import BehavioralModelDialog from "./components/BehavioralModelDialog/BehavioralModelDialog";
import {
  DEFAULT_RESTROOM_PRESET,
  toiletTypesForPreset,
} from "./lib/restroomPresets";
import {
  bumpCondition,
  NON_EXISTENT_CONDITION,
} from "./lib/cleanliness";

const theme = createTheme({
  palette: {
    background: { default: "#FFFFFF"},
    primary: { main: "#4B382E" },
    secondary: { main: "#C0A300" },
  },
});

const INITIAL_ELAPSED_TIME_TEXT = "Simulation Time Elapsed: 0min";
const INITIAL_SATISFIED_USERS = 0;

/**
 * Build a clean restroom-conditions / fixture state from a preset.
 * "Clean" for active slots, "Non-Existent" for locked ones; usage at 0.
 * Stall ids = 1..3, urinal ids = 4..6 (slot index + 1).
 */
function buildInitialRestroomState(presetId) {
  const types = toiletTypesForPreset(presetId);
  const conditionFor = (idx) =>
    types[idx] === "nonexistent" ? "Non-Existent" : "Clean";
  return {
    restroomConditions: {
      stalls: [1, 2, 3].map((id) => ({ id, condition: conditionFor(id - 1) })),
      urinals: [4, 5, 6].map((id) => ({ id, condition: conditionFor(id - 1) })),
    },
    stalls: [1, 2, 3].map((id) => ({ id, usagePct: 0 })),
    urinals: [4, 5, 6].map((id) => ({ id, usagePct: 0 })),
  };
}

const INITIAL_SIM_CONFIG = {
  restroomPreset: DEFAULT_RESTROOM_PRESET,
  shyPeerPct: 5,
  middleToiletFirstChoicePct: 2,
};

let nextQueueId = 1;

export default function App() {
  const [, setSimulationStatus] = useState("stopped");
  const [simulationConfig, setSimulationConfig] = useState(() => ({
    ...INITIAL_SIM_CONFIG,
  }));
  const [queue, setQueue] = useState([]);
  const [logs, setLogs] = useState([]);
  const initialFixtures = useMemo(
    () => buildInitialRestroomState(DEFAULT_RESTROOM_PRESET),
    []
  );
  const [restroomConditions, setRestroomConditions] = useState(
    () => initialFixtures.restroomConditions
  );
  const [stalls, setStalls] = useState(() => initialFixtures.stalls);
  const [urinals, setUrinals] = useState(() => initialFixtures.urinals);
  const [elapsedTimeText, setElapsedTimeText] = useState(
    INITIAL_ELAPSED_TIME_TEXT
  );
  const [satisfiedUsers, setSatisfiedUsers] = useState(INITIAL_SATISFIED_USERS);
  const [testConnectionsOpen, setTestConnectionsOpen] = useState(false);
  const [behavioralModelOpen, setBehavioralModelOpen] = useState(false);

  const toiletTypes = useMemo(
    () => toiletTypesForPreset(simulationConfig.restroomPreset),
    [simulationConfig.restroomPreset]
  );

  const handleSimulationConfigChange = (partial) => {
    if (
      partial.restroomPreset != null &&
      partial.restroomPreset !== simulationConfig.restroomPreset
    ) {
      syncStateForPreset(partial.restroomPreset);
    }
    setSimulationConfig((prev) => ({ ...prev, ...partial }));
  };

  /**
   * Align conditions + twin fixture usage with the preset's nonexistent slots.
   * Fixture id === global slot index + 1, so stall id 3 and urinal id 6 are
   * the locked slots in the Seamen preset. Switching back to a layout where
   * those slots are active resets them to "Clean" with zero usage.
   */
  const syncStateForPreset = (presetId) => {
    const types = toiletTypesForPreset(presetId);
    setRestroomConditions((prev) => ({
      stalls: prev.stalls.map((s) => {
        const idx = s.id - 1;
        if (types[idx] === "nonexistent") {
          return { ...s, condition: "Non-Existent" };
        }
        return s.condition === "Non-Existent" ? { ...s, condition: "Clean" } : s;
      }),
      urinals: prev.urinals.map((u) => {
        const idx = u.id - 1;
        if (types[idx] === "nonexistent") {
          return { ...u, condition: "Non-Existent" };
        }
        return u.condition === "Non-Existent" ? { ...u, condition: "Clean" } : u;
      }),
    }));
    setStalls((prev) =>
      prev.map((s) =>
        types[s.id - 1] === "nonexistent"
          ? { ...s, usagePct: 0, outOfOrder: false }
          : s
      )
    );
    setUrinals((prev) =>
      prev.map((u) =>
        types[u.id - 1] === "nonexistent"
          ? { ...u, usagePct: 0, outOfOrder: false }
          : u
      )
    );
  };

  /**
   * Update a single fixture's condition.
   * `kind` is the restroomConditions key ("stalls" | "urinals"); `id` is the
   * fixture id (1..6). Non-existent slots are immutable.
   */
  const handleConditionChange = (kind, id, condition) => {
    setRestroomConditions((prev) => ({
      ...prev,
      [kind]: prev[kind].map((x) =>
        x.id === id && x.condition !== NON_EXISTENT_CONDITION
          ? { ...x, condition }
          : x
      ),
    }));
  };

  /** Step every existing toilet by `delta` cleanliness levels. */
  const bumpAllConditions = (delta) => {
    setRestroomConditions((prev) => ({
      stalls: prev.stalls.map((s) => ({
        ...s,
        condition: bumpCondition(s.condition, delta),
      })),
      urinals: prev.urinals.map((u) => ({
        ...u,
        condition: bumpCondition(u.condition, delta),
      })),
    }));
  };

  const handleIncreaseCleanlinessAll = () => bumpAllConditions(+1);
  const handleDecreaseCleanlinessAll = () => bumpAllConditions(-1);

  /** Reset every existing toilet to "Clean"; non-existent slots stay locked. */
  const handleSendMaintenance = () => {
    setRestroomConditions((prev) => ({
      stalls: prev.stalls.map((s) =>
        s.condition === NON_EXISTENT_CONDITION ? s : { ...s, condition: "Clean" }
      ),
      urinals: prev.urinals.map((u) =>
        u.condition === NON_EXISTENT_CONDITION ? u : { ...u, condition: "Clean" }
      ),
    }));
  };

  const handleAddPee = () => {
    setQueue((prev) => [{ id: nextQueueId++, type: "pee" }, ...prev]);
  };

  const handleAddPoo = () => {
    setQueue((prev) => [{ id: nextQueueId++, type: "poo" }, ...prev]);
  };

  const handleClearQueue = () => {
    setQueue([]);
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  const handleResetSimulation = () => {
    nextQueueId = 1;
    setSimulationStatus("stopped");
    setSimulationConfig({ ...INITIAL_SIM_CONFIG });
    setQueue([]);
    setLogs([]);
    const fresh = buildInitialRestroomState(DEFAULT_RESTROOM_PRESET);
    setRestroomConditions(fresh.restroomConditions);
    setStalls(fresh.stalls);
    setUrinals(fresh.urinals);
    setElapsedTimeText(INITIAL_ELAPSED_TIME_TEXT);
    setSatisfiedUsers(INITIAL_SATISFIED_USERS);
  };

  const handleAppendLogLine = (line) => {
    setLogs((prev) => [...prev, line]);
  };

  const handleTestConnections = () => {
    setTestConnectionsOpen(true);
  };

  const handleViewBehavioralModel = () => {
    setBehavioralModelOpen(true);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          height: "100vh",
          width: "100%",
          maxWidth: "120rem",
          mx: "auto",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          bgcolor: "background.default",
        }}
      >
        <Header
          onViewBehavioralModel={handleViewBehavioralModel}
          onResetSimulation={handleResetSimulation}
          onTestConnections={handleTestConnections}
        />
        <BehavioralModelDialog
          open={behavioralModelOpen}
          onClose={() => setBehavioralModelOpen(false)}
          simulationConfig={simulationConfig}
          restroomConditions={restroomConditions}
        />
        <TestConnectionsDialog
          open={testConnectionsOpen}
          onClose={() => setTestConnectionsOpen(false)}
          onAppendLog={handleAppendLogLine}
        />
        <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <Sidebar
            restroomConditions={restroomConditions}
            logs={logs}
            onClearLogs={handleClearLogs}
            onChangeStatus={setSimulationStatus}
            simulationConfig={simulationConfig}
            onSimulationConfigChange={handleSimulationConfigChange}
            onConditionChange={handleConditionChange}
            onIncreaseCleanlinessAll={handleIncreaseCleanlinessAll}
            onDecreaseCleanlinessAll={handleDecreaseCleanlinessAll}
            onSendMaintenance={handleSendMaintenance}
          />
          <SimulationDigitalTwin
            elapsedTimeText={elapsedTimeText}
            satisfiedUsers={satisfiedUsers}
            queue={queue}
            toiletTypes={toiletTypes}
            stalls={stalls}
            urinals={urinals}
            onAddPee={handleAddPee}
            onAddPoo={handleAddPoo}
            onClearQueue={handleClearQueue}
          />
        </Box>
      </Box>
    </ThemeProvider>
  );
}
