import { useState } from "react";
import {
  Box,
  Typography,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
} from "@mui/material";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import SidebarSquare from "../SidebarSquare/SidebarSquare";
import SimulationControlButtons from "../SimulationControlButtons/SimulationControlButtons";
import Stall from "../Stall/Stall";
import Urinal from "../Urinal/Urinal";
import "./Sidebar.css";

const conditionOptions = [
  "Clean (Priority 1)",
  "Fair (Priority 2)",
  "Dirty (Priority 3)",
  "Horrendous (Priority 4)",
  "Out-of-Order (Priority N/A)",
];

export default function Sidebar({
  restroomConditions,
  logs,
  simulationStatus,
  onChangeStatus,
}) {
  const [logsFullscreen, setLogsFullscreen] = useState(false);

  return (
    <Box className="sidebar">
      {/* Simulation Configuration -- left blank per spec, just buttons */}
      <SidebarSquare title="Simulation Configuration" flex={4}>
        <Box sx={{ flex: 1 }} />
        <SimulationControlButtons
          status={simulationStatus}
          onChangeStatus={onChangeStatus}
        />
      </SidebarSquare>

      {/* Restroom Conditions */}
      <SidebarSquare title="Restroom Conditions" flex={4}>
        <Box>
          {/* Stalls section */}
          <Box className="condition-section">
            <Box className="condition-icon-col">
              <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                Stalls
              </Typography>
              <Box sx={{ width: 60, height: 50, overflow: "hidden" }}>
                <Stall id="" mini />
              </Box>
            </Box>
            <Box className="condition-rows">
              {restroomConditions.stalls.map((s) => (
                <Box key={s.id} className="condition-row">
                  <Typography className="condition-label" variant="body2">
                    {s.id}:
                  </Typography>
                  <Select
                    size="small"
                    value={s.condition}
                    sx={{ fontSize: 12, flex: 1, height: 32 }}
                    readOnly
                  >
                    {conditionOptions.map((opt) => (
                      <MenuItem key={opt} value={opt} sx={{ fontSize: 12 }}>
                        {opt}
                      </MenuItem>
                    ))}
                  </Select>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Urinals section */}
          <Box className="condition-section">
            <Box className="condition-icon-col">
              <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                Urinals
              </Typography>
              <Box sx={{ width: 40, height: 50, overflow: "hidden" }}>
                <Urinal mini />
              </Box>
            </Box>
            <Box className="condition-rows">
              {restroomConditions.urinals.map((u) => (
                <Box key={u.id} className="condition-row">
                  <Typography className="condition-label" variant="body2">
                    {u.id}:
                  </Typography>
                  <Select
                    size="small"
                    value={u.condition}
                    sx={{ fontSize: 12, flex: 1, height: 32 }}
                    readOnly
                  >
                    {conditionOptions.map((opt) => (
                      <MenuItem key={opt} value={opt} sx={{ fontSize: 12 }}>
                        {opt}
                      </MenuItem>
                    ))}
                  </Select>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </SidebarSquare>

      {/* Simulation Logs */}
      <SidebarSquare title="Simulation Logs" flex={2}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            mb: 0.5,
          }}
        >
          <IconButton size="small" onClick={() => setLogsFullscreen(true)}>
            <FullscreenIcon fontSize="small" />
          </IconButton>
        </Box>
        <Box sx={{ overflow: "auto", flex: 1 }}>
          {logs.map((line, i) => (
            <Typography key={i} className="log-line" variant="body2">
              {line}
            </Typography>
          ))}
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
