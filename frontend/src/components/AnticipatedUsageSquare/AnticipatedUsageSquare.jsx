import { Box, Typography } from "@mui/material";
import "./AnticipatedUsageSquare.css";

export default function AnticipatedUsageSquare({ percentage = 0 }) {
  const safe = Number.isFinite(percentage) ? percentage : 0;
  const text = safe <= 0 ? "0.00" : safe.toFixed(2);
  return (
    <Box className="anticipated-square">
      <Typography className="anticipated-square-text" component="span">
        {text}%
      </Typography>
    </Box>
  );
}
