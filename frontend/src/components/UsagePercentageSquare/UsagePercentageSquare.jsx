import { Box, Typography } from "@mui/material";
import "./UsagePercentageSquare.css";

/**
 * Per-fixture stats tile displayed next to each stall/urinal. Shows
 * the fixture's share of total completed occupancies (across every
 * toilet, stalls + urinals) and its absolute use count. Both default
 * to 0 before the first completion so the tile stays rendered from
 * session start.
 */
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
