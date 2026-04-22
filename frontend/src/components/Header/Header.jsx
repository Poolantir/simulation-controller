import { Box } from "@mui/material";
import "./Header.css";

export default function Header() {
  return (
    <Box className="header">
      <img
        className="header-logo"
        src="/poolantir-simulation-logo.svg"
        alt="Poolantir Simulation"
      />
    </Box>
  );
}
