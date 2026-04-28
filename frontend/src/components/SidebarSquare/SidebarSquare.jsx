/* AI-ASSISTED
 * Simulation Controller
 * Matt Krueger, April 2026 
 */

import { Box, Typography } from "@mui/material";
import "./SidebarSquare.css";

export default function SidebarSquare({
  title,
  flex = 1,
  children,
  className = "",
  /** "auto" | "hidden" | "visible" — pass "hidden" when content should fit without scroll */
  contentOverflow = "auto",
  /** When true, card height follows content (no flex growth); use for compact panels */
  hugContent = false,
}) {
  const rootClass = ["sidebar-square", className].filter(Boolean).join(" ");
  const rootFlex = hugContent ? "0 0 auto" : flex;

  return (
    <Box className={rootClass} sx={{ flex: rootFlex }}>
      <Typography
        className="sidebar-square-title"
        variant="subtitle1"
        component="span"
        sx={{ margin: 0 }}
      >
        {title}
      </Typography>
      <Box
        sx={{
          flex: hugContent ? "0 0 auto" : 1,
          minHeight: hugContent ? "auto" : 0,
          overflow: contentOverflow,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
