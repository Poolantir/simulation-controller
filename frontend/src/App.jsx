/* AI-ASSISTED
 * Simulation Controller
 * Matt Krueger, April 2026 
 */

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
  postServerLogLine,
  resetScheduler,
  sampleUserDuration,
  schedulerSnapshotToFrontendState,
  setSchedulerMode,
  setSimRuntime,
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

const INITIAL_SATISFIED_USERS = 0;
const NODE_COUNT = 6;
const QUEUE_WAIT_MS = 10000;
const EXIT_FLASH_MS = 1000;

function formatSimElapsed(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}
const APP_MODE_SIM = "SIM";
const APP_MODE_TEST = "TEST";
const APP_MODE_DUMMY = "DUMMY";

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
  stalls: [1, 2, 3].map((id) => ({ id, usagePct: 0, outOfOrder: false, useCount: 0 })),
  urinals: [4, 5, 6].map((id) => ({ id, usagePct: 0, outOfOrder: false, useCount: 0 })),
};

let nextQueueId = 1;

export default function App() {
  const [simulationStatus, setSimulationStatus] = useState("paused");
  const [simulationConfig, setSimulationConfig] = useState(() => ({
    ...INITIAL_SIM_CONFIG,
  }));
  const [queue, setQueue] = useState([]);
  const [logs, setLogs] = useState([]);
  const [simElapsedMs, setSimElapsedMs] = useState(0);
  const [simExitedUsers, setSimExitedUsers] = useState(0);
  const [simTotalArrivals, setSimTotalArrivals] = useState(0);
  const initialFixtures = useMemo(
    () => buildInitialRestroomState(DEFAULT_RESTROOM_PRESET),
    []
  );
  const [restroomConditions, setRestroomConditions] = useState(
    () => initialFixtures.restroomConditions
  );
  const [stalls, setStalls] = useState(() => initialFixtures.stalls);
  const [urinals, setUrinals] = useState(() => initialFixtures.urinals);
  const [satisfiedUsers, setSatisfiedUsers] = useState(INITIAL_SATISFIED_USERS);
  const [appMode, setAppMode] = useState(APP_MODE_SIM);
  const [behavioralModelOpen, setBehavioralModelOpen] = useState(false);
  const [nodeConnections, setNodeConnections] = useState(() =>
    emptyConnections()
  );
  const [nodeFlashParams, setNodeFlashParams] = useState({});

  const [dummyQueue, setDummyQueue] = useState([]);
  const [dummyStalls, setDummyStalls] = useState(EMPTY_DUMMY_FIXTURES.stalls);
  const [dummyUrinals, setDummyUrinals] = useState(
    EMPTY_DUMMY_FIXTURES.urinals
  );
  const [dummySatisfiedUsers, setDummySatisfiedUsers] = useState(0);
  const [dummyExitedUsers, setDummyExitedUsers] = useState(0);
  const [dummyTotalArrivals, setDummyTotalArrivals] = useState(0);
  const [dummySimTimeMs, setDummySimTimeMs] = useState(0);
  const dummySimTimeBaseMsRef = useRef(0);
  const dummySimTimeWallAtBaseRef = useRef(0);
  const [pendingTransfers, setPendingTransfers] = useState([]);
  const [activeFixtureUsers, setActiveFixtureUsers] = useState({});
  const [exitingQueueFlashes, setExitingQueueFlashes] = useState({});
  const dummyQueueRef = useRef([]);
  useEffect(() => {
    dummyQueueRef.current = dummyQueue;
  }, [dummyQueue]);

  const appModeRef = useRef(appMode);
  useEffect(() => {
    appModeRef.current = appMode;
  }, [appMode]);
  const simulationStatusRef = useRef(simulationStatus);
  const simNeedsPlayResetRef = useRef(true);
  const [hasPlayedSession, setHasPlayedSession] = useState(false);
  useEffect(() => {
    simulationStatusRef.current = simulationStatus;
  }, [simulationStatus]);

  const handleSimulationStatus = useCallback(async (status) => {
    simulationStatusRef.current = status;
    setSimulationStatus(status);
    if (status === "running") setHasPlayedSession(true);

    const mode = appModeRef.current;
    if (mode === APP_MODE_DUMMY || mode === APP_MODE_SIM) {
      if (status === "running") {
        await setSimRuntime("running");
      } else if (status === "paused") {
        await setSimRuntime("paused");
      }
      return;
    }

    if (status === "stopped") {
      simNeedsPlayResetRef.current = true;
      setQueue([]);
      setStalls((s) => s.map((x) => ({ ...x, usagePct: 0 })));
      setUrinals((u) => u.map((x) => ({ ...x, usagePct: 0 })));
    }
  }, []);

  const simElapsedMsRef = useRef(0);
  useEffect(() => {
    simElapsedMsRef.current = simElapsedMs;
  }, [simElapsedMs]);
  const satisfiedUsersRef = useRef(0);
  useEffect(() => {
    satisfiedUsersRef.current = satisfiedUsers;
  }, [satisfiedUsers]);
  const simExitedUsersRef = useRef(0);
  useEffect(() => {
    simExitedUsersRef.current = simExitedUsers;
  }, [simExitedUsers]);
  const simTotalArrivalsRef = useRef(0);
  useEffect(() => {
    simTotalArrivalsRef.current = simTotalArrivals;
  }, [simTotalArrivals]);

  useEffect(() => {
    if (appMode !== APP_MODE_SIM || simulationStatus !== "running")
      return undefined;
    const id = setInterval(() => {
      setSimElapsedMs((ms) => ms + 100);
    }, 100);
    return () => clearInterval(id);
  }, [appMode, simulationStatus]);

  useEffect(() => {
    if (
      (appMode !== APP_MODE_DUMMY && appMode !== APP_MODE_SIM) ||
      simulationStatus !== "running"
    )
      return undefined;
    setDummySimTimeMs((t) => {
      dummySimTimeBaseMsRef.current = t;
      dummySimTimeWallAtBaseRef.current = Date.now();
      return t;
    });
    const tick = () => {
      const base = dummySimTimeBaseMsRef.current;
      const wall = dummySimTimeWallAtBaseRef.current;
      setDummySimTimeMs(base + (Date.now() - wall));
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [appMode, simulationStatus]);

  useEffect(() => {
    if (appMode !== APP_MODE_SIM || simulationStatus !== "running")
      return undefined;
    const id = setInterval(() => {
      setQueue((prev) => {
        const t = Date.now();
        let exitedAdd = 0;
        const simNow = simElapsedMsRef.current;
        const next = [];
        for (const item of prev) {
          if (item.exitState === "expiring") {
            if (item.removeAfter != null && t >= item.removeAfter) {
              exitedAdd += 1;
              continue;
            }
            next.push(item);
            continue;
          }
          const at = item.enqueuedAtSimMs ?? 0;
          if (simNow - at > QUEUE_WAIT_MS) {
            if (item.exitState !== "expiring") {
              postServerLogLine(
                `[SCHEDULER] user ${item.id} timed out; Removing from queue`
              );
            }
            next.push({
              ...item,
              exitState: "expiring",
              removeAfter: t + EXIT_FLASH_MS,
            });
          } else {
            next.push(item);
          }
        }
        if (exitedAdd) setSimExitedUsers((x) => x + exitedAdd);
        return next;
      });
    }, 200);
    return () => clearInterval(id);
  }, [appMode, simulationStatus, simElapsedMs]);

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
      },
      (nodeId, type, value) => {
        setNodeFlashParams((prev) => ({
          ...prev,
          [nodeId]: { ...prev[nodeId], [type]: value },
        }));
      }
    );
    return close;
  }, []);

  useEffect(() => {
    const applySnapshot = (snap) => {
      const mapped = schedulerSnapshotToFrontendState(snap);
      if (!mapped) return;
      setDummyQueue((prev) => {
        const prevById = new Map(prev.map((x) => [x.id, x]));
        return mapped.queue.map((q) => {
          const prior = prevById.get(q.id);
          if (prior && q.durationS == null && prior.durationS != null) {
            return { ...q, durationS: prior.durationS };
          }
          return q;
        });
      });
      setDummyStalls(mapped.stalls);
      setDummyUrinals(mapped.urinals);
      setDummySatisfiedUsers(mapped.satisfiedUsers);
      setDummyExitedUsers(
        Number.isFinite(mapped.exitedUsers) ? mapped.exitedUsers : 0
      );
      setDummyTotalArrivals(
        Number.isFinite(mapped.totalArrivals) ? mapped.totalArrivals : 0
      );
      if (Number.isFinite(mapped.simTimeS)) {
        const simMs = mapped.simTimeS * 1000;
        dummySimTimeBaseMsRef.current = simMs;
        dummySimTimeWallAtBaseRef.current = Date.now();
        setDummySimTimeMs(simMs);
      }
      setActiveFixtureUsers((prev) => {
        const next = { ...prev };
        const snapUsers = mapped.activeFixtureUsers || {};
        const inUseIds = new Set(
          Object.keys(snapUsers).map((k) => Number(k))
        );
        for (const idStr of Object.keys(prev)) {
          if (prev[idStr]?.exitState === "completed") continue;
          if (!inUseIds.has(Number(idStr))) delete next[idStr];
        }
        for (const [idStr, u] of Object.entries(snapUsers)) {
          const prior = prev[idStr] || {};
          next[idStr] = {
            ...u,
            userNumber: u.userNumber ?? prior.userNumber ?? null,
            userType: u.userType || prior.userType || "pee",
          };
        }
        return next;
      });
      setPendingTransfers(
        Array.isArray(mapped.pendingTransfers) ? mapped.pendingTransfers : []
      );
    };
    const close = openSchedulerStream((event, data) => {
      const stamp = new Date().toLocaleString();
      if (event === "scheduler_state") {
        applySnapshot(data);
        return;
      }
      if (event === "server_log") {
        const line = data?.line;
        if (typeof line === "string") {
          if (line === "") {
            setLogs((prev) => [...prev, ""]);
          } else {
            setLogs((prev) => [...prev, line]);
          }
        }
        return;
      }
      if (event === "queue_item_exited") {
        const qid = Number(data?.queue_item_id);
        if (Number.isInteger(qid)) {
          const item = dummyQueueRef.current.find((x) => x.id === qid);
          if (item) {
            setExitingQueueFlashes((prev) => ({
              ...prev,
              [qid]: {
                id: item.id,
                type: item.type,
                durationS: item.durationS,
                enqueuedAtSimS: item.enqueuedAtSimS ?? 0,
                removeAfterWallMs: Date.now() + EXIT_FLASH_MS,
              },
            }));
          }
        }
        return;
      }
      if (event === "queue_updated") {
        const q = Array.isArray(data?.queue) ? data.queue : [];
        setDummyQueue((prev) => {
          const prevById = new Map(prev.map((x) => [x.id, x]));
          return q.map((x) => {
            const id = Number(x.id);
            const d = Number(x?.duration_s);
            const eas = Number(x?.enqueued_at_sim_s);
            const prior = prevById.get(id);
            return {
              id,
              type: String(x.type),
              enqueuedAtSimS: Number.isFinite(eas) ? eas : prior?.enqueuedAtSimS ?? 0,
              durationS: Number.isFinite(d)
                ? d
                : prior?.durationS ?? null,
            };
          });
        });
        return;
      }
      if (event === "assignment_preview") {
        const transfer = transferFromPreviewEvent(data);
        if (!transfer) return;
        setPendingTransfers((prev) => {
          const filtered = prev.filter(
            (t) =>
              t.fixtureId !== transfer.fixtureId &&
              t.queueItemId !== transfer.queueItemId
          );
          return [...filtered, transfer];
        });
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
        const qid = Number(data?.queue_item_id);
        const dur = Number(data?.duration_s);
        const busyUntilRaw = data?.busy_until;
        const busyUntilServer = busyUntilRaw != null ? Number(busyUntilRaw) : NaN;
        const busyUntilMs = Number.isFinite(busyUntilServer)
          ? busyUntilServer * 1000
          : Number.isFinite(dur)
          ? Date.now() + dur * 1000
          : null;
        setActiveFixtureUsers((prev) => ({
          ...prev,
          [fid]: {
            fixtureId: fid,
            userNumber: Number.isInteger(qid) ? qid : null,
            userType: String(data?.user_type || "pee"),
            durationS: Number.isFinite(dur) ? dur : null,
            busyUntilMs,
          },
        }));
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
        setActiveFixtureUsers((prev) => {
          if (!(fid in prev)) return prev;
          return {
            ...prev,
            [fid]: {
              ...prev[fid],
              exitState: "completed",
              removeAfterWallMs: Date.now() + 1000,
            },
          };
        });
        if (Number.isFinite(Number(data?.satisfied_users))) {
          setDummySatisfiedUsers(Number(data.satisfied_users));
        }
        return;
      }
      if (event === "reset") {
        setDummyQueue([]);
        setDummyStalls(EMPTY_DUMMY_FIXTURES.stalls);
        setDummyUrinals(EMPTY_DUMMY_FIXTURES.urinals);
        setDummySatisfiedUsers(0);
        setDummyTotalArrivals(0);
        setPendingTransfers([]);
        setActiveFixtureUsers({});
        setExitingQueueFlashes({});
      }
    });
    return close;
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setActiveFixtureUsers((prev) => {
        const expired = Object.keys(prev).filter(
          (k) =>
            prev[k].exitState === "completed" &&
            prev[k].removeAfterWallMs <= now
        );
        if (expired.length === 0) return prev;
        const next = { ...prev };
        for (const k of expired) delete next[k];
        return next;
      });
      setExitingQueueFlashes((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const k of Object.keys(next)) {
          if (next[k].removeAfterWallMs <= now) {
            delete next[k];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 200);
    return () => clearInterval(id);
  }, []);

  const toiletTypes = useMemo(
    () => toiletTypesForPreset(simulationConfig.restroomPreset),
    [simulationConfig.restroomPreset]
  );

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

  const canMutateActiveQueue = () => {
    const s = simulationStatusRef.current;
    return (
      s === "running" || s === "paused" || s === "stopped"
    );
  };

  const addSimQueueItem = (type) => {
    if (!canMutateActiveQueue()) return;
    const id = nextQueueId++;
    setSimTotalArrivals((prev) => prev + 1);
    setQueue((prev) => [
      {
        id,
        type,
        durationS: null,
        enqueuedAtSimMs: simElapsedMsRef.current,
      },
      ...prev,
    ]);
    sampleUserDuration(type).then((result) => {
      const d = Number(result?.data?.duration_s);
      if (!result?.ok || !Number.isFinite(d)) return;
      setQueue((prev) =>
        prev.map((item) => (item.id === id ? { ...item, durationS: d } : item))
      );
      postServerLogLine(
        `[QUEUE]: Added (user_id: ${id}, use: ${type}, duration: ${d.toFixed(1)}s)`
      );
    });
  };

  const handleAddPee = () => {
    if (!canMutateActiveQueue()) return;
    if (appModeRef.current === APP_MODE_DUMMY || appModeRef.current === APP_MODE_SIM) {
      enqueueUser("pee");
      return;
    }
    addSimQueueItem("pee");
  };

  const handleAddPoo = () => {
    if (!canMutateActiveQueue()) return;
    if (appModeRef.current === APP_MODE_DUMMY || appModeRef.current === APP_MODE_SIM) {
      enqueueUser("poo");
      return;
    }
    addSimQueueItem("poo");
  };

  const handleClearQueue = () => {
    if (appModeRef.current === APP_MODE_DUMMY || appModeRef.current === APP_MODE_SIM) {
      clearSchedulerQueue();
      return;
    }
    setQueue([]);
    postServerLogLine("[QUEUE]: Cleared Queue");
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  const handleResetSimulation = () => {
    nextQueueId = 1;
    simNeedsPlayResetRef.current = true;
    setHasPlayedSession(false);
    setSimulationStatus("paused");
    simulationStatusRef.current = "paused";
    setSimulationConfig({ ...INITIAL_SIM_CONFIG });
    setQueue([]);
    setLogs([]);
    setSimElapsedMs(0);
    setSimExitedUsers(0);
    setSimTotalArrivals(0);
    const fresh = buildInitialRestroomState(DEFAULT_RESTROOM_PRESET);
    setRestroomConditions(fresh.restroomConditions);
    setStalls(fresh.stalls);
    setUrinals(fresh.urinals);
    setSatisfiedUsers(INITIAL_SATISFIED_USERS);
    setDummyExitedUsers(0);
    setDummyTotalArrivals(0);
    dummySimTimeBaseMsRef.current = 0;
    dummySimTimeWallAtBaseRef.current = Date.now();
    setDummySimTimeMs(0);
    setActiveFixtureUsers({});
    setExitingQueueFlashes({});
    setPendingTransfers([]);
    resetScheduler();
  };

  const handleTestSend = useCallback(async (id, payload) => {
    const result = await sendToNode(id, payload);
    if (!result.ok) {
      const stamp = new Date().toLocaleString();
      setLogs((prev) => [
        ...prev,
        `[Node ${id}] <- ERR ${result.error || "unknown"} - ${stamp}`,
      ]);
    }
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

  const handleAppModeChange = async (next) => {
    if (
      next !== APP_MODE_SIM &&
      next !== APP_MODE_TEST &&
      next !== APP_MODE_DUMMY
    )
      return;
    if (next === appMode) return;
    setAppMode(next);
    await setSchedulerMode(next);
    if (next === APP_MODE_DUMMY || next === APP_MODE_SIM) {
      const desired =
        simulationStatusRef.current === "running" ? "running" : "paused";
      setSimRuntime(desired);
    }
    if (next === APP_MODE_TEST) {
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
  const usesScheduler = appMode === APP_MODE_SIM || appMode === APP_MODE_DUMMY;
  const viewQueue = useMemo(() => {
    if (!usesScheduler) return queue;
    const base = dummyQueue;
    const baseIds = new Set(base.map((x) => x.id));
    const t = Date.now();
    const extras = Object.values(exitingQueueFlashes)
      .filter((f) => !baseIds.has(f.id) && f.removeAfterWallMs > t)
      .map((f) => ({
        id: f.id,
        type: f.type,
        durationS: f.durationS,
        enqueuedAtSimS: f.enqueuedAtSimS,
        exitState: "expiring",
      }));
    return [...base, ...extras];
  }, [usesScheduler, queue, dummyQueue, exitingQueueFlashes]);
  const viewStalls = usesScheduler ? dummyStalls : stalls;
  const viewUrinals = usesScheduler ? dummyUrinals : urinals;
  const viewSatisfiedUsers = usesScheduler ? dummySatisfiedUsers : satisfiedUsers;
  const viewExitedUsers = usesScheduler ? dummyExitedUsers : simExitedUsers;
  const viewTotalArrivals = usesScheduler ? dummyTotalArrivals : simTotalArrivals;
  const simNowMs = usesScheduler ? dummySimTimeMs : simElapsedMs;
  const elapsedTimeText = formatSimElapsed(
    usesScheduler ? dummySimTimeMs : simElapsedMs
  );
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
            onChangeStatus={handleSimulationStatus}
            simulationStatus={simulationStatus}
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
              exitedUsers={viewExitedUsers}
              totalUsers={viewTotalArrivals}
              showStats={hasPlayedSession}
              simulationStatus={simulationStatus}
              queue={viewQueue}
              toiletTypes={toiletTypes}
              stalls={viewStalls}
              urinals={viewUrinals}
              nodeConnections={viewNodeConnections}
              pendingTransfers={usesScheduler ? pendingTransfers : []}
              activeFixtureUsers={usesScheduler ? activeFixtureUsers : {}}
              simNowMs={simNowMs}
              canAddQueueUsers={
                simulationStatus === "running" ||
                simulationStatus === "paused" ||
                simulationStatus === "stopped"
              }
              onAddPee={handleAddPee}
              onAddPoo={handleAddPoo}
              onClearQueue={handleClearQueue}
            />
          ) : (
            <TestConnectionsPanel
              nodeConnections={nodeConnections}
              nodeFlashParams={nodeFlashParams}
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
