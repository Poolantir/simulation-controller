import { Box, Button } from "@mui/material";
import "./Header.css";

export default function Header({
  onViewBehavioralModel,
  onResetSimulation,
  onTestConnections,
}) {
  return (
    <Box className="header" component="header">
      <img
        className="header-logo"
        src="/poolantir-simulation-logo.svg"
        alt="Poolantir Simulation"
      />
      <Box className="header-actions">
        <Button
          type="button"
          className="header-action-btn"
          variant="outlined"
          size="small"
          onClick={onViewBehavioralModel}
        >
          View Behavioral Model
        </Button>
        <Button
          type="button"
          className="header-action-btn"
          variant="outlined"
          size="small"
          onClick={onResetSimulation}
        >
          Reset Simulation
        </Button>
        <Button
          type="button"
          className="header-action-btn"
          variant="outlined"
          size="small"
          onClick={onTestConnections}
        >
          Test Connections
        </Button>
      </Box>
    </Box>
  );
}
