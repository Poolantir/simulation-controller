import { useState } from "react";
import { CssBaseline, ThemeProvider, createTheme, Box } from "@mui/material";
import Header from "./components/Header/Header";
import Sidebar from "./components/Sidebar/Sidebar";
import SimulationDigitalTwin from "./components/SimulationDigitalTwin/SimulationDigitalTwin";
import { mockState, defaultSimulationConfig } from "./mock/mockState";

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
  const [simulationConfig, setSimulationConfig] = useState(defaultSimulationConfig);
  const [queue, setQueue] = useState(mockState.queue);
  const [logs, setLogs] = useState(mockState.logs);

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
        <Header />
        <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <Sidebar
            restroomConditions={mockState.restroomConditions}
            logs={logs}
            onClearLogs={handleClearLogs}
            onChangeStatus={setSimulationStatus}
            simulationConfig={simulationConfig}
            onSimulationConfigChange={handleSimulationConfigChange}
          />
          <SimulationDigitalTwin
            elapsedTimeText={mockState.elapsedTimeText}
            satisfiedUsers={mockState.satisfiedUsers}
            queue={queue}
            stalls={mockState.stalls}
            urinals={mockState.urinals}
            onAddPee={handleAddPee}
            onAddPoo={handleAddPoo}
            onClearQueue={handleClearQueue}
          />
        </Box>
      </Box>
    </ThemeProvider>
  );
}
