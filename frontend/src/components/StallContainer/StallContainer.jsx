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
  border = "bottom",
}) {
  const showTop = border === "top" || border === "top-and-bottom";
  const showBottom = border === "bottom" || border === "top-and-bottom";

  if (outOfOrder) {
    return (
      <Box className="stall-container">
        <Box className="stall-container-left">
          {showTop && <Box className="stall-container-line" />}
          <Box className="stall-container-body stall-container-body--out-of-order">
            <UsageIcon variant="empty" className="stall-container-fill" />
            <Typography className="stall-out-of-order-label" component="span" variant="body1">
              Out-of-Order
            </Typography>
            <Stall id={id} size="large" />
          </Box>
          {showBottom && <Box className="stall-container-line" />}
        </Box>
        <UsagePercentageSquare percentage={usagePct} />
      </Box>
    );
  }

  return (
    <Box className="stall-container">
      <Box className="stall-container-left">
        {showTop && <Box className="stall-container-line" />}
        <Box className="stall-container-body">
          <UsageIcon variant={fillColor} className="stall-container-fill" />
          <Stall id={id} size="large" />
        </Box>
        {showBottom && <Box className="stall-container-line" />}
      </Box>
      <UsagePercentageSquare percentage={usagePct} alert={alert} />
    </Box>
  );
}
