import { Button } from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import StopIcon from "@mui/icons-material/Stop";
import RefreshIcon from "@mui/icons-material/Refresh";
import "./SimulationControlButtons.css";

export default function SimulationControlButtons({ status, onChangeStatus }) {
  return (
    <div className="control-buttons-row">
      <Button
        className="control-btn control-btn-start"
        variant="contained"
        disableElevation
        onClick={() => onChangeStatus("running")}
      >
        <PlayArrowIcon />
      </Button>
      <Button
        className="control-btn control-btn-pause"
        variant="contained"
        disableElevation
        onClick={() => onChangeStatus("paused")}
      >
        <PauseIcon />
      </Button>
      <Button
        className="control-btn control-btn-stop"
        variant="contained"
        disableElevation
        onClick={() => onChangeStatus("stopped")}
      >
        <StopIcon />
      </Button>
      <Button
        className="control-btn control-btn-replay"
        variant="contained"
        disableElevation
        onClick={() => onChangeStatus("replay")}
      >
        <RefreshIcon />
      </Button>
    </div>
  );
}
