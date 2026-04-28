/* AI-ASSISTED
 * Simulation Controller
 * Matt Krueger, April 2026 
 */

import { useEffect, useState } from "react";
import { Box } from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import "./UsageIcon.css";

export default function UsageIcon({
  variant = "pee",
  className = "",
  userNumber = null,
  durationS = null,
  busyUntilMs = null,
  /** When set, countdown uses this instead of `Date.now()` (simulation clock). */
  clockNowMs = null,
  forceLabeled = false,
  flash = null,
}) {
  const flashClass =
    flash === "success"
      ? "usage-icon--flash-success"
      : flash === "danger"
      ? "usage-icon--flash-danger"
      : "";
  const classes = [
    "usage-icon",
    `usage-icon-${variant}`,
    flashClass,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (variant === "empty") {
    return <Box className={classes} aria-hidden />;
  }

  const hasLabel =
    forceLabeled ||
    userNumber != null ||
    durationS != null ||
    busyUntilMs != null;

  if (hasLabel) {
    const ariaParts = [];
    if (userNumber != null) ariaParts.push(`user ${userNumber}`);
    ariaParts.push(`${variant} user`);
    return (
      <Box
        className={`${classes} usage-icon--labeled`}
        role="img"
        aria-label={ariaParts.join(", ")}
      >
        {userNumber != null ? (
          <span className="usage-icon-number">#{userNumber}</span>
        ) : null}
        <UsageIconTimer
          durationS={durationS}
          busyUntilMs={busyUntilMs}
          clockNowMs={clockNowMs}
        />
      </Box>
    );
  }

  return (
    <Box className={classes} role="img" aria-label={`${variant} user`}>
      <PersonIcon className="usage-icon-person" />
    </Box>
  );
}

function UsageIconTimer({ durationS, busyUntilMs, clockNowMs = null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (busyUntilMs == null) return undefined;
    if (clockNowMs != null) return undefined;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [busyUntilMs, clockNowMs]);

  const wallNow = clockNowMs != null ? clockNowMs : now;

  let remaining;
  if (busyUntilMs != null) {
    remaining = Math.max(0, (busyUntilMs - wallNow) / 1000);
  } else if (durationS != null) {
    remaining = Math.max(0, durationS);
  } else {
    return null;
  }

  return <span className="usage-icon-timer">{formatSeconds(remaining)}</span>;
}

function formatSeconds(s) {
  if (!Number.isFinite(s)) return "";
  if (s >= 1) {
    const rounded = Math.round(s);
    if (Math.abs(s - rounded) < 0.05) return `${rounded}s`;
  }
  return `${Math.max(0, s).toFixed(1)}s`;
}
