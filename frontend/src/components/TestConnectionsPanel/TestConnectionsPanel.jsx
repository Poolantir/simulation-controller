import { useEffect, useState } from "react";
import { Box, Button, TextField, Typography } from "@mui/material";
import "./TestConnectionsPanel.css";

const NODE_COUNT = 6;
const LED_ACTIONS = ["R", "G", "B"];
const SERVO_ACTIONS = ["MAX", "REST"];

const FLASH_IN_RANGE_MIN = 20;
const FLASH_IN_RANGE_MAX = 2000;

/* ── COMMANDS.md-aligned payload builders ── */

function buildSimNew(userId, durationS) {
  return {
    command: "SIM",
    id: String(userId),
    type: "NEW",
    action: { duration_s: durationS },
  };
}

function buildTestQueueRun() {
  return { command: "TEST", id: "", type: "QUEUE", action: "RUN" };
}

function buildFlashInRangeMm(mm) {
  return { command: "FLASH", id: "", type: "IN_RANGE", action: mm };
}

/* ── helpers ── */

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randDuration() {
  return +(Math.random() * 8 + 2).toFixed(1);
}

function clamp(val, lo, hi) {
  return Math.max(lo, Math.min(hi, val));
}

/* ── Flash All Nodes strip (above the grid) ── */

function FlashAllStrip({ nodeConnections, onSend }) {
  const [inRange, setInRange] = useState("");
  const [busy, setBusy] = useState(false);

  const hasAnyConnected =
    Array.isArray(nodeConnections) && nodeConnections.some(Boolean);

  const sendToAllConnected = async (buildPayload) => {
    setBusy(true);
    try {
      for (let i = 0; i < NODE_COUNT; i++) {
        if (nodeConnections[i]) {
          await onSend(i + 1, buildPayload());
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const handleInRange = () => {
    const val = clamp(Number(inRange), FLASH_IN_RANGE_MIN, FLASH_IN_RANGE_MAX);
    setInRange(String(val));
    return sendToAllConnected(() => buildFlashInRangeMm(val));
  };

  return (
    <Box className="flash-all-strip">
      <Typography className="flash-all-strip__title" component="div">
        Flash All Nodes
      </Typography>
      <Box className="flash-all-strip__controls">
        <Box className="flash-all-strip__field">
          <Typography className="flash-all-strip__field-label" component="span">
            IN_RANGE_MM
          </Typography>
          <TextField
            size="small"
            type="number"
            value={inRange}
            onChange={(e) => setInRange(e.target.value)}
            inputProps={{ min: FLASH_IN_RANGE_MIN, max: FLASH_IN_RANGE_MAX }}
            disabled={busy}
            className="flash-all-strip__input"
          />
          <Button
            size="small"
            variant="outlined"
            className="node-test-card__btn node-test-card__btn--primary node-test-card__btn--inline"
            disabled={busy || !hasAnyConnected || !inRange}
            onClick={handleInRange}
          >
            Set
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

/* ── Per-node test card ── */

function NodeCard({ id, connected, flashParams, onSend, onConnect, onDisconnect }) {
  const [busy, setBusy] = useState(false);
  const [inRange, setInRange] = useState("");
  const disabled = !connected;

  useEffect(() => {
    if (flashParams?.IN_RANGE != null) {
      setInRange(String(flashParams.IN_RANGE));
    }
  }, [flashParams?.IN_RANGE]);

  const handleConnect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConnect(id);
    } finally {
      setBusy(false);
    }
  };
  const handleDisconnect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onDisconnect(id);
    } finally {
      setBusy(false);
    }
  };

  const sendLed = (action) =>
    onSend(id, { command: "TEST", type: "LED", action });
  const sendServo = (action) =>
    onSend(id, { command: "TEST", type: "SERVO", action });

  const scheduleUsage = () => {
    const userId = randInt(1, 9999);
    const duration = randDuration();
    onSend(id, buildSimNew(userId, duration));
  };

  const sendQueue = () => onSend(id, buildTestQueueRun());

  const handleSetInRange = () => {
    const val = clamp(Number(inRange), FLASH_IN_RANGE_MIN, FLASH_IN_RANGE_MAX);
    setInRange(String(val));
    onSend(id, buildFlashInRangeMm(val));
  };

  return (
    <Box className="node-test-card">
      <Box className="node-test-card__head">
        <Typography className="node-test-card__title" component="div">
          Node {id}
        </Typography>
        <Typography
          className={`node-test-card__status ${
            connected
              ? "node-test-card__status--on"
              : "node-test-card__status--off"
          }`}
          component="span"
        >
          <span className="node-test-card__status-dot" aria-hidden="true" />
          {connected ? "Connected" : "Disconnected"}
        </Typography>
      </Box>

      <Box className="node-test-card__section">
        <Typography className="node-test-card__label" component="div">
          CONNECTION
        </Typography>
        <Box className="node-test-card__row-btns">
          <Button
            type="button"
            size="small"
            variant="outlined"
            className="node-test-card__btn node-test-card__btn--primary"
            disabled={busy || connected}
            onClick={handleConnect}
          >
            Connect
          </Button>
          <Button
            type="button"
            size="small"
            variant="outlined"
            className="node-test-card__btn node-test-card__btn--primary"
            disabled={busy || !connected}
            onClick={handleDisconnect}
          >
            Disconnect
          </Button>
        </Box>
      </Box>

      <Box className="node-test-card__bench">
        <Box className="node-test-card__section">
          <Typography className="node-test-card__label" component="div">
            LED
          </Typography>
          <Box className="node-test-card__row-btns">
            {LED_ACTIONS.map((action) => (
              <Button
                key={action}
                type="button"
                size="small"
                variant="outlined"
                className="node-test-card__btn node-test-card__btn--primary"
                disabled={disabled}
                onClick={() => sendLed(action)}
              >
                {action}
              </Button>
            ))}
          </Box>
        </Box>

        <Box className="node-test-card__section">
          <Typography className="node-test-card__label" component="div">
            SERVO
          </Typography>
          <Box className="node-test-card__row-btns">
            {SERVO_ACTIONS.map((action) => (
              <Button
                key={action}
                type="button"
                size="small"
                variant="outlined"
                className="node-test-card__btn node-test-card__btn--primary"
                disabled={disabled}
                onClick={() => sendServo(action)}
              >
                {action}
              </Button>
            ))}
          </Box>
        </Box>

        <Box className="node-test-card__section">
          <Typography className="node-test-card__label" component="div">
            SCHEDULE USAGE
          </Typography>
          <Box className="node-test-card__row-btns">
            <Button
              type="button"
              size="small"
              variant="outlined"
              className="node-test-card__btn node-test-card__btn--primary"
              disabled={disabled}
              onClick={scheduleUsage}
            >
              Schedule Usage
            </Button>
            <Button
              type="button"
              size="small"
              variant="outlined"
              className="node-test-card__btn node-test-card__btn--primary"
              disabled={disabled}
              onClick={sendQueue}
            >
              Send Queue
            </Button>
          </Box>
        </Box>

        <Box className="node-test-card__section">
          <Typography className="node-test-card__label" component="div">
            IN_RANGE_MM
          </Typography>
          <Box className="node-test-card__row-btns">
            <TextField
              size="small"
              type="number"
              value={inRange}
              disabled={disabled}
              onChange={(e) => setInRange(e.target.value)}
              inputProps={{
                min: FLASH_IN_RANGE_MIN,
                max: FLASH_IN_RANGE_MAX,
                "aria-label": `Node ${id} IN_RANGE_MM`,
              }}
            />
            <Button
              type="button"
              size="small"
              variant="outlined"
              className="node-test-card__btn node-test-card__btn--primary"
              disabled={disabled || !inRange}
              onClick={handleSetInRange}
            >
              Set
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default function TestConnectionsPanel({
  nodeConnections,
  nodeFlashParams,
  onSend,
  onConnect,
  onDisconnect,
}) {
  const connections = Array.isArray(nodeConnections) ? nodeConnections : [];
  const flashParams = nodeFlashParams || {};
  return (
    <Box className="test-connections-panel">
      <FlashAllStrip nodeConnections={connections} onSend={onSend} />

      <Box className="test-connections-panel__grid">
        {Array.from({ length: NODE_COUNT }, (_, i) => (
          <NodeCard
            key={i + 1}
            id={i + 1}
            connected={Boolean(connections[i])}
            flashParams={flashParams[i + 1]}
            onSend={onSend}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
          />
        ))}
      </Box>
    </Box>
  );
}
