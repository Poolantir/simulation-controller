/* AI-ASSISTED
 * Simulation Controller
 * Matt Krueger, April 2026 
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Box } from "@mui/material";
import UsageIcon from "../UsageIcon/UsageIcon";
import "./AssignmentPreviewOverlay.css";

const ARROW_HEAD_LEN = 12;
const ARROW_HEAD_WIDTH = 9;

function computeGeometry(root, transfer) {
  const rootRect = root.getBoundingClientRect();
  const queueEl = root.querySelector(
    `[data-queue-item-id="${transfer.queueItemId}"]`
  );
  const fixtureEl = root.querySelector(
    `[data-fixture-id="${transfer.fixtureId}"]`
  );
  if (!queueEl || !fixtureEl) return null;
  const q = queueEl.getBoundingClientRect();
  const f = fixtureEl.getBoundingClientRect();
  const startX = q.right - rootRect.left;
  const startY = q.top + q.height / 2 - rootRect.top;
  const endX = f.left - rootRect.left;
  const endY = f.top + f.height / 2 - rootRect.top;
  return { startX, startY, endX, endY };
}

function arrowHeadPoints(p) {
  const dx = p.endX - p.startX;
  const dy = p.endY - p.startY;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const baseX = p.endX - ux * ARROW_HEAD_LEN;
  const baseY = p.endY - uy * ARROW_HEAD_LEN;
  const leftX = baseX + px * (ARROW_HEAD_WIDTH / 2);
  const leftY = baseY + py * (ARROW_HEAD_WIDTH / 2);
  const rightX = baseX - px * (ARROW_HEAD_WIDTH / 2);
  const rightY = baseY - py * (ARROW_HEAD_WIDTH / 2);
  return `${p.endX},${p.endY} ${leftX},${leftY} ${rightX},${rightY}`;
}

export default function AssignmentPreviewOverlay({
  rootRef,
  pendingTransfers,
  simNowMs = null,
  isPaused = false,
}) {
  const transfers = useMemo(
    () => (Array.isArray(pendingTransfers) ? pendingTransfers : []),
    [pendingTransfers]
  );
  const [paths, setPaths] = useState({});
  const [size, setSize] = useState({ width: 0, height: 0 });
  const rafRef = useRef(0);

  useLayoutEffect(() => {
    const root = rootRef?.current;
    if (!root) return undefined;
    const measure = () => {
      const rect = root.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
      const next = {};
      for (const t of transfers) {
        const geo = computeGeometry(root, t);
        if (geo) next[`${t.queueItemId}-${t.fixtureId}`] = geo;
      }
      setPaths(next);
    };
    const schedule = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };
    measure();
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(schedule);
      ro.observe(root);
    }
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (ro) ro.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [rootRef, transfers]);

  useEffect(() => {
    if (transfers.length === 0) return undefined;
    const root = rootRef?.current;
    if (!root) return undefined;
    const interval = setInterval(() => {
      const rect = root.getBoundingClientRect();
      setSize((prev) =>
        prev.width === rect.width && prev.height === rect.height
          ? prev
          : { width: rect.width, height: rect.height }
      );
      const next = {};
      for (const t of transfers) {
        const geo = computeGeometry(root, t);
        if (geo) next[`${t.queueItemId}-${t.fixtureId}`] = geo;
      }
      setPaths((prev) => {
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(next);
        if (prevKeys.length !== nextKeys.length) return next;
        for (const k of nextKeys) {
          const a = prev[k];
          const b = next[k];
          if (
            !a ||
            a.startX !== b.startX ||
            a.startY !== b.startY ||
            a.endX !== b.endX ||
            a.endY !== b.endY
          ) {
            return next;
          }
        }
        return prev;
      });
    }, 150);
    return () => clearInterval(interval);
  }, [rootRef, transfers]);

  if (transfers.length === 0) return null;

  return (
    <Box className="assignment-preview-overlay" aria-hidden>
      <svg
        className="assignment-preview-overlay__svg"
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width || 1} ${size.height || 1}`}
      >
        {transfers.map((t) => {
          const key = `${t.queueItemId}-${t.fixtureId}`;
          const p = paths[key];
          if (!p) return null;
          return (
            <g key={key} className="assignment-preview-overlay__arrow">
              <line
                x1={p.startX}
                y1={p.startY}
                x2={p.endX}
                y2={p.endY}
                className="assignment-preview-overlay__line"
              />
              <polygon
                points={arrowHeadPoints(p)}
                className="assignment-preview-overlay__head"
              />
            </g>
          );
        })}
      </svg>
      {transfers.map((t) => {
        const key = `${t.queueItemId}-${t.fixtureId}`;
        const p = paths[key];
        if (!p) return null;
        const wall = simNowMs != null ? simNowMs : Date.now();
        const elapsed =
          simNowMs != null && t.simStartMs != null
            ? Math.max(0, simNowMs - t.simStartMs)
            : Math.max(0, wall - (t.startedAt || wall));
        const remaining = Math.max(0, t.durationMs - elapsed);
        return (
          <Box
            key={`marker-${key}`}
            className="assignment-preview-marker"
            style={{
              "--preview-start-x": `${p.startX}px`,
              "--preview-start-y": `${p.startY}px`,
              "--preview-end-x": `${p.endX}px`,
              "--preview-end-y": `${p.endY}px`,
              "--preview-duration": `${remaining}ms`,
              "--preview-delay": `${-elapsed}ms`,
              animationPlayState: isPaused ? "paused" : "running",
            }}
          >
            <UsageIcon
              variant={t.userType}
              className="assignment-preview-marker__tile"
              userNumber={t.queueItemId}
              durationS={t.userDurationS ?? null}
              forceLabeled
            />
          </Box>
        );
      })}
    </Box>
  );
}
