import { useId } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import {
  computeEmptyPeePercents,
  computeEmptyPooPercents,
  formatModelPercent,
} from "../../lib/configurationModel";
import "./ConfigurationModelDialog.css";

const SAMPLE_QUEUE_MAX = 10;
const DIAGRAM_W = 620;
const DIAGRAM_H = 150;

function CaseDiagram({ percents }) {
  const rawId = useId();
  const markerId = `cfg-model-arw-${rawId.replace(/\W/g, "")}`;
  const n = 6;
  const margin = 36;
  const fixtureAnchorY = 52;
  const userX = DIAGRAM_W / 2;
  const userY = DIAGRAM_H - 22;
  const span = DIAGRAM_W - 2 * margin;
  const xs = Array.from({ length: n }, (_, i) => margin + (span * i) / (n - 1));

  return (
    <Box className="config-model-diagram">
      <svg
        className="config-model-svg"
        viewBox={`0 0 ${DIAGRAM_W} ${DIAGRAM_H}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <defs>
          <marker
            id={markerId}
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="var(--color-gray-600)" />
          </marker>
        </defs>
        {percents.map((p, i) => {
          const x = xs[i];
          const thick = p > 0.5 ? 2 : 1;
          const opacity = p < 0.05 ? 0.22 : Math.min(0.95, 0.35 + p / 80);
          return (
            <line
              key={i}
              x1={userX}
              y1={userY}
              x2={x}
              y2={fixtureAnchorY}
              stroke="var(--color-gray-600)"
              strokeWidth={thick}
              strokeDasharray="6 5"
              strokeOpacity={opacity}
              markerEnd={`url(#${markerId})`}
            />
          );
        })}
      </svg>
    </Box>
  );
}

function FixtureRow({ toiletTypes, percents }) {
  return (
    <Box className="config-model-fixtures">
      {toiletTypes.map((raw, i) => {
        const t = String(raw).toLowerCase();
        const label = t === "stall" ? "Stall" : "Urinal";
        const p = percents[i] ?? 0;
        const pctStr = formatModelPercent(p);
        return (
          <Box key={i} className="config-model-fixture">
            <Box className="config-model-fixture-type">{label}</Box>
            <Box className="config-model-fixture-id">Toilet {i + 1}</Box>
            <Box
              className={`config-model-fixture-pct ${
                p < 0.05 ? "config-model-fixture-pct--zero" : ""
              }`}
            >
              {pctStr}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

function CaseBlock({
  title,
  userLabel,
  userClass,
  queueSample,
  branchHint,
  toiletTypes,
  percents,
  warn,
}) {
  return (
    <Box className="config-model-case">
      <Typography className="config-model-case-title" component="h3">
        {title}
      </Typography>
      <Box className="config-model-queue-label">Sample queue (current)</Box>
      <Box className="config-model-queue-row">
        {queueSample.length === 0 ? (
          <span className="config-model-queue-empty">Empty</span>
        ) : (
          queueSample.map((item) => (
            <span
              key={item.id}
              className={`config-model-queue-block config-model-queue-block--${item.type}`}
              title={item.type}
            />
          ))
        )}
      </Box>
      <Box className="config-model-next-row">
        <span className="config-model-next-label">Next user</span>
        <span className={`config-model-next-chip ${userClass}`}>{userLabel}</span>
      </Box>
      {branchHint ? (
        <Typography className="config-model-branch-hint" component="p">
          {branchHint}
        </Typography>
      ) : null}
      <CaseDiagram percents={percents} />
      <FixtureRow toiletTypes={toiletTypes} percents={percents} />
      {warn ? (
        <Typography className="config-model-warn" component="p">
          {warn}
        </Typography>
      ) : null}
    </Box>
  );
}

export default function ConfigurationModelDialog({
  open,
  onClose,
  simulationConfig,
  queue,
}) {
  const toiletTypes = simulationConfig.toiletTypes;
  const shy = simulationConfig.shyPeerPct;
  const mid = simulationConfig.middleToiletFirstChoicePct;

  const peePercents = computeEmptyPeePercents(simulationConfig);
  const pooPercents = computeEmptyPooPercents(simulationConfig);

  const stallCount = toiletTypes.filter(
    (t) => String(t).toLowerCase() === "stall"
  ).length;

  const queueSample = queue.slice(0, SAMPLE_QUEUE_MAX);

  const peeBranchHint = (() => {
    const hasS = stallCount > 0;
    const hasU =
      toiletTypes.filter((t) => String(t).toLowerCase() === "urinal").length > 0;
    if (hasS && hasU) {
      return `Route: ${shy}% shy pee-er → stalls (then first/middle/last split); ${100 - shy}% → urinals (same split). Middle-first = ${mid}% each group.`;
    }
    if (hasS && !hasU) {
      return "Only stalls configured — 100% to stall group (first/middle/last split).";
    }
    if (!hasS && hasU) {
      return "Only urinals — 100% to urinal group (first/middle/last split).";
    }
    return null;
  })();

  const pooWarn =
    stallCount === 0
      ? "No stalls in configuration — poo users have no valid target in this model."
      : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      scroll="paper"
      aria-labelledby="config-model-dialog-title"
      slotProps={{
        paper: { className: "config-model-paper" },
      }}
    >
      <DialogTitle className="config-model-title" id="config-model-dialog-title">
        Configuration model
      </DialogTitle>
      <DialogContent dividers>
        <Typography className="config-model-intro" component="p">
          Empty restroom: choice probabilities for the next user, from current
          Simulation Configuration (toilet types, shy pee-er %, middle-first %).
          Matches scheduler.md cases 1–2; sample queue shown for context only.
        </Typography>
        <Box className="config-model-params" component="div">
          <span>
            <strong>Shy pee-er → stalls:</strong> {shy}%
          </span>
          <span>
            <strong>Middle as first choice:</strong> {mid}%
          </span>
          <span>
            <strong>Layout:</strong>{" "}
            {toiletTypes
              .map((t, i) => `${i + 1}:${String(t).slice(0, 1).toUpperCase()}`)
              .join(" · ")}
          </span>
        </Box>

        <CaseBlock
          title="Case 1: Empty restroom, next user pee"
          userLabel="Pee"
          userClass="config-model-next-chip--pee"
          queueSample={queueSample}
          branchHint={peeBranchHint}
          toiletTypes={toiletTypes}
          percents={peePercents}
        />

        <CaseBlock
          title="Case 2: Empty restroom, next user poo"
          userLabel="Poo"
          userClass="config-model-next-chip--poo"
          queueSample={queueSample}
          branchHint={
            stallCount > 0
              ? "100% to stalls only (assumption 2); urinals 0%. Same first/middle/last split within stall group."
              : null
          }
          toiletTypes={toiletTypes}
          percents={pooPercents}
          warn={pooWarn}
        />

        <Typography className="config-model-footnote" component="p">
          3 fixtures in a group: ends share (100 − middle)% equally; 2 fixtures:
          50/50; 1 fixture: 100%. See specification/scheduler.md.
        </Typography>
      </DialogContent>
      <DialogActions className="config-model-actions">
        <Button type="button" variant="outlined" size="small" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
