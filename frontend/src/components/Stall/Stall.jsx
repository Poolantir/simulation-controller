import { Box } from "@mui/material";
import "./Stall.css";

/**
 * Stall component
 * @param {object} props
 * @param {string|number} [props.id]
 * @param {"small"|"large"} [props.size="large"] - "large" for digital-twin
 *   rendering, "small" for compact sidebar / legend usage.
 */
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
