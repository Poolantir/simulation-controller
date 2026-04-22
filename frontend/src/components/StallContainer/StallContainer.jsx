import { Box, Typography } from "@mui/material";
import Stall from "../Stall/Stall";
import UsageIcon from "../UsageIcon/UsageIcon";
import UsagePercentageSquare from "../UsagePercentageSquare/UsagePercentageSquare";
import "./StallContainer.css";

export default function StallContainer({
  id,
  usagePct,
  outOfOrder = false,
  fillColor = "pee",
  alert = false,
}) {
  if (outOfOrder) {
    return (
      <Box className="stall-out-of-order">
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Out-of-Order
        </Typography>
        <UsagePercentageSquare percentage={usagePct} />
      </Box>
    );
  }

  return (
    <Box className="stall-container">
      <Box className="stall-container-left">
        <Box className="stall-container-body">
          <UsageIcon variant={fillColor} className="stall-container-fill" />
          <Stall id={id} size="large" />
        </Box>
        <Box className="stall-container-line" />
      </Box>
      <UsagePercentageSquare percentage={usagePct} alert={alert} />
    </Box>
  );
}
