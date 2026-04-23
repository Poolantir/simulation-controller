import { useCallback, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from "@mui/material";
import "./TestConnectionsDialog.css";

const NODE_COUNT = 6;

function createNodeState(id) {
  return {
    id,
    connected: false,
    outboundMessage: "",
    servo: "rest",
    led: "off",
  };
}

function NodeCard({ node, onUpdate, onAppendLog }) {
  const { id, connected, outboundMessage, servo, led } = node;

  const log = useCallback(
    (msg) => {
      onAppendLog(`[Node ${id}] ${msg}`);
    },
    [id, onAppendLog]
  );

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
          {connected ? "Connected" : "Disconnected"}
        </Typography>
      </Box>

      <Box className="node-test-card__section">
        <Typography className="node-test-card__label" component="label">
          Send message
        </Typography>
        <TextField
          size="small"
          fullWidth
          placeholder="Input text"
          value={outboundMessage}
          onChange={(e) =>
            onUpdate(id, { outboundMessage: e.target.value })
          }
        />
        <Button
          type="button"
          size="small"
          variant="outlined"
          className="node-test-card__btn node-test-card__btn--primary"
          disabled={!connected}
          onClick={() => {
            const t = outboundMessage.trim();
            const payload = t.length ? JSON.stringify(t) : "(empty)";
            log(
              `Send message: ${payload}; servo=${servo.toUpperCase()}; LED=${led.toUpperCase()}`
            );
          }}
        >
          Send
        </Button>
      </Box>

      <FormControl component="fieldset" className="node-test-card__section">
        <FormLabel component="legend" className="node-test-card__label">
          Set servo
        </FormLabel>
        <RadioGroup
          row
          name={`node-${id}-servo`}
          value={servo}
          onChange={(e) => {
            onUpdate(id, { servo: e.target.value });
          }}
        >
          <FormControlLabel value="max" control={<Radio size="small" />} label="MAX" />
          <FormControlLabel value="rest" control={<Radio size="small" />} label="REST" />
        </RadioGroup>
      </FormControl>

      <FormControl component="fieldset" className="node-test-card__section">
        <FormLabel component="legend" className="node-test-card__label">
          LED
        </FormLabel>
        <RadioGroup
          row
          name={`node-${id}-led`}
          value={led}
          onChange={(e) => {
            onUpdate(id, { led: e.target.value });
          }}
        >
          <FormControlLabel value="r" control={<Radio size="small" />} label="R" />
          <FormControlLabel value="g" control={<Radio size="small" />} label="G" />
          <FormControlLabel value="b" control={<Radio size="small" />} label="B" />
          <FormControlLabel value="off" control={<Radio size="small" />} label="Off" />
        </RadioGroup>
      </FormControl>

      <Box className="node-test-card__section">
        <Typography className="node-test-card__label" component="div">
          Test simulation
        </Typography>
        <Box className="node-test-card__row-btns">
          <Button
            type="button"
            size="small"
            variant="outlined"
            className="node-test-card__btn node-test-card__btn--primary"
            disabled={!connected}
            onClick={() => log("Test simulation A")}
          >
            Test simulation A
          </Button>
          <Button
            type="button"
            size="small"
            variant="outlined"
            className="node-test-card__btn node-test-card__btn--primary"
            disabled={!connected}
            onClick={() => log("Test simulation B")}
          >
            Test simulation B
          </Button>
        </Box>
      </Box>

      <Box className="node-test-card__row-btns">
        <Button
          type="button"
          size="small"
          variant="outlined"
          className="node-test-card__btn node-test-card__btn--primary"
          onClick={() => {
            onUpdate(id, { connected: true });
            log("Connect");
          }}
        >
          Connect
        </Button>
        <Button
          type="button"
          size="small"
          variant="outlined"
          className="node-test-card__btn node-test-card__btn--danger"
          onClick={() => {
            onUpdate(id, { connected: false });
            log("Disconnect");
          }}
        >
          Disconnect
        </Button>
      </Box>
    </Box>
  );
}

export default function TestConnectionsDialog({ open, onClose, onAppendLog }) {
  const [nodes, setNodes] = useState(() =>
    Array.from({ length: NODE_COUNT }, (_, i) => createNodeState(i + 1))
  );

  const appendLog = useCallback(
    (line) => {
      const stamp = new Date().toLocaleString();
      onAppendLog(`${line} — ${stamp}`);
    },
    [onAppendLog]
  );

  const updateNode = useCallback((id, partial) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...partial } : n))
    );
  }, []);

  const handlePingBackend = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        appendLog(`[Client] Backend health OK (${res.status})`);
      } else {
        appendLog(`[Client] Backend health HTTP ${res.status}`);
      }
    } catch (err) {
      appendLog(
        `[Client] Backend health failed — ${err?.message || "error"}`
      );
    }
  }, [appendLog]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      scroll="paper"
      aria-labelledby="test-connections-dialog-title"
      slotProps={{
        paper: { className: "test-connections-paper" },
      }}
    >
      <DialogTitle
        className="test-connections-title"
        id="test-connections-dialog-title"
      >
        Test connections
      </DialogTitle>
      <DialogContent dividers>
        <Box className="test-connections-toolbar">
          <Button
            type="button"
            size="small"
            variant="outlined"
            className="node-test-card__btn node-test-card__btn--primary"
            onClick={handlePingBackend}
          >
            Ping backend
          </Button>
          <Typography className="test-connections-toolbar-hint" component="p">
            Six nodes (toilet hardware). Actions append to Simulation log when
            useful. Connect first — send / servo / LED / simulation tests
            gated while disconnected.
          </Typography>
        </Box>
        <Box className="test-connections-grid">
          {nodes.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              onUpdate={updateNode}
              onAppendLog={appendLog}
            />
          ))}
        </Box>
      </DialogContent>
      <DialogActions className="test-connections-actions">
        <Button type="button" onClick={onClose} variant="outlined" size="small">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
