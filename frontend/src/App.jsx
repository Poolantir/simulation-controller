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

  // Backend Dummy Mode state — hydrated from the scheduler SSE stream.
  // Separate from local sim state so switching modes doesn't clobber
  // either side.
  const [dummyQueue, setDummyQueue] = useState([]);
  const [dummyStalls, setDummyStalls] = useState(EMPTY_DUMMY_FIXTURES.stalls);
  const [dummyUrinals, setDummyUrinals] = useState(
    EMPTY_DUMMY_FIXTURES.urinals
  );
  const [dummySatisfiedUsers, setDummySatisfiedUsers] = useState(0);
  const [dummyExitedUsers, setDummyExitedUsers] = useState(0);
  const [dummyTotalArrivals, setDummyTotalArrivals] = useState(0);
  const [dummySimTimeMs, setDummySimTimeMs] = useState(0);
  // Dummy-mode sim clock: backend sends authoritative `sim_time_s` on
  // SSE; between snapshots we advance display from wall time so
  // Elapsed Time ticks every second while running (not only on events).
  const dummySimTimeBaseMsRef = useRef(0);
  const dummySimTimeWallAtBaseRef = useRef(0);
  // Active queue -> toilet preview animations (3 s each). Keyed by
  // (queueItemId, fixtureId) so a fixture can only host one preview.
  // Hydrated from the SSE stream's `assignment_preview` events and
  // cleared on `assignment_started` / `assignment_preview_cancelled` /
  // snapshot replacement.
  const [pendingTransfers, setPendingTransfers] = useState([]);
  // Per-fixture record of which queued user is currently occupying
  // it, plus their sampled duration and absolute busy-until deadline
  // (client-clock ms). Drives the numbered + countdown tile rendered
  // inside each active stall/urinal. Only populated in Dummy Mode
  // since SIM mode has no scheduler-driven assignment flow.
  const [activeFixtureUsers, setActiveFixtureUsers] = useState({});
  // Dummy mode: `queue_item_exited` arrives before `queue_updated`; we
  // stash the row for 1s so UsageIcon can play the same danger flash
  // as SIM mode (server queue no longer includes that id).
  const [exitingQueueFlashes, setExitingQueueFlashes] = useState({});
  const dummyQueueRef = useRef([]);
  useEffect(() => {
    dummyQueueRef.current = dummyQueue;
  }, [dummyQueue]);

  // Keep a ref of current appMode for async callbacks that mustn't
  // capture a stale value (SSE handlers and log emitters).
  const appModeRef = useRef(appMode);
  useEffect(() => {
    appModeRef.current = appMode;
  }, [appMode]);
  const simulationStatusRef = useRef(simulationStatus);
  /** First Play after load/reset should clear SIM counters like stopped→running. */
  const simNeedsPlayResetRef = useRef(true);
  // True once Play has been pressed since load/reset. Drives
  // "labels empty before first play" per spec state 1 / 5.
  const [hasPlayedSession, setHasPlayedSession] = useState(false);
  useEffect(() => {
    simulationStatusRef.current = simulationStatus;
  }, [simulationStatus]);

  const handleSimulationStatus = useCallback(async (status) => {
    simulationStatusRef.current = status;
    setSimulationStatus(status);
    if (status === "running") setHasPlayedSession(true);

    const mode = appModeRef.current;
    if (mode === APP_MODE_DUMMY) {
      if (status === "running") {
        await setSimRuntime("running");
      } else if (status === "paused") {
        await setSimRuntime("paused");
      }
      return;
    }

    // SIM or TEST: same Play/Pause server log path (dummy uses backend above).
    if (status === "running") {
      postServerLogLine("=============== PLAY ===============");
      if (simNeedsPlayResetRef.current) {
        setSimElapsedMs(0);
        setSatisfiedUsers(0);
        setSimExitedUsers(0);
        setStalls((s) => s.map((x) => ({ ...x, usagePct: 0 })));
        setUrinals((u) => u.map((x) => ({ ...x, usagePct: 0 })));
        simNeedsPlayResetRef.current = false;
      }
    }
    if (status === "paused") {
      postServerLogLine("=============== PAUSE ===============");
      postServerLogLine(`  Elapsed: ${formatSimElapsed(simElapsedMsRef.current)}`);
      postServerLogLine(`  Satisfied Users: ${satisfiedUsersRef.current}`);
      postServerLogLine(`  Exited Users: ${simExitedUsersRef.current}`);
      postServerLogLine(`  Total Users: ${simTotalArrivalsRef.current}`);
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
    if (appMode !== APP_MODE_DUMMY || simulationStatus !== "running")
      return undefined;
    // Re-anchor: after pause, wall clock gap must not add to sim time.
    // Also fixes first play before first SSE (refs were 0,0).
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

  // Subscribe to the scheduler SSE stream so the digital twin reflects
  // live queue/occupancy in Dummy Mode. We stay subscribed regardless
  // of mode so the UI can hydrate the moment the user switches to
  // Dummy, but we only render dummy state in render when active.
  useEffect(() => {
    const applySnapshot = (snap) => {
      const mapped = schedulerSnapshotToFrontendState(snap);
      if (!mapped) return;
      // Keep any per-item durationS we've already seen for this queue
      // item — older backends don't include `duration_s` on the queue
      // payload, but once we have a value it's stable for that user.
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
      // NOTE: we intentionally do NOT mirror `mapped.runtime` into
      // `simulationStatus`. The Play/Pause button is the source of
      // truth for UI intent; piping stale scheduler_state snapshots
      // back into status caused click-Play-then-flip-to-Pause races
      // when a snapshot emitted before the POST completed arrived on
      // the SSE stream. Backend runtime is kept in sync via the
      // `handleSimulationStatus`/`handleAppModeChange` POSTs instead.
      // Snapshot is authoritative for in-use fixtures. Only preserve
      // prior identity fields (userNumber / userType) as fallbacks in
      // case the snapshot omitted them. `busyUntilMs` and `durationS`
      // are taken from the snapshot as-is: pausing the simulation
      // means backend sends `busyUntilMs=null` + remaining seconds on
      // `durationS`, and a ??-fallback would keep the old future
      // deadline and the UI would keep counting down past pause.
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
      // Hydrate preview animations from the authoritative snapshot so
      // a page refresh in the middle of a preview still shows arrows.
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
        const busyUntilServer = Number(data?.busy_until);
        // `busy_until` is server wall-clock seconds. Convert to client
        // `Date.now()` ms, falling back to "now + duration" if the
        // event omitted either field so the countdown still runs.
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

  // Prune activeFixtureUsers completion flash + dummy queue exit flashes.
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

  /**
   * Append a SIM-mode queue item with a backend-sampled duration so
   * the tile's timer label matches Dummy Mode's distribution. The
   * tile is inserted optimistically with `durationS: null`; once the
   * round-trip returns the duration is patched in. If the request
   * fails the label simply stays blank (user is still usable).
   */
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
    if (appModeRef.current === APP_MODE_DUMMY) {
      enqueueUser("pee");
      return;
    }
    addSimQueueItem("pee");
  };

  const handleAddPoo = () => {
    if (!canMutateActiveQueue()) return;
    if (appModeRef.current === APP_MODE_DUMMY) {
      enqueueUser("poo");
      return;
    }
    addSimQueueItem("poo");
  };

  const handleClearQueue = () => {
    if (appModeRef.current === APP_MODE_DUMMY) {
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
  const handleAppModeChange = async (next) => {
    if (
      next !== APP_MODE_SIM &&
      next !== APP_MODE_TEST &&
      next !== APP_MODE_DUMMY
    )
      return;
    if (next === appMode) return;
    setAppMode(next);
    // Flip backend scheduler mode first so the subsequent runtime POST
    // (only valid in DUMMY) is accepted.
    await setSchedulerMode(next);
    if (next === APP_MODE_DUMMY) {
      // Force backend runtime to match the UI's current intent so a
      // stale runtime from a prior Dummy session can't silently keep
      // ticking behind a "paused" button.
      const desired =
        simulationStatusRef.current === "running" ? "running" : "paused";
      setSimRuntime(desired);
    } else {
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
  const viewQueue = useMemo(() => {
    if (appMode !== APP_MODE_DUMMY) return queue;
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
  }, [appMode, queue, dummyQueue, exitingQueueFlashes]);
  const viewStalls = isDummy ? dummyStalls : stalls;
  const viewUrinals = isDummy ? dummyUrinals : urinals;
  const viewSatisfiedUsers = isDummy ? dummySatisfiedUsers : satisfiedUsers;
  const viewExitedUsers = isDummy ? dummyExitedUsers : simExitedUsers;
  const viewTotalArrivals = isDummy ? dummyTotalArrivals : simTotalArrivals;
  const simNowMs = isDummy ? dummySimTimeMs : simElapsedMs;
  const elapsedTimeText = formatSimElapsed(
    isDummy ? dummySimTimeMs : simElapsedMs
  );
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
              pendingTransfers={isDummy ? pendingTransfers : []}
              activeFixtureUsers={isDummy ? activeFixtureUsers : {}}
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
