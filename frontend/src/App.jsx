import { useState } from "react";
import { CssBaseline, ThemeProvider, createTheme, Box } from "@mui/material";
import Header from "./components/Header/Header";
import Sidebar from "./components/Sidebar/Sidebar";
import SimulationDigitalTwin from "./components/SimulationDigitalTwin/SimulationDigitalTwin";
import { mockState } from "./mock/mockState";

const theme = createTheme({
  palette: {
    background: { default: "#FFFFFF" },
    primary: { main: "#4B382E" },
    secondary: { main: "#C0A300" },
  },
});

let nextQueueId = mockState.queue.length + 1;

export default function App() {
  const [simulationStatus, setSimulationStatus] = useState("stopped");
  const [queue, setQueue] = useState(mockState.queue);
  const [logs] = useState(mockState.logs);

  const handleAddPee = () => {
    setQueue((prev) => [...prev, { id: nextQueueId++, type: "pee" }]);
  };

  const handleAddPoo = () => {
    setQueue((prev) => [...prev, { id: nextQueueId++, type: "poo" }]);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          height: "100vh",
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
            simulationStatus={simulationStatus}
            onChangeStatus={setSimulationStatus}
          />
          <SimulationDigitalTwin
            elapsedTimeText={mockState.elapsedTimeText}
            queue={queue}
            stalls={mockState.stalls}
            urinals={mockState.urinals}
            onAddPee={handleAddPee}
            onAddPoo={handleAddPoo}
          />
        </Box>
      </Box>
    </ThemeProvider>
  );
}
