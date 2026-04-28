/* AI-ASSISTED
 * Simulation Controller
 * Matt Krueger, April 2026 
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import Urinal from "../Urinal/Urinal";
import UsageIcon from "../UsageIcon/UsageIcon";
import UsagePercentageSquare from "../UsagePercentageSquare/UsagePercentageSquare";
import "./UrinalContainer.css";

export default function UrinalContainer({
  id,
  usagePct,
  outOfOrder = false,
  fillColor = "pee",
  activeUser = null,
  useCount = 0,
  totalUses = 0,
}) {
  const prevPctRef = useRef(usagePct);
  const prevColorRef = useRef(fillColor);
  const [localFlash, setLocalFlash] = useState(null);

  useLayoutEffect(() => {
    const wasOccupied = prevPctRef.current > 0;
    const prevColor = prevColorRef.current;
    prevPctRef.current = usagePct;
    prevColorRef.current = fillColor;
    if (wasOccupied && usagePct === 0 && !outOfOrder && !activeUser) {
      setLocalFlash({
        fillColor: prevColor !== "empty" ? prevColor : "pee",
        until: Date.now() + 1000,
      });
    } else if (usagePct > 0) {
      setLocalFlash(null);
    }
  }, [usagePct, outOfOrder, activeUser, fillColor]);

  useEffect(() => {
    if (!localFlash) return;
    const delay = Math.max(0, localFlash.until - Date.now());
    const timer = setTimeout(() => setLocalFlash(null), delay);
    return () => clearTimeout(timer);
  }, [localFlash]);

  const dummyFlash = activeUser?.exitState === "completed" ? "success" : null;
  const flash = dummyFlash || (localFlash ? "success" : null);
  const effectiveColor = localFlash ? localFlash.fillColor : fillColor;

  if (outOfOrder) {
    return (
      <Box className="urinal-container">
        <Box className="urinal-container-left">
          <Box className="urinal-container-body urinal-container-body--out-of-order">
            <UsageIcon variant="empty" className="urinal-container-fill" />
            <Typography
              className="urinal-out-of-order-label"
              component="span"
              variant="body1"
            >
              Out-of-Order
            </Typography>
            <Urinal id={id} size="large" />
          </Box>
        </Box>
        <UsagePercentageSquare useCount={useCount} totalUses={totalUses} />
      </Box>
    );
  }

  return (
    <Box className="urinal-container">
      <Box className="urinal-container-left">
        <Box className="urinal-container-body">
          <UsageIcon
            variant={effectiveColor}
            className="urinal-container-fill"
            userNumber={activeUser?.userNumber ?? null}
            durationS={activeUser?.durationS ?? null}
            busyUntilMs={activeUser?.busyUntilMs ?? null}
            flash={flash}
            forceLabeled
          />
          <Urinal id={id} size="large" />
        </Box>
      </Box>
      <UsagePercentageSquare useCount={useCount} totalUses={totalUses} />
    </Box>
  );
}
