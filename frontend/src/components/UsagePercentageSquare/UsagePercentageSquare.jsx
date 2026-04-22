import { Box, Typography } from "@mui/material";
import "./UsagePercentageSquare.css";

export default function UsagePercentageSquare({ percentage, alert = false }) {
  return (
    <Box className={`usage-square ${alert ? "usage-square-alert" : ""}`}>
      <Typography className="usage-square-text">{percentage}%</Typography>
    </Box>
  );
}
