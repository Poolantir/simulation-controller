/* AI-ASSISTED
 * Simulation Controller
 * Matt Krueger, April 2026 
 */

import { Button } from "@mui/material";
import "./SimulationControlButtons.css";

export default function SimulationControlButtons({
  onChangeStatus,
  simulationStatus = "paused",
}) {
  const isRunning = simulationStatus === "running";
  const isPaused = simulationStatus === "paused";
  return (
    <div className="control-buttons-row">
      <Button
        type="button"
        className={`control-btn control-btn-start${
          isRunning ? " control-btn--active" : ""
        }`}
        variant="outlined"
        size="small"
        onClick={() => onChangeStatus("running")}
        aria-pressed={isRunning}
      >
        Play
      </Button>
      <Button
        type="button"
        className={`control-btn control-btn-pause${
          isPaused ? " control-btn--active-pause" : ""
        }`}
        variant="outlined"
        size="small"
        onClick={() => onChangeStatus("paused")}
        aria-pressed={isPaused}
      >
        Pause
      </Button>
    </div>
  );
}
