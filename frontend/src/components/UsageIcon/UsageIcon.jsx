import { Box } from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import "./UsageIcon.css";

/**
 * UsageIcon
 * Shared icon-tile representing a user with a specific need.
 *
 * Variants:
 *  - "pee"   light yellow background, mid-brown person icon
 *  - "poo"   light brown background, dark-brown person icon
 *  - "empty" transparent (no icon, no border) — useful for placeholder slots
 *
 * Sizing is controlled by the parent via `className`.
 */
export default function UsageIcon({ variant = "pee", className = "" }) {
  const classes = ["usage-icon", `usage-icon-${variant}`, className]
    .filter(Boolean)
    .join(" ");

  if (variant === "empty") {
    return <Box className={classes} aria-hidden />;
  }

  return (
    <Box className={classes} role="img" aria-label={`${variant} user`}>
      <PersonIcon className="usage-icon-person" />
    </Box>
  );
}
