import { Box, Typography } from "@mui/material";
import "./SidebarSquare.css";

export default function SidebarSquare({ title, flex = 1, children }) {
  return (
    <Box className="sidebar-square" sx={{ flex }}>
      <Typography className="sidebar-square-title" variant="subtitle1">
        {title}
      </Typography>
      <Box sx={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {children}
      </Box>
    </Box>
  );
}
