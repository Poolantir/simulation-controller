/* AI-ASSISTED
 * Simulation Controller
 * Matt Krueger, April 2026 
 */

import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { getFirebaseApp, getDb, firebaseConfig, FIREBASE_DATABASE_ID } from "../../lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import "./TestConnectionsPanel.css";

const NODE_COUNT = 6;
const LED_ACTIONS = ["R", "G", "B"];
const SERVO_ACTIONS = ["MAX", "REST"];

const FLASH_IN_RANGE_MIN = 20;
const FLASH_IN_RANGE_MAX = 2000;

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

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randDuration() {
  return +(Math.random() * 8 + 2).toFixed(1);
}

function clamp(val, lo, hi) {
  return Math.max(lo, Math.min(hi, val));
}

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

const LOG_OK = "ok";
const LOG_ERR = "err";
const LOG_PENDING = "pending";

function LogLine({ status, children }) {
  const color =
    status === LOG_OK
      ? "success.main"
      : status === LOG_ERR
        ? "error.main"
        : "text.secondary";
  return (
    <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.75rem", color }}>
      {children}
      {status === LOG_PENDING && "..."}
    </Typography>
  );
}

function FirebaseTestStrip() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [docs, setDocs] = useState(null);
  const [running, setRunning] = useState(false);

  const addLog = (key, text, status) =>
    setLogs((prev) => {
      const exists = prev.findIndex((l) => l.key === key);
      const entry = { key, text, status };
      if (exists >= 0) {
        const copy = [...prev];
        copy[exists] = entry;
        return copy;
      }
      return [...prev, entry];
    });

  const handleOpen = async () => {
    setOpen(true);
    setLogs([]);
    setDocs(null);
    setRunning(true);

    addLog("init", "Initializing Firebase app", LOG_PENDING);
    try {
      getFirebaseApp();
      addLog("init", `Firebase app initialized (project: ${firebaseConfig.projectId})`, LOG_OK);
    } catch (err) {
      addLog("init", `Firebase init failed: ${err.message}`, LOG_ERR);
      setRunning(false);
      return;
    }

    const dbLabel = FIREBASE_DATABASE_ID === "(default)" ? "(default)" : FIREBASE_DATABASE_ID;
    addLog("db", `Connecting to Firestore database "${dbLabel}"`, LOG_PENDING);
    let db;
    try {
      db = getDb();
      addLog("db", `Firestore connected (database: "${dbLabel}")`, LOG_OK);
    } catch (err) {
      addLog("db", `Firestore connection failed: ${err.message}`, LOG_ERR);
      setRunning(false);
      return;
    }

    addLog("stalls", 'Accessing "stalls"', LOG_PENDING);
    try {
      const snap = await getDocs(collection(db, "stalls"));
      const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      addLog("stalls", `Access: success (${results.length} documents)`, LOG_OK);
      setDocs(results);
    } catch (err) {
      addLog("stalls", `Access failed: ${err.message}`, LOG_ERR);
    }
    setRunning(false);
  };

  return (
    <>
      <Box className="flash-all-strip">
        <Typography className="flash-all-strip__title" component="div">
          Firebase
        </Typography>
        <Button
          size="small"
          variant="outlined"
          className="node-test-card__btn node-test-card__btn--primary"
          onClick={handleOpen}
          disabled={running}
        >
          Test Connection
        </Button>
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Firebase Test
          <IconButton
            aria-label="close"
            onClick={() => setOpen(false)}
            sx={{ position: "absolute", right: 8, top: 8 }}
            size="small"
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {logs.map((l) => (
              <LogLine key={l.key} status={l.status}>
                {l.text}
              </LogLine>
            ))}
          </Box>

          {docs && docs.length > 0 && (
            <>
              <Typography
                variant="subtitle2"
                sx={{ mt: 2, mb: 0.5, fontWeight: 700 }}
              >
                Stalls (raw)
              </Typography>
              <Box
                component="pre"
                sx={{
                  fontSize: "0.7rem",
                  overflow: "auto",
                  maxHeight: 400,
                  m: 0,
                  p: 1,
                  background: "rgba(0,0,0,0.04)",
                  borderRadius: 1,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {JSON.stringify(docs, null, 2)}
              </Box>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

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
      <Box className="test-connections-panel__toolbar">
        <FlashAllStrip nodeConnections={connections} onSend={onSend} />
        <FirebaseTestStrip />
      </Box>

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
