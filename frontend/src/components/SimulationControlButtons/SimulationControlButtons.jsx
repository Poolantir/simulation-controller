import { Button } from "@mui/material";
import "./SimulationControlButtons.css";

export default function SimulationControlButtons({ onChangeStatus }) {
  return (
    <div className="control-buttons-row">
      <Button
        type="button"
        className="control-btn control-btn-start"
        variant="outlined"
        size="small"
        onClick={() => onChangeStatus("running")}
      >
        Play
      </Button>
      <Button
        type="button"
        className="control-btn control-btn-pause"
        variant="outlined"
        size="small"
        onClick={() => onChangeStatus("paused")}
      >
        Pause
      </Button>
      <Button
        type="button"
        className="control-btn control-btn-stop"
        variant="outlined"
        size="small"
        onClick={() => onChangeStatus("stopped")}
      >
        Stop
      </Button>
    </div>
  );
}
