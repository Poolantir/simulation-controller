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
import "./Sidebar.css";

const conditionOptions = [
  "Clean",
  "Fair",
  "Dirty",
  "Horrendous",
  "Out-of-Order",
  "Currently Being Cleaned",
  "Non-Existent",
];

/**
 * Merge stalls + urinals into a single labelled list. The label
 * carries the toilet type + id, so future UI that lets the user
 * add / remove / reorder toilets flows through automatically.
 */
function buildConditionRows(restroomConditions) {
  const stalls = (restroomConditions.stalls || []).map((s) => ({
    key: `stall-${s.id}`,
    label: `${s.id} (Stall)`,
    condition: s.condition,
  }));
  const urinals = (restroomConditions.urinals || []).map((u) => ({
    key: `urinal-${u.id}`,
    label: `${u.id} (Urinal)`,
    condition: u.condition,
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
}) {
  const [logsFullscreen, setLogsFullscreen] = useState(false);
  const conditionRows = buildConditionRows(restroomConditions);

  const handleIncreaseCleanlinessAll = () => {
    // TODO: +1 cleanliness for all toilets (batch)
  };

  const handleDecreaseCleanlinessAll = () => {
    // TODO: -1 cleanliness for all toilets (batch)
  };

  const handleSendMaintenance = () => {
    // TODO: send maintenance (batch / notify)
  };

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
            {conditionRows.map((row) => (
              <Box key={row.key} className="condition-row">
                <Typography className="condition-label" component="span" variant="body2">
                  {row.label}:
                </Typography>
                <Select
                  className="condition-select"
                  fullWidth
                  size="small"
                  value={row.condition}
                  readOnly
                  sx={{ flex: 1, minWidth: 0 }}
                >
                  {conditionOptions.map((opt) => (
                    <MenuItem key={opt} value={opt} className="condition-menu-item">
                      {opt}
                    </MenuItem>
                  ))}
                </Select>
              </Box>
            ))}
          </Box>

          <Box className="condition-batch-actions">
            <Button
              type="button"
              variant="outlined"
              size="small"
              fullWidth
              className="condition-batch-btn"
              onClick={handleIncreaseCleanlinessAll}
            >
              +1 Cleanliness to All
            </Button>
            <Button
              type="button"
              variant="outlined"
              size="small"
              fullWidth
              className="condition-batch-btn"
              onClick={handleDecreaseCleanlinessAll}
            >
              -1 Cleanliness to All
            </Button>
            <Button
              type="button"
              variant="outlined"
              size="small"
              fullWidth
              className="condition-batch-btn"
              onClick={handleSendMaintenance}
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
