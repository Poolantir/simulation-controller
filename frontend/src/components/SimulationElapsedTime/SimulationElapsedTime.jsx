import { Box, Typography } from "@mui/material";
import "./SimulationElapsedTime.css";

function splitElapsedTimeLabel(text) {
  if (!text) return { label: null, value: "" };
  const idx = text.indexOf(":");
  if (idx === -1) return { label: null, value: text };
  return {
    label: text.slice(0, idx + 1),
    value: text.slice(idx + 1).trimStart(),
  };
}

export default function SimulationElapsedTime({
  text,
  satisfiedUsers,
  totalUsers,
  unsatisfiedPct,
}) {
  const { label, value } = splitElapsedTimeLabel(text);
  const unsatisfiedDisplay =
    unsatisfiedPct !== undefined && unsatisfiedPct !== null
      ? `${Number(unsatisfiedPct).toFixed(1)}%`
      : null;

  return (
    <Box className="elapsed-time-block">
      <Typography className="elapsed-time" variant="h6">
        {label ? (
          <>
            <Box component="span" className="elapsed-time-label">
              {label}
            </Box>
            {value ? <> {value}</> : null}
          </>
        ) : (
          text
        )}
      </Typography>
      <Box className="elapsed-time-stats">
        {satisfiedUsers !== undefined && satisfiedUsers !== null && (
          <Typography className="satisfied-users" variant="h6">
            <Box component="span" className="elapsed-time-label">
              Satisfied Users:
            </Box>{" "}
            {satisfiedUsers}
          </Typography>
        )}
        {totalUsers !== undefined && totalUsers !== null && (
          <Typography className="total-users" variant="h6">
            <Box component="span" className="elapsed-time-label">
              Total Users:
            </Box>{" "}
            {totalUsers}
          </Typography>
        )}
        {unsatisfiedDisplay !== null && (
          <Typography className="unsatisfied-users" variant="h6">
            <Box component="span" className="elapsed-time-label">
              Unsatisfied Users:
            </Box>{" "}
            {unsatisfiedDisplay}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
