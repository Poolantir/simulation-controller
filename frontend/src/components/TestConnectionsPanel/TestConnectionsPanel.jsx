import { useState } from "react";
import { Box, Button, TextField, Typography } from "@mui/material";
import "./TestConnectionsPanel.css";

const NODE_COUNT = 6;
const LED_ACTIONS = ["R", "G", "B"];
const SERVO_ACTIONS = ["MAX", "REST"];

function NodeCard({ id, connected, onSend, onConnect, onDisconnect }) {
  const [echoMessage, setEchoMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const disabled = !connected;

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
  const sendSim = () =>
    onSend(id, { command: "TEST", type: "SIM", action: "RUN" });
  const sendEcho = () => {
    const trimmed = echoMessage.trim();
    if (!trimmed) return;
    onSend(id, { command: "ECHO", type: "MESSAGE", action: trimmed });
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
            SIMULATE
          </Typography>
          <Button
            type="button"
            size="small"
            variant="outlined"
            className="node-test-card__btn node-test-card__btn--primary node-test-card__btn--wide"
            disabled={disabled}
            onClick={sendSim}
          >
            SIMULATE
          </Button>
        </Box>

        <Box className="node-test-card__section">
          <Typography className="node-test-card__label" component="div">
            ECHO
          </Typography>
          <Box className="node-test-card__echo-row">
            <TextField
              size="small"
              fullWidth
              placeholder="Message"
              value={echoMessage}
              disabled={disabled}
              onChange={(e) => setEchoMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  sendEcho();
                }
              }}
              inputProps={{ "aria-label": `Node ${id} echo message` }}
            />
            <Button
              type="button"
              size="small"
              variant="outlined"
              className="node-test-card__btn node-test-card__btn--primary"
              disabled={disabled || !echoMessage.trim()}
              onClick={sendEcho}
            >
              Send
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default function TestConnectionsPanel({
  nodeConnections,
  onSend,
  onConnect,
  onDisconnect,
}) {
  const connections = Array.isArray(nodeConnections) ? nodeConnections : [];
  return (
    <Box className="test-connections-panel">
      <Box className="test-connections-panel__grid">
        {Array.from({ length: NODE_COUNT }, (_, i) => (
          <NodeCard
            key={i + 1}
            id={i + 1}
            connected={Boolean(connections[i])}
            onSend={onSend}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
          />
        ))}
      </Box>
    </Box>
  );
}
