import { useId, useMemo } from "react";
import { Box, Typography } from "@mui/material";
import Stall from "../Stall/Stall";
import Urinal from "../Urinal/Urinal";
import UsageIcon from "../UsageIcon/UsageIcon";
import {
  computeBehavioralTree,
  roundModelPercent,
} from "../../lib/behavioralModel";
import AnticipatedUsageSquare from "../AnticipatedUsageSquare/AnticipatedUsageSquare";
import "./BehavioralModel.css";

/**
 * BehavioralModel
 * Renders the two-level probability tree visual for toilet choice:
 *   User → [stall group · urinal group] → individual toilets.
 *
 * The artwork (user icon, Stall, Urinal) is absolutely positioned as HTML
 * over a viewBox-scaled SVG that draws the tree lines, dots, arrows, and
 * edge labels.
 *
 * Props:
 *  - title, subtitle       (optional headings above the diagram)
 *  - config                simulation config (toilet types, shy %, middle %)
 *  - restroomConditions    live per-toilet condition state (optional)
 *  - userType              "pee" | "poo"   – drives user icon + level-1 split
 *  - allClean              force T.C = 1 for every toilet (Case 1 / Case 2)
 *  - showToiletClassification   include "· {T.C}" in leaf edge labels
 *  - size                  "small" | "large"
 */

const VB_W = 1000;
const VB_H = 900;

const POS = {
  userCenter: { x: 60, y: 450 },
  userRect: { x: 6, y: 396, w: 108, h: 108, r: 18 },
  split: { x: 160, y: 450 },
  stallMid: { x: 360, y: 225 },
  urinalMid: { x: 360, y: 675 },
  leafDotX: 620,
  leafYs: [85, 225, 365, 535, 675, 815],
  level1LabelX: 190,
  level1LabelYs: [370, 540],
  level2LabelX: 480,
};

function pct(n, total) {
  return `${(n / total) * 100}%`;
}

export default function BehavioralModel({
  title,
  subtitle,
  config,
  restroomConditions,
  userType = "pee",
  allClean = false,
  showToiletClassification = true,
  size = "large",
}) {
  const reactId = useId();
  const markerId = `bm-arw-${reactId.replace(/\W/g, "")}`;
  const markerDimId = `bm-arw-dim-${reactId.replace(/\W/g, "")}`;

  const tree = useMemo(
    () =>
      computeBehavioralTree({
        config,
        restroomConditions,
        userType,
        allClean,
        showToiletClassification,
      }),
    [config, restroomConditions, userType, allClean, showToiletClassification]
  );

  const { toiletTypes, stallIdx, urinalIdx, groupProbs, leafPercents, labels } =
    tree;

  const stallDim = groupProbs.stall <= 0;
  const urinalDim = groupProbs.urinal <= 0;

  const level1Pairs = [
    {
      from: POS.split,
      to: POS.stallMid,
      label: labels.level1[0],
      labelY: POS.level1LabelYs[0],
      dim: stallDim,
    },
    {
      from: POS.split,
      to: POS.urinalMid,
      label: labels.level1[1],
      labelY: POS.level1LabelYs[1],
      dim: urinalDim,
    },
  ];

  const leafSpec = [];
  stallIdx.forEach((globalIdx, j) => {
    leafSpec.push({
      globalIdx,
      from: POS.stallMid,
      leafY: POS.leafYs[j],
      label: labels.stall[j],
      dim: stallDim || leafPercents[globalIdx] <= 0,
      type: "stall",
      displayId: globalIdx + 1,
    });
  });
  urinalIdx.forEach((globalIdx, j) => {
    leafSpec.push({
      globalIdx,
      from: POS.urinalMid,
      leafY: POS.leafYs[3 + j],
      label: labels.urinal[j],
      dim: urinalDim || leafPercents[globalIdx] <= 0,
      type: "urinal",
      displayId: globalIdx + 1,
    });
  });

  return (
    <Box className={`bm bm--${size}`}>
      {title || subtitle ? (
        <Box className="bm-heading" component="header">
          {title ? (
            <Typography component="h3" className="bm-title">
              {title}
            </Typography>
          ) : null}
          {title && subtitle ? (
            <span className="bm-heading-sep" aria-hidden>
              {" "}
              —{" "}
            </span>
          ) : null}
          {subtitle ? (
            <Typography component="p" className="bm-subtitle">
              {subtitle}
            </Typography>
          ) : null}
        </Box>
      ) : null}

      <Box className="bm-canvas">
        <svg
          className="bm-svg"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <marker
              id={markerId}
              markerWidth="12"
              markerHeight="12"
              refX="8.25"
              refY="4.5"
              orient="auto"
              markerUnits="userSpaceOnUse"
              overflow="visible"
            >
              <path
                d="M 0.6 1.1 L 8.25 4.5 L 0.6 7.9"
                fill="none"
                stroke="var(--color-gray-600)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </marker>
            {/* Same geometry as active marker; branch <g opacity> tints dim paths — no extra path opacity */}
            <marker
              id={markerDimId}
              markerWidth="12"
              markerHeight="12"
              refX="8.25"
              refY="4.5"
              orient="auto"
              markerUnits="userSpaceOnUse"
              overflow="visible"
            >
              <path
                d="M 0.6 1.1 L 8.25 4.5 L 0.6 7.9"
                fill="none"
                stroke="var(--color-gray-600)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </marker>
          </defs>

          {/* user rectangle (highlighted for this userType) */}
          <rect
            x={POS.userRect.x}
            y={POS.userRect.y}
            width={POS.userRect.w}
            height={POS.userRect.h}
            rx={POS.userRect.r}
            ry={POS.userRect.r}
            fill={
              userType === "poo"
                ? "var(--color-brown-light)"
                : "var(--color-yellow-light)"
            }
            stroke="var(--color-brown-dark)"
            strokeWidth="4"
          />

          {/* user → split stem */}
          <line
            x1={POS.userCenter.x + POS.userRect.w / 2}
            y1={POS.userCenter.y}
            x2={POS.split.x}
            y2={POS.split.y}
            stroke="var(--color-gray-600)"
            strokeWidth="5"
            strokeLinecap="round"
          />

          {/* Level 1 branches */}
          {level1Pairs.map((p, i) => {
            const opacity = p.dim ? 0.45 : 1;
            const d = `M ${p.from.x} ${p.from.y} C ${p.from.x + 80} ${p.from.y}, ${p.to.x - 80} ${p.to.y}, ${p.to.x - 10} ${p.to.y}`;
            return (
              <g key={`l1-${i}`} opacity={opacity}>
                <path
                  d={d}
                  fill="none"
                  stroke="var(--color-gray-600)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  markerEnd={`url(#${p.dim ? markerDimId : markerId})`}
                />
                <text
                  x={POS.level1LabelX}
                  y={p.labelY}
                  textAnchor="middle"
                  className="bm-edge-label"
                  opacity={opacity}
                >
                  {p.label}
                </text>
              </g>
            );
          })}

          {/* Level 2 leaf branches */}
          {leafSpec.map((L, i) => {
            const opacity = L.dim ? 0.45 : 1;
            const c1x = L.from.x + 80;
            const c1y = L.from.y;
            const c2x = POS.leafDotX - 80;
            const c2y = L.leafY;
            const d = `M ${L.from.x} ${L.from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${POS.leafDotX - 10} ${L.leafY}`;
            const labelX = POS.level2LabelX;
            // Push label outward (away from the curve) rather than sitting on it.
            // Upward branches → above (−42); downward → below (+42);
            // straight (centre) → just below the line (+22) so it reads naturally.
            const dy = L.leafY - L.from.y;
            const labelY =
              (L.from.y + L.leafY) / 2 +
              (Math.abs(dy) <= 20 ? 28 : dy > 0 ? 42 : -42);
            return (
              <g key={`l2-${i}`} opacity={opacity}>
                <path
                  d={d}
                  fill="none"
                  stroke="var(--color-gray-600)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  markerEnd={`url(#${L.dim ? markerDimId : markerId})`}
                />
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  className="bm-edge-label bm-edge-label--small"
                  opacity={opacity}
                >
                  {L.label}
                </text>
              </g>
            );
          })}

          {/* horizontal separator lines between leaves (from PNG) */}
          {[0, 1, 2, 3, 4].map((k) => {
            const y = (POS.leafYs[k] + POS.leafYs[k + 1]) / 2;
            return (
              <line
                key={`sep-${k}`}
                x1={POS.leafDotX + 40}
                y1={y}
                x2={VB_W - 20}
                y2={y}
                stroke="var(--color-border)"
                strokeWidth="2"
              />
            );
          })}
        </svg>

        {/* HTML overlay: user icon + leaves (Stall/Urinal + Total %) */}
        <Box className="bm-overlay">
          <Box
            className="bm-user"
            style={{
              left: pct(POS.userCenter.x, VB_W),
              top: pct(POS.userCenter.y, VB_H),
            }}
          >
            <UsageIcon
              variant={userType === "poo" ? "poo" : "pee"}
              className="bm-user-icon"
            />
          </Box>

          {leafSpec.map((L, i) => (
            <Box
              key={`leaf-${i}`}
              className={`bm-leaf ${L.dim ? "bm-leaf--dim" : ""}`}
              style={{
                top: pct(L.leafY, VB_H),
              }}
            >
              <Box className="bm-leaf-art-wrap">
                {L.type === "stall" ? (
                  <Box className="bm-leaf-art">
                    <Stall id={L.displayId} size="large" />
                  </Box>
                ) : (
                  <Box className="bm-leaf-art">
                    <Urinal id={L.displayId} size="large" />
                  </Box>
                )}
              </Box>
              <Box className="bm-leaf-usage">
                <AnticipatedUsageSquare
                  percentage={roundModelPercent(
                    leafPercents[L.globalIdx] ?? 0
                  )}
                />
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      {toiletTypes.length === 0 ? (
        <Typography component="p" className="bm-empty">
          No toilets configured.
        </Typography>
      ) : null}
    </Box>
  );
}
