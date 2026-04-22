import { Box } from "@mui/material";
import Urinal from "../Urinal/Urinal";
import UsageIcon from "../UsageIcon/UsageIcon";
import UsagePercentageSquare from "../UsagePercentageSquare/UsagePercentageSquare";
import "./UrinalContainer.css";

export default function UrinalContainer({
  id,
  usagePct,
  fillColor = "pee",
  alert = false,
}) {
  return (
    <Box className="urinal-container">
      <Box className="urinal-container-left">
        <Box className="urinal-container-body">
          <UsageIcon variant={fillColor} className="urinal-container-fill" />
          <Urinal id={id} size="large" />
        </Box>
        <Box className="urinal-container-line" />
      </Box>
      <UsagePercentageSquare percentage={usagePct} alert={alert} />
    </Box>
  );
}
