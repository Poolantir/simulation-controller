import { useState } from "react";
import {
  Box,
  Button,
  Typography,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
} from "@mui/material";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SidebarSquare from "../SidebarSquare/SidebarSquare";
import SimulationConfiguration from "../SimulationConfiguration/SimulationConfiguration";
import { toiletTypesForPreset } from "../../lib/restroomPresets";
import {
  CLEANLINESS_LEVELS,
  NON_EXISTENT_CONDITION,
  cleanlinessLabel,
} from "../../lib/cleanliness";
import "./Sidebar.css";

/**
 * Merge stalls + urinals into a single labelled list. The label
 * carries the toilet type + id, so future UI that lets the user
 * add / remove / reorder toilets flows through automatically.
 */
function buildConditionRows(restroomConditions, toiletTypes) {
  const slotIsNonexistent = (id) =>
    String(toiletTypes?.[id - 1] ?? "").toLowerCase() === "nonexistent";
  const stalls = (restroomConditions.stalls || []).map((s) => ({
    key: `stall-${s.id}`,
    kind: "stalls",
    id: s.id,
    label: `${s.id} (Stall)`,
    condition: s.condition,
    disabled: slotIsNonexistent(s.id),
  }));
  const urinals = (restroomConditions.urinals || []).map((u) => ({
    key: `urinal-${u.id}`,
    kind: "urinals",
    id: u.id,
    label: `${u.id} (Urinal)`,
    condition: u.condition,
    disabled: slotIsNonexistent(u.id),
  }));
  return [...stalls, ...urinals];
}

export default function Sidebar({
  restroomConditions,
  logs,
  onClearLogs,
  onChangeStatus,
  simulationConfig,
  onSimulationConfigChange,
  onConditionChange,
  onIncreaseCleanlinessAll,
  onDecreaseCleanlinessAll,
  onSendMaintenance,
}) {
  const [logsFullscreen, setLogsFullscreen] = useState(false);
  const toiletTypes = toiletTypesForPreset(simulationConfig.restroomPreset);
  const conditionRows = buildConditionRows(restroomConditions, toiletTypes);

  return (
    <Box className="sidebar">
      {/* Simulation Configuration */}
      <SidebarSquare title="Simulation Configuration" hugContent contentOverflow="hidden">
        <SimulationConfiguration
          config={simulationConfig}
          onChange={onSimulationConfigChange}
          onChangeStatus={onChangeStatus}
        />
      </SidebarSquare>

      {/* Restroom Conditions */}
      <SidebarSquare
        title="Restroom Conditions"
        hugContent
        className="sidebar-square--conditions"
        contentOverflow="hidden"
      >
        <Box className="condition-panel">
          <Box className="condition-rows">
            {conditionRows.map((row) => {
              const isLocked =
                row.disabled || row.condition === NON_EXISTENT_CONDITION;
              return (
                <Box key={row.key} className="condition-row">
                  <Typography
                    className="condition-label"
                    component="span"
                    variant="body2"
                  >
                    {row.label}:
                  </Typography>
                  <Select
                    className="condition-select"
                    fullWidth
                    size="small"
                    value={row.condition}
                    disabled={isLocked}
                    onChange={(e) =>
                      onConditionChange?.(row.kind, row.id, e.target.value)
                    }
                    renderValue={(v) => cleanlinessLabel(v)}
                    sx={{ flex: 1, minWidth: 0 }}
                  >
                    {/* Hidden anchor so MUI doesn't warn about an out-of-list value
                        when the slot is locked (Non-Existent). */}
                    {isLocked ? (
                      <MenuItem
                        value={NON_EXISTENT_CONDITION}
                        className="condition-menu-item"
                        sx={{ display: "none" }}
                      >
                        {NON_EXISTENT_CONDITION}
                      </MenuItem>
                    ) : null}
                    {CLEANLINESS_LEVELS.map((opt) => (
                      <MenuItem
                        key={opt.value}
                        value={opt.value}
                        className="condition-menu-item"
                      >
                        {opt.label}
                      </MenuItem>
                    ))}
                  </Select>
                </Box>
              );
            })}
          </Box>

          <Box className="condition-batch-actions">
            <Button
              type="button"
              variant="outlined"
              size="small"
              fullWidth
              className="condition-batch-btn"
              onClick={onIncreaseCleanlinessAll}
            >
              +1 Cleanliness to All
            </Button>
            <Button
              type="button"
              variant="outlined"
              size="small"
              fullWidth
              className="condition-batch-btn"
              onClick={onDecreaseCleanlinessAll}
            >
              -1 Cleanliness to All
            </Button>
            <Button
              type="button"
              variant="outlined"
              size="small"
              fullWidth
              className="condition-batch-btn"
              onClick={onSendMaintenance}
            >
              Send Maintenance
            </Button>
          </Box>
        </Box>
      </SidebarSquare>

      {/* Simulation Logs */}
      <SidebarSquare
        title="Simulation Logs"
        flex={2}
        className="sidebar-square--logs"
        contentOverflow="hidden"
      >
        <Box className="sim-logs">
          <Box className="sim-logs-scroll">
            {logs.map((line, i) => (
              <Typography key={i} className="log-line" component="p" variant="body2">
                {line}
              </Typography>
            ))}
          </Box>
          <Box className="sim-logs-actions">
            <IconButton
              size="small"
              className="sim-logs-icon-btn"
              onClick={() => setLogsFullscreen(true)}
              aria-label="Open simulation logs fullscreen"
            >
              <FullscreenIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              className="sim-logs-icon-btn"
              onClick={onClearLogs}
              aria-label="Clear simulation logs"
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        <Dialog
          open={logsFullscreen}
          onClose={() => setLogsFullscreen(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>Simulation Logs</DialogTitle>
          <DialogContent dividers>
            {logs.map((line, i) => (
              <Typography key={i} className="log-line" variant="body2">
                {line}
              </Typography>
            ))}
          </DialogContent>
        </Dialog>
      </SidebarSquare>
    </Box>
  );
}
