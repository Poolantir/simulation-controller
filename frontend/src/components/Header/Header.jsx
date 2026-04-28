/* AI-ASSISTED
 * Simulation Controller
 * Matt Krueger, April 2026 
 */

import { Box, Button } from "@mui/material";
import "./Header.css";

export default function Header({
  onViewBehavioralModel,
  onResetSimulation,
  appMode,
  onAppModeChange,
}) {
  const isSim = appMode === "SIM";
  const isTest = appMode === "TEST";
  const isDummy = appMode === "DUMMY";

  return (
    <Box className="header" component="header">
      <Box className="header-leading-actions">
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
      </Box>
      <img
        className="header-logo"
        src="/poolantir-simulation-logo.svg"
        alt="Poolantir Simulation"
      />
      <Box className="header-actions">
        <Box className="header-mode-group" role="group" aria-label="App mode">
          <Button
            type="button"
            className={`header-action-btn header-mode-btn${
              isSim ? " header-mode-btn--active" : ""
            }`}
            variant={isSim ? "contained" : "outlined"}
            size="small"
            aria-pressed={isSim}
            onClick={() => onAppModeChange("SIM")}
          >
            Sim Mode
          </Button>
          <Button
            type="button"
            className={`header-action-btn header-mode-btn${
              isTest ? " header-mode-btn--active" : ""
            }`}
            variant={isTest ? "contained" : "outlined"}
            size="small"
            aria-pressed={isTest}
            onClick={() => onAppModeChange("TEST")}
          >
            Test Mode
          </Button>
          <Button
            type="button"
            className={`header-action-btn header-mode-btn${
              isDummy ? " header-mode-btn--active" : ""
            }`}
            variant={isDummy ? "contained" : "outlined"}
            size="small"
            aria-pressed={isDummy}
            onClick={() => onAppModeChange("DUMMY")}
          >
            Dummy Mode
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
