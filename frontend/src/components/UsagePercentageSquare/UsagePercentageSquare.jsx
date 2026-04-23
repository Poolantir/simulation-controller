import { Box, Typography } from "@mui/material";
import "./UsagePercentageSquare.css";

export default function UsagePercentageSquare({ percentage }) {
  return (
    <Box className="usage-square">
      <Typography className="usage-square-text">{percentage}%</Typography>
    </Box>
  );
}
