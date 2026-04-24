import { Fragment, useMemo, useRef } from "react";
import { Box, Typography } from "@mui/material";
import AssignmentPreviewOverlay from "../AssignmentPreviewOverlay/AssignmentPreviewOverlay";
import Queue from "../Queue/Queue";
import SimulationElapsedTime from "../SimulationElapsedTime/SimulationElapsedTime";
import StallContainer from "../StallContainer/StallContainer";
import UrinalContainer from "../UrinalContainer/UrinalContainer";
import "./SimulationDigitalTwin.css";

const TWIN_SLOTS = 6;

function mergeFixtureState(id, stalls, urinals) {
  const s = stalls.find((x) => x.id === id);
  const u = urinals.find((x) => x.id === id);
  const src = s || u || {};
  return {
    usagePct: src.usagePct ?? 0,
    outOfOrder: src.outOfOrder ?? false,
    useCount: src.useCount ?? 0,
  };
}

/** One row per toilet 1…6; kind from Simulation Configuration; usage from either list by id. */
function buildTwinRows(toiletTypes, stalls, urinals) {
  const types = Array.isArray(toiletTypes) ? toiletTypes : [];
  return Array.from({ length: TWIN_SLOTS }, (_, i) => {
    const id = i + 1;
    const raw = String(types[i] ?? "").toLowerCase();
    let kind;
    if (raw === "nonexistent") kind = "nonexistent";
    else if (raw === "stall") kind = "stall";
    else kind = "urinal";
    const { usagePct, outOfOrder, useCount } = mergeFixtureState(
      id,
      stalls,
      urinals
    );
    return { id, kind, usagePct, outOfOrder, useCount };
  });
}

export default function SimulationDigitalTwin({
  elapsedTimeText,
  satisfiedUsers,
  exitedUsers,
  totalUsers,
  showStats = true,
  simulationStatus = "paused",
  queue,
  toiletTypes,
  stalls,
  urinals,
  nodeConnections,
  pendingTransfers,
  activeFixtureUsers,
  simNowMs,
  canAddQueueUsers,
  onAddPee,
  onAddPoo,
  onClearQueue,
}) {
  const rows = buildTwinRows(toiletTypes, stalls, urinals);
  // Share-of-total-uses denominator: all completed occupancies across
  // every fixture (stalls + urinals, regardless of kind). A fixture's
  // "Percent Used" is its own useCount / totalUses.
  const totalUses = rows.reduce((sum, r) => sum + (r.useCount ?? 0), 0);
  const connections = Array.isArray(nodeConnections) ? nodeConnections : [];
  const twinRef = useRef(null);
  const safeTransfers = Array.isArray(pendingTransfers) ? pendingTransfers : [];
  const fixtureUsers =
    activeFixtureUsers && typeof activeFixtureUsers === "object"
      ? activeFixtureUsers
      : {};
  // Queue items currently being animated away toward a toilet. The
  // Queue component ghosts these tiles so the moving marker reads as
  // "this specific user".
  const pendingQueueIds = useMemo(
    () => new Set(safeTransfers.map((t) => t.queueItemId)),
    [safeTransfers]
  );

  return (
    <Box className="digital-twin" ref={twinRef}>
      <Queue
        queue={queue}
        onAddPee={onAddPee}
        onAddPoo={onAddPoo}
        onClearQueue={onClearQueue}
        pendingTransferIds={pendingQueueIds}
        canAddUsers={canAddQueueUsers}
      />

      <Box className="digital-twin-right">
        <Box className="digital-twin-main-row">
          <SimulationElapsedTime
            elapsedTimeText={elapsedTimeText}
            satisfiedUsers={satisfiedUsers}
            exitedUsers={exitedUsers}
            totalUsers={totalUsers}
            showStats={showStats}
          />

          <Box className="toilet-column">
            <Box className="toilet-column-stack">
              {rows.map((row, idx) => {
                const isStall = row.kind === "stall";
                const isUrinal = row.kind === "urinal";
                const isNonexistent = row.kind === "nonexistent";
                const isDisconnected =
                  !isNonexistent && connections[row.id - 1] === false;
                const stallOccupied =
                  isStall && !row.outOfOrder && (row.usagePct ?? 0) > 0;
                const urinalOccupied =
                  isUrinal && (row.usagePct ?? 0) > 0;
                const stallUser = stallOccupied ? fixtureUsers[row.id] : null;
                const urinalUser = urinalOccupied ? fixtureUsers[row.id] : null;
                // Scheduler snapshot ships the active user's type
                // (`pee` / `poo`) per fixture; fall back to `pee` only
                // when a fixture is reported busy without a user object
                // (brief race during an assignment_started event).
                const stallFillColor = row.outOfOrder
                  ? "empty"
                  : stallOccupied
                  ? stallUser?.userType === "poo"
                    ? "poo"
                    : "pee"
                  : "empty";
                const urinalFillColor = urinalOccupied
                  ? urinalUser?.userType === "poo"
                    ? "poo"
                    : "pee"
                  : "empty";

                const nextRow = idx < rows.length - 1 ? rows[idx + 1] : null;
                const sepIsStall =
                  nextRow != null &&
                  (isStall || nextRow.kind === "stall");

                return (
                  <Fragment key={`toilet-${row.id}`}>
                    <Box
                      className="toilet-column-slot"
                      data-fixture-id={row.id}
                    >
                      {isNonexistent ? (
                        <Box
                          className="toilet-column-nonexistent"
                          aria-label={`Toilet ${row.id} non-existent`}
                        />
                      ) : isDisconnected ? (
                        <Box
                          className="toilet-column-disconnected"
                          aria-label={`Node ${row.id} disconnected`}
                        >
                          <Typography
                            className="toilet-column-disconnected__label"
                            component="span"
                          >
                            Node Disconnected
                          </Typography>
                        </Box>
                      ) : isStall ? (
                        <StallContainer
                          id={row.id}
                          usagePct={row.usagePct}
                          outOfOrder={row.outOfOrder || false}
                          fillColor={stallFillColor}
                          activeUser={stallUser}
                          useCount={row.useCount}
                          totalUses={totalUses}
                        />
                      ) : (
                        <UrinalContainer
                          id={row.id}
                          usagePct={row.usagePct}
                          fillColor={urinalFillColor}
                          activeUser={urinalUser}
                          useCount={row.useCount}
                          totalUses={totalUses}
                        />
                      )}
                    </Box>
                    {idx < rows.length - 1 ? (
                      <Box
                        className={`toilet-column-separator toilet-column-separator--${
                          sepIsStall ? "stall" : "urinal"
                        }`}
                        aria-hidden
                      />
                    ) : null}
                  </Fragment>
                );
              })}
            </Box>
          </Box>
        </Box>
      </Box>

      <AssignmentPreviewOverlay
        rootRef={twinRef}
        pendingTransfers={safeTransfers}
        simNowMs={simNowMs}
        isPaused={simulationStatus !== "running"}
      />
    </Box>
  );
}
