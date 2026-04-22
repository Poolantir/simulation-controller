import { Typography } from "@mui/material";
import "./SimulationElapsedTime.css";

export default function SimulationElapsedTime({ text }) {
  return (
    <Typography className="elapsed-time" variant="h6">
      {text}
    </Typography>
  );
}
