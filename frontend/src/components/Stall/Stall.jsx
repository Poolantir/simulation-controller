import { Box } from "@mui/material";
import "./Stall.css";

export default function Stall({ id, mini = false }) {
  return (
    <Box className={`stall ${mini ? "stall-mini" : ""}`}>
      <Box className="stall-left">
        <Box className="stall-base" />
        <Box className="stall-bowl" />
        {id !== "" && <Box className="stall-node-id">{id}</Box>}
      </Box>
      <Box className="stall-right">
        <Box className="stall-handle" />
        <Box className="stall-top" />
      </Box>
    </Box>
  );
}
