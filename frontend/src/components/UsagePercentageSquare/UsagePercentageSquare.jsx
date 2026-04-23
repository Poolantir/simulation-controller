import { Box, Typography } from "@mui/material";
import "./UsagePercentageSquare.css";

export default function UsagePercentageSquare({ percentage }) {
  const display =
    typeof percentage === "number"
      ? Number.isInteger(percentage)
        ? `${percentage}.00`
        : percentage.toFixed(2)
      : String(percentage ?? 0);
  return (
    <Box className="usage-square">
      <Typography className="usage-square-text">{display}%</Typography>
    </Box>
  );
}
