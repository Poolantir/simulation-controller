import { Box } from "@mui/material";
import "./Urinal.css";

export default function Urinal({ id, mini = false }) {
  return (
    <Box className={`urinal ${mini ? "urinal-mini" : ""}`}>
      <Box className="urinal-bowl" />
      <Box className="urinal-base-wrapper">
        <Box className="urinal-base" />
        {id !== undefined && id !== "" && (
          <Box className="urinal-node-id">{id}</Box>
        )}
      </Box>
    </Box>
  );
}
