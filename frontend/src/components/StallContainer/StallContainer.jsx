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
  activeUser = null,
  useCount = 0,
  totalUses = 0,
}) {
  if (outOfOrder) {
    return (
      <Box className="stall-container">
        <Box className="stall-container-left">
          <Box className="stall-container-body stall-container-body--out-of-order">
            <UsageIcon variant="empty" className="stall-container-fill" />
            <Typography className="stall-out-of-order-label" component="span" variant="body1">
              Out-of-Order
            </Typography>
            <Stall id={id} size="large" />
          </Box>
        </Box>
        <UsagePercentageSquare useCount={useCount} totalUses={totalUses} />
      </Box>
    );
  }

  return (
    <Box className="stall-container">
      <Box className="stall-container-left">
        <Box className="stall-container-body">
          <UsageIcon
            variant={fillColor}
            className="stall-container-fill"
            userNumber={activeUser?.userNumber ?? null}
            durationS={activeUser?.durationS ?? null}
            busyUntilMs={activeUser?.busyUntilMs ?? null}
            forceLabeled
          />
          <Stall id={id} size="large" />
        </Box>
      </Box>
      <UsagePercentageSquare useCount={useCount} totalUses={totalUses} />
    </Box>
  );
}
