import { Box } from "@mui/material";
import "./Urinal.css";

/**
 * Urinal component
 * @param {object} props
 * @param {string|number} [props.id]
 * @param {"small"|"large"} [props.size="large"] - "large" for digital-twin
 *   rendering, "small" for compact sidebar / legend usage.
 */
export default function Urinal({ id, size = "large" }) {
  const sizeClass = size === "small" ? "urinal--small" : "urinal--large";
  return (
    <Box className={`urinal ${sizeClass}`}>
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
