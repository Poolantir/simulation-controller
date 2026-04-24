import { useEffect, useState } from "react";
import { Box } from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import "./UsageIcon.css";

/**
 * UsageIcon
 * Shared tile representing a user.
 *
 * Variants:
 *  - "pee"   light yellow background
 *  - "poo"   light brown background
 *  - "empty" transparent (no content, no border) — placeholder slots
 *
 * Rendering modes:
 *  - Label mode (digital twin): when any of `userNumber`, `durationS`,
 *    `busyUntilMs` is provided, the tile shows the user's ordinal as
 *    the primary label and a timer below it. When `busyUntilMs` is
 *    set, the timer counts down in real time until it hits zero; when
 *    only `durationS` is set, the label is static.
 *  - Icon mode (behavioral model / legacy): falls back to the MUI
 *    Person icon so the Behavioral Model dialog's user glyph is
 *    unchanged.
 *
 * Sizing is controlled by the parent via `className`.
 */
export default function UsageIcon({
  variant = "pee",
  className = "",
  userNumber = null,
  durationS = null,
  busyUntilMs = null,
  /** When set, countdown uses this instead of `Date.now()` (simulation clock). */
  clockNowMs = null,
  forceLabeled = false,
}) {
  const classes = ["usage-icon", `usage-icon-${variant}`, className]
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

/**
 * Internal helper that renders the duration label under the user
 * number. If `busyUntilMs` is provided the label counts down in real
 * time (4 Hz); otherwise it renders the static sampled `durationS`.
 */
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
