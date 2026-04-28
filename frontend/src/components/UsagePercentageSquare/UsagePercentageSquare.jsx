/* AI-ASSISTED
 * Simulation Controller
 * Matt Krueger, April 2026 
 */

import { Box, Typography } from "@mui/material";
import "./UsagePercentageSquare.css";

export default function UsagePercentageSquare({
  useCount = 0,
  totalUses = 0,
}) {
  const safeUses = Number.isFinite(useCount) ? useCount : 0;
  const safeTotal = Number.isFinite(totalUses) ? totalUses : 0;
  const pct = safeTotal > 0 ? (safeUses / safeTotal) * 100 : 0;
  const pctText = Number.isInteger(pct) ? `${pct}.00` : pct.toFixed(2);
  return (
    <Box className="usage-square">
      <Typography className="usage-square-row" component="span">
        <span className="usage-square-value">{pctText}%</span>
      </Typography>
      <Typography className="usage-square-row" component="span">
        <span className="usage-square-label">Total Uses:</span>{" "}
        <span className="usage-square-value">{safeUses}</span>
      </Typography>
    </Box>
  );
}
