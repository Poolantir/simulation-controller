/* AI-ASSISTED
 * Simulation Controller
 * Matt Krueger, April 2026 
 */

import { Box } from "@mui/material";
import "./Stall.css";

export default function Stall({ id, size = "large" }) {
  const sizeClass = size === "small" ? "stall--small" : "stall--large";
  return (
    <Box className={`stall ${sizeClass}`}>
      <Box className="stall-left">
        <Box className="stall-base" />
        <Box className="stall-bowl" />
        {id !== "" && id !== undefined && (
          <Box className="stall-node-id">{id}</Box>
        )}
      </Box>
      <Box className="stall-right">
        <Box className="stall-handle" />
        <Box className="stall-top" />
      </Box>
    </Box>
  );
}
