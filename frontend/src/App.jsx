import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CssBaseline, ThemeProvider, createTheme, Box } from "@mui/material";
import Header from "./components/Header/Header";
import Sidebar from "./components/Sidebar/Sidebar";
import SimulationDigitalTwin from "./components/SimulationDigitalTwin/SimulationDigitalTwin";
import TestConnectionsPanel from "./components/TestConnectionsPanel/TestConnectionsPanel";
import BehavioralModelDialog from "./components/BehavioralModelDialog/BehavioralModelDialog";
import {
  DEFAULT_RESTROOM_PRESET,
  toiletTypesForPreset,
} from "./lib/restroomPresets";
import {
  bumpCondition,
  NON_EXISTENT_CONDITION,
} from "./lib/cleanliness";
import {
  connectNode,
  disconnectNode,
  emptyConnections,
  openNodeStatusStream,
  sendToNode,
} from "./lib/nodesApi";
import {
  clearSchedulerQueue,
  enqueueUser,
  openSchedulerStream,
  resetScheduler,
  schedulerSnapshotToFrontendState,
  setSchedulerMode,
  updateSchedulerConfig,
} from "./lib/schedulerApi";
import { transferFromPreviewEvent } from "./lib/assignmentPreview";

const theme = createTheme({
  palette: {
    background: { default: "#FFFFFF"},
    primary: { main: "#4B382E" },
    secondary: { main: "#C0A300" },
  },
});

const INITIAL_ELAPSED_TIME_TEXT = "Simulation Time Elapsed: 0min";
const INITIAL_SATISFIED_USERS = 0;
const INITIAL_USERS_ENTERED = 0;
const NODE_COUNT = 6;
const APP_MODE_SIM = "SIM";
const APP_MODE_TEST = "TEST";
const APP_MODE_DUMMY = "DUMMY";

/**
 * Build a clean restroom-conditions / fixture state from a preset.
 * "Clean" for active slots, "Non-Existent" for locked ones; usage at 0.
 * Stall ids = 1..3, urinal ids = 4..6 (slot index + 1).
 */
function buildInitialRestroomState(presetId) {
  const types = toiletTypesForPreset(presetId);
  const conditionFor = (idx) =>
    types[idx] === "nonexistent" ? "Non-Existent" : "Clean";
  return {
    restroomConditions: {
      stalls: [1, 2, 3].map((id) => ({ id, condition: conditionFor(id - 1) })),
      urinals: [4, 5, 6].map((id) => ({ id, condition: conditionFor(id - 1) })),
    },
    stalls: [1, 2, 3].map((id) => ({ id, usagePct: 0 })),
    urinals: [4, 5, 6].map((id) => ({ id, usagePct: 0 })),
  };
}

const INITIAL_SIM_CONFIG = {
  restroomPreset: DEFAULT_RESTROOM_PRESET,
  shyPeerPct: 5,
  middleToiletFirstChoicePct: 2,
};

const EMPTY_DUMMY_FIXTURES = {
  stalls: [1, 2, 3].map((id) => ({ id, usagePct: 0, outOfOrder: false })),
  urinals: [4, 5, 6].map((id) => ({ id, usagePct: 0, outOfOrder: false })),
};

let nextQueueId = 1;

export default function App() {
  const [, setSimulationStatus] = useState("stopped");
  const [simulationConfig, setSimulationConfig] = useState(() => ({
    ...INITIAL_SIM_CONFIG,
  }));
  const [queue, setQueue] = useState([]);
  const [logs, setLogs] = useState([]);
  const initialFixtures = useMemo(
    () => buildInitialRestroomState(DEFAULT_RESTROOM_PRESET),
    []
  );
  const [restroomConditions, setRestroomConditions] = useState(
    () => initialFixtures.restroomConditions
  );
  const [stalls, setStalls] = useState(() => initialFixtures.stalls);
  const [urinals, setUrinals] = useState(() => initialFixtures.urinals);
  const [elapsedTimeText, setElapsedTimeText] = useState(
    INITIAL_ELAPSED_TIME_TEXT
  );
  const [satisfiedUsers, setSatisfiedUsers] = useState(INITIAL_SATISFIED_USERS);
  const [simUsersEntered, setSimUsersEntered] = useState(INITIAL_USERS_ENTERED);
  const [appMode, setAppMode] = useState(APP_MODE_SIM);
  const [behavioralModelOpen, setBehavioralModelOpen] = useState(false);
  const [nodeConnections, setNodeConnections] = useState(() =>
    emptyConnections()
  );

  // Backend Dummy Mode state — hydrated from the scheduler SSE stream.
  // Separate from local sim state so switching modes doesn't clobber
  // either side.
  const [dummyQueue, setDummyQueue] = useState([]);
  const [dummyStalls, setDummyStalls] = useState(EMPTY_DUMMY_FIXTURES.stalls);
  const [dummyUrinals, setDummyUrinals] = useState(
    EMPTY_DUMMY_FIXTURES.urinals
  );
  const [dummySatisfiedUsers, setDummySatisfiedUsers] = useState(0);
  const [dummyUsersEntered, setDummyUsersEntered] = useState(0);
  // Active queue -> toilet preview animations (3 s each). Keyed by
  // (queueItemId, fixtureId) so a fixture can only host one preview.
  // Hydrated from the SSE stream's `assignment_preview` events and
  // cleared on `assignment_started` / `assignment_preview_cancelled` /
  // snapshot replacement.
  const [pendingTransfers, setPendingTransfers] = useState([]);

  // Keep a ref of current appMode for async callbacks that mustn't
  // capture a stale value (SSE handlers and log emitters).
  const appModeRef = useRef(appMode);
  useEffect(() => {
    appModeRef.current = appMode;
  }, [appMode]);

  useEffect(() => {
    const close = openNodeStatusStream(
      (next) => setNodeConnections(next),
      (evt) => {
        const stamp = new Date().toLocaleString();
        const body =
          evt && evt.payload && typeof evt.payload === "object"
            ? JSON.stringify(evt.payload)
            : evt?.raw ?? "";
        setLogs((prev) => [
          ...prev,
          `[Node ${evt?.node_id ?? "?"}] <- ${body} - ${stamp}`,
        ]);
      }
    );
    return close;
  }, []);

  // Subscribe to the scheduler SSE stream so the digital twin reflects
  // live queue/occupancy in Dummy Mode. We stay subscribed regardless
  // of mode so the UI can hydrate the moment the user switches to
  // Dummy, but we only render dummy state in render when active.
  useEffect(() => {
    const applySnapshot = (snap) => {
      const mapped = schedulerSnapshotToFrontendState(snap);
      if (!mapped) return;
      setDummyQueue(mapped.queue);
      setDummyStalls(mapped.stalls);
      setDummyUrinals(mapped.urinals);
      setDummySatisfiedUsers(mapped.satisfiedUsers);
      // Hydrate preview animations from the authoritative snapshot so
      // a page refresh in the middle of a preview still shows arrows.
      setPendingTransfers(
        Array.isArray(mapped.pendingTransfers) ? mapped.pendingTransfers : []
      );
      const active = [...mapped.stalls, ...mapped.urinals].filter(
        (f) => Number(f?.usagePct) > 0
      ).length;
      setDummyUsersEntered((prev) =>
        Math.max(prev, mapped.satisfiedUsers + mapped.queue.length + active)
      );
    };
    const close = openSchedulerStream((event, data) => {
      const stamp = new Date().toLocaleString();
      if (event === "scheduler_state") {
        applySnapshot(data);
        return;
      }
      if (event === "queue_updated") {
        const q = Array.isArray(data?.queue) ? data.queue : [];
        setDummyQueue(
          q.map((x) => ({ id: Number(x.id), type: String(x.type) }))
        );
        return;
      }
      if (event === "assignment_preview") {
        const transfer = transferFromPreviewEvent(data);
        if (!transfer) return;
        setPendingTransfers((prev) => {
          // Deduplicate on fixture id: a new preview on the same
          // fixture should supersede any lingering stale transfer.
          const filtered = prev.filter(
            (t) =>
              t.fixtureId !== transfer.fixtureId &&
              t.queueItemId !== transfer.queueItemId
          );
          return [...filtered, transfer];
        });
        if (appModeRef.current === APP_MODE_DUMMY) {
          const kind = data?.fixture_kind || "fixture";
          const u = data?.user_type || "user";
          setLogs((prev) => [
            ...prev,
            `[Dummy] ${u}-er previewing -> ${kind} ${transfer.fixtureId} - ${stamp}`,
          ]);
        }
        return;
      }
      if (event === "assignment_preview_cancelled") {
        const fid = Number(data?.fixture_id);
        const qid = Number(data?.queue_item_id);
        setPendingTransfers((prev) =>
          prev.filter(
            (t) =>
              !(
                (Number.isInteger(fid) && t.fixtureId === fid) ||
                (Number.isInteger(qid) && t.queueItemId === qid)
              )
          )
        );
        return;
      }
      if (event === "assignment_started") {
        const fid = Number(data?.fixture_id);
        if (!Number.isInteger(fid)) return;
        const updater = (prev) =>
          prev.map((x) =>
            x.id === fid ? { ...x, usagePct: 100 } : x
          );
        setDummyStalls(updater);
        setDummyUrinals(updater);
        setPendingTransfers((prev) =>
          prev.filter((t) => t.fixtureId !== fid)
        );
        if (appModeRef.current === APP_MODE_DUMMY) {
          const kind = data?.fixture_kind || "fixture";
          const u = data?.user_type || "user";
          const dur = Number(data?.duration_s);
          const durText = Number.isFinite(dur) ? ` (${dur.toFixed(1)}s)` : "";
          setLogs((prev) => [
            ...prev,
            `[Dummy] ${u}-er -> ${kind} ${fid}${durText} - ${stamp}`,
          ]);
        }
        return;
      }
      if (event === "assignment_completed") {
        const fid = Number(data?.fixture_id);
        if (!Number.isInteger(fid)) return;
        const updater = (prev) =>
          prev.map((x) =>
            x.id === fid ? { ...x, usagePct: 0 } : x
          );
        setDummyStalls(updater);
        setDummyUrinals(updater);
        if (Number.isFinite(Number(data?.satisfied_users))) {
          setDummySatisfiedUsers(Number(data.satisfied_users));
        }
        if (appModeRef.current === APP_MODE_DUMMY) {
          const kind = data?.fixture_kind || "fixture";
          setLogs((prev) => [
            ...prev,
            `[Dummy] ${kind} ${fid} completed - ${stamp}`,
          ]);
        }
        return;
      }
      if (event === "reset") {
        setDummyQueue([]);
        setDummyStalls(EMPTY_DUMMY_FIXTURES.stalls);
        setDummyUrinals(EMPTY_DUMMY_FIXTURES.urinals);
        setDummySatisfiedUsers(0);
        setDummyUsersEntered(0);
        setPendingTransfers([]);
      }
    });
    return close;
  }, []);

  const toiletTypes = useMemo(
    () => toiletTypesForPreset(simulationConfig.restroomPreset),
    [simulationConfig.restroomPreset]
  );

  // Whenever the simulation config or cleanliness changes, push an
  // updated snapshot to the backend scheduler. This keeps the dummy
  // scheduler's decisions in sync with the Behavioral Model dialog
  // the user is looking at, regardless of the current mode.
  useEffect(() => {
    updateSchedulerConfig({
      restroomPreset: simulationConfig.restroomPreset,
      toiletTypes,
      shyPeerPct: simulationConfig.shyPeerPct,
      middleToiletFirstChoicePct: simulationConfig.middleToiletFirstChoicePct,
      restroomConditions,
    });
  }, [
    simulationConfig.restroomPreset,
    simulationConfig.shyPeerPct,
    simulationConfig.middleToiletFirstChoicePct,
    toiletTypes,
    restroomConditions,
  ]);

  const handleSimulationConfigChange = (partial) => {
    if (
      partial.restroomPreset != null &&
      partial.restroomPreset !== simulationConfig.restroomPreset
    ) {
      syncStateForPreset(partial.restroomPreset);
    }
    setSimulationConfig((prev) => ({ ...prev, ...partial }));
  };

  /**
   * Align conditions + twin fixture usage with the preset's nonexistent slots.
   * Fixture id === global slot index + 1, so stall id 3 and urinal id 6 are
   * the locked slots in the Seamen preset. Switching back to a layout where
   * those slots are active resets them to "Clean" with zero usage.
   */
  const syncStateForPreset = (presetId) => {
    const types = toiletTypesForPreset(presetId);
    setRestroomConditions((prev) => ({
      stalls: prev.stalls.map((s) => {
        const idx = s.id - 1;
        if (types[idx] === "nonexistent") {
          return { ...s, condition: "Non-Existent" };
        }
        return s.condition === "Non-Existent" ? { ...s, condition: "Clean" } : s;
      }),
      urinals: prev.urinals.map((u) => {
        const idx = u.id - 1;
        if (types[idx] === "nonexistent") {
          return { ...u, condition: "Non-Existent" };
        }
        return u.condition === "Non-Existent" ? { ...u, condition: "Clean" } : u;
      }),
    }));
    setStalls((prev) =>
      prev.map((s) =>
        types[s.id - 1] === "nonexistent"
          ? { ...s, usagePct: 0, outOfOrder: false }
          : s
      )
    );
    setUrinals((prev) =>
      prev.map((u) =>
        types[u.id - 1] === "nonexistent"
          ? { ...u, usagePct: 0, outOfOrder: false }
          : u
      )
    );
  };

  /**
   * Update a single fixture's condition.
   * `kind` is the restroomConditions key ("stalls" | "urinals"); `id` is the
   * fixture id (1..6). Non-existent slots are immutable.
   */
  const handleConditionChange = (kind, id, condition) => {
    setRestroomConditions((prev) => ({
      ...prev,
      [kind]: prev[kind].map((x) =>
        x.id === id && x.condition !== NON_EXISTENT_CONDITION
          ? { ...x, condition }
          : x
      ),
    }));
  };

  /** Step every existing toilet by `delta` cleanliness levels. */
  const bumpAllConditions = (delta) => {
    setRestroomConditions((prev) => ({
      stalls: prev.stalls.map((s) => ({
        ...s,
        condition: bumpCondition(s.condition, delta),
      })),
      urinals: prev.urinals.map((u) => ({
        ...u,
        condition: bumpCondition(u.condition, delta),
      })),
    }));
  };

  const handleIncreaseCleanlinessAll = () => bumpAllConditions(+1);
  const handleDecreaseCleanlinessAll = () => bumpAllConditions(-1);

  /** Reset every existing toilet to "Clean"; non-existent slots stay locked. */
  const handleSendMaintenance = () => {
    setRestroomConditions((prev) => ({
      stalls: prev.stalls.map((s) =>
        s.condition === NON_EXISTENT_CONDITION ? s : { ...s, condition: "Clean" }
      ),
      urinals: prev.urinals.map((u) =>
        u.condition === NON_EXISTENT_CONDITION ? u : { ...u, condition: "Clean" }
      ),
    }));
  };

  const handleAddPee = () => {
    if (appModeRef.current === APP_MODE_DUMMY) {
      enqueueUser("pee").then((result) => {
        if (result?.ok) {
          setDummyUsersEntered((prev) => prev + 1);
        }
      });
      return;
    }
    setSimUsersEntered((prev) => prev + 1);
    setQueue((prev) => [{ id: nextQueueId++, type: "pee" }, ...prev]);
  };

  const handleAddPoo = () => {
    if (appModeRef.current === APP_MODE_DUMMY) {
      enqueueUser("poo").then((result) => {
        if (result?.ok) {
          setDummyUsersEntered((prev) => prev + 1);
        }
      });
      return;
    }
    setSimUsersEntered((prev) => prev + 1);
    setQueue((prev) => [{ id: nextQueueId++, type: "poo" }, ...prev]);
  };

  const handleClearQueue = () => {
    if (appModeRef.current === APP_MODE_DUMMY) {
      setDummyUsersEntered((prev) => Math.max(0, prev - dummyQueue.length));
      clearSchedulerQueue();
      return;
    }
    setSimUsersEntered((prev) => Math.max(0, prev - queue.length));
    setQueue([]);
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  const handleResetSimulation = () => {
    nextQueueId = 1;
    setSimulationStatus("stopped");
    setSimulationConfig({ ...INITIAL_SIM_CONFIG });
    setQueue([]);
    setLogs([]);
    const fresh = buildInitialRestroomState(DEFAULT_RESTROOM_PRESET);
    setRestroomConditions(fresh.restroomConditions);
    setStalls(fresh.stalls);
    setUrinals(fresh.urinals);
    setElapsedTimeText(INITIAL_ELAPSED_TIME_TEXT);
    setSatisfiedUsers(INITIAL_SATISFIED_USERS);
    setSimUsersEntered(INITIAL_USERS_ENTERED);
    setDummyUsersEntered(INITIAL_USERS_ENTERED);
    // Reset backend scheduler too — clears any queued/in-use work and
    // counters across all modes. Dummy mode hydration will pick up the
    // cleared snapshot via SSE.
    resetScheduler();
  };

  /**
   * Dispatch a Test Bench command to a single node via the backend.
   * Logs the outgoing payload immediately, then appends an ACK/ERR line
   * once the HTTP round-trip completes.
   */
  const handleTestSend = useCallback(async (id, payload) => {
    const stamp = new Date().toLocaleString();
    const payloadText = JSON.stringify(payload);
    setLogs((prev) => [...prev, `[Node ${id}] -> ${payloadText} - ${stamp}`]);
    const result = await sendToNode(id, payload);
    const resultStamp = new Date().toLocaleString();
    const line = result.ok
      ? `[Node ${id}] <- ACK - ${resultStamp}`
      : `[Node ${id}] <- ERR ${result.error || "unknown"} - ${resultStamp}`;
    setLogs((prev) => [...prev, line]);
  }, []);

  const handleNodeConnect = useCallback(async (id) => {
    const stamp = new Date().toLocaleString();
    setLogs((prev) => [...prev, `[Node ${id}] -> CONNECT - ${stamp}`]);
    const result = await connectNode(id);
    const resultStamp = new Date().toLocaleString();
    const line = result.ok
      ? `[Node ${id}] <- CONNECTED - ${resultStamp}`
      : `[Node ${id}] <- CONNECT FAILED ${result.error || "unknown"} - ${resultStamp}`;
    setLogs((prev) => [...prev, line]);
  }, []);

  const handleNodeDisconnect = useCallback(async (id) => {
    const stamp = new Date().toLocaleString();
    setLogs((prev) => [...prev, `[Node ${id}] -> DISCONNECT - ${stamp}`]);
    const result = await disconnectNode(id);
    const resultStamp = new Date().toLocaleString();
    const line = result.ok
      ? `[Node ${id}] <- DISCONNECTED - ${resultStamp}`
      : `[Node ${id}] <- DISCONNECT FAILED ${result.error || "unknown"} - ${resultStamp}`;
    setLogs((prev) => [...prev, line]);
  }, []);

  /**
   * Switch the app-wide mode between SIM, TEST, and DUMMY.
   *
   * SIM/TEST: broadcast `{command:"MODE", type:"SET", action:<SIM|TEST>}`
   * to every currently-connected node (nodes only understand SIM/TEST).
   * DUMMY: purely in-process, no node traffic.
   *
   * In every case the backend scheduler is told the new mode so it
   * starts/stops its tick assignment behaviour accordingly.
   */
  const handleAppModeChange = (next) => {
    if (
      next !== APP_MODE_SIM &&
      next !== APP_MODE_TEST &&
      next !== APP_MODE_DUMMY
    )
      return;
    if (next === appMode) return;
    setAppMode(next);
    setSchedulerMode(next);
    if (next !== APP_MODE_DUMMY) {
      const payload = { command: "MODE", type: "SET", action: next };
      for (let i = 0; i < NODE_COUNT; i += 1) {
        if (!nodeConnections[i]) continue;
        handleTestSend(i + 1, payload);
      }
    }
  };

  const handleViewBehavioralModel = () => {
    setBehavioralModelOpen(true);
  };

  const isDummy = appMode === APP_MODE_DUMMY;
  const viewQueue = isDummy ? dummyQueue : queue;
  const viewStalls = isDummy ? dummyStalls : stalls;
  const viewUrinals = isDummy ? dummyUrinals : urinals;
  const viewSatisfiedUsers = isDummy ? dummySatisfiedUsers : satisfiedUsers;
  const viewUsersEntered = isDummy ? dummyUsersEntered : simUsersEntered;
  const activeUsers =
    [...viewStalls, ...viewUrinals].filter((f) => Number(f?.usagePct) > 0).length;
  const totalUsers = Math.max(
    0,
    viewUsersEntered - viewQueue.length - activeUsers
  );
  const unsatisfiedUsers = Math.max(0, totalUsers - viewSatisfiedUsers);
  const unsatisfiedPct =
    totalUsers > 0 ? (unsatisfiedUsers / totalUsers) * 100 : 0;
  // In Dummy Mode the digital twin is a pure simulation; the BLE node
  // connection state is irrelevant so we hide the "Node Disconnected"
  // overlay by claiming everything is connected.
  const viewNodeConnections = isDummy
    ? Array.from({ length: NODE_COUNT }, () => true)
    : nodeConnections;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          height: "100vh",
          width: "100%",
          maxWidth: "120rem",
          mx: "auto",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          bgcolor: "background.default",
        }}
      >
        <Header
          onViewBehavioralModel={handleViewBehavioralModel}
          onResetSimulation={handleResetSimulation}
          appMode={appMode}
          onAppModeChange={handleAppModeChange}
        />
        <BehavioralModelDialog
          open={behavioralModelOpen}
          onClose={() => setBehavioralModelOpen(false)}
          simulationConfig={simulationConfig}
          restroomConditions={restroomConditions}
        />
        <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <Sidebar
            restroomConditions={restroomConditions}
            logs={logs}
            onClearLogs={handleClearLogs}
            onChangeStatus={setSimulationStatus}
            simulationConfig={simulationConfig}
            onSimulationConfigChange={handleSimulationConfigChange}
            onConditionChange={handleConditionChange}
            onIncreaseCleanlinessAll={handleIncreaseCleanlinessAll}
            onDecreaseCleanlinessAll={handleDecreaseCleanlinessAll}
            onSendMaintenance={handleSendMaintenance}
          />
          {appMode === APP_MODE_SIM || appMode === APP_MODE_DUMMY ? (
            <SimulationDigitalTwin
              elapsedTimeText={elapsedTimeText}
              satisfiedUsers={viewSatisfiedUsers}
              totalUsers={totalUsers}
              unsatisfiedPct={unsatisfiedPct}
              queue={viewQueue}
              toiletTypes={toiletTypes}
              stalls={viewStalls}
              urinals={viewUrinals}
              nodeConnections={viewNodeConnections}
              pendingTransfers={isDummy ? pendingTransfers : []}
              onAddPee={handleAddPee}
              onAddPoo={handleAddPoo}
              onClearQueue={handleClearQueue}
            />
          ) : (
            <TestConnectionsPanel
              nodeConnections={nodeConnections}
              onSend={handleTestSend}
              onConnect={handleNodeConnect}
              onDisconnect={handleNodeDisconnect}
            />
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}
