import { Box } from "@mui/material";
import Urinal from "../Urinal/Urinal";
import UsageIcon from "../UsageIcon/UsageIcon";
import UsagePercentageSquare from "../UsagePercentageSquare/UsagePercentageSquare";
import "./UrinalContainer.css";

export default function UrinalContainer({
  id,
  usagePct,
  fillColor = "pee",
  activeUser = null,
  useCount = 0,
  totalUses = 0,
}) {
  return (
    <Box className="urinal-container">
      <Box className="urinal-container-left">
        <Box className="urinal-container-body">
          <UsageIcon
            variant={fillColor}
            className="urinal-container-fill"
            userNumber={activeUser?.userNumber ?? null}
            durationS={activeUser?.durationS ?? null}
            busyUntilMs={activeUser?.busyUntilMs ?? null}
            forceLabeled
          />
          <Urinal id={id} size="large" />
        </Box>
      </Box>
      <UsagePercentageSquare useCount={useCount} totalUses={totalUses} />
    </Box>
  );
}
