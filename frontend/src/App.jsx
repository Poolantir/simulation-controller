import { useState } from "react";
import { CssBaseline, ThemeProvider, createTheme, Box } from "@mui/material";
import Header from "./components/Header/Header";
import Sidebar from "./components/Sidebar/Sidebar";
import SimulationDigitalTwin from "./components/SimulationDigitalTwin/SimulationDigitalTwin";
import TestConnectionsDialog from "./components/TestConnectionsDialog/TestConnectionsDialog";
import ConfigurationModelDialog from "./components/ConfigurationModelDialog/ConfigurationModelDialog";
import {
  mockState,
  cloneDefaultSimulationConfig,
  initialRestroomConditions,
  initialStalls,
  initialUrinals,
  initialElapsedTimeText,
  initialSatisfiedUsers,
} from "./mock/mockState";

const theme = createTheme({
  palette: {
    background: { default: "#FFFFFF"},
    primary: { main: "#4B382E" },
    secondary: { main: "#C0A300" },
  },
});

let nextQueueId = mockState.queue.length + 1;

export default function App() {
  const [, setSimulationStatus] = useState("stopped");
  const [simulationConfig, setSimulationConfig] = useState(() =>
    cloneDefaultSimulationConfig()
  );
  const [queue, setQueue] = useState(mockState.queue);
  const [logs, setLogs] = useState(mockState.logs);
  const [restroomConditions, setRestroomConditions] = useState(
    () => structuredClone(mockState.restroomConditions)
  );
  const [stalls, setStalls] = useState(() =>
    mockState.stalls.map((s) => ({ ...s }))
  );
  const [urinals, setUrinals] = useState(() =>
    mockState.urinals.map((u) => ({ ...u }))
  );
  const [elapsedTimeText, setElapsedTimeText] = useState(
    mockState.elapsedTimeText
  );
  const [satisfiedUsers, setSatisfiedUsers] = useState(
    mockState.satisfiedUsers
  );
  const [testConnectionsOpen, setTestConnectionsOpen] = useState(false);
  const [configurationModelOpen, setConfigurationModelOpen] = useState(false);

  const handleSimulationConfigChange = (partial) =>
    setSimulationConfig((prev) => ({ ...prev, ...partial }));

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
    /* Restores toilet 1–3 stall / 4–6 urinal; twin separator styles follow. */
    setSimulationConfig(cloneDefaultSimulationConfig());
    setQueue([]);
    setLogs([]);
    setRestroomConditions(structuredClone(initialRestroomConditions));
    setStalls(initialStalls.map((s) => ({ ...s })));
    setUrinals(initialUrinals.map((u) => ({ ...u })));
    setElapsedTimeText(initialElapsedTimeText);
    setSatisfiedUsers(initialSatisfiedUsers);
  };

  const handleAppendLogLine = (line) => {
    setLogs((prev) => [...prev, line]);
  };

  const handleTestConnections = () => {
    setTestConnectionsOpen(true);
  };

  const handleViewConfigurationModel = () => {
    setConfigurationModelOpen(true);
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
          onViewConfigurationModel={handleViewConfigurationModel}
          onResetSimulation={handleResetSimulation}
          onTestConnections={handleTestConnections}
        />
        <ConfigurationModelDialog
          open={configurationModelOpen}
          onClose={() => setConfigurationModelOpen(false)}
          simulationConfig={simulationConfig}
          queue={queue}
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
          />
          <SimulationDigitalTwin
            elapsedTimeText={elapsedTimeText}
            satisfiedUsers={satisfiedUsers}
            queue={queue}
            toiletTypes={simulationConfig.toiletTypes}
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
