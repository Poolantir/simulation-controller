/* AI-ASSISTED
 * Simulation Controller
 * Matt Krueger, April 2026 
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
            variant={effectiveColor}
            className="stall-container-fill"
            userNumber={activeUser?.userNumber ?? null}
            durationS={activeUser?.durationS ?? null}
            busyUntilMs={activeUser?.busyUntilMs ?? null}
            flash={flash}
            forceLabeled
          />
          <Stall id={id} size="large" />
        </Box>
      </Box>
      <UsagePercentageSquare useCount={useCount} totalUses={totalUses} />
    </Box>
  );
}
