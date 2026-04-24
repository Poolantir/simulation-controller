import {
  Box,
  Typography,
  Select,
  MenuItem,
  TextField,
  InputAdornment,
} from "@mui/material";
import SimulationControlButtons from "../SimulationControlButtons/SimulationControlButtons";
import { restroomPresetOptions } from "../../lib/restroomPresets";
import "./SimulationConfiguration.css";

function clampPct(raw) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export default function SimulationConfiguration({
  config,
  onChange,
  onChangeStatus,
}) {
  const presetOptions = restroomPresetOptions();

  return (
    <Box className="sim-config">
      {/* Restroom preset selector */}
      <Box className="sim-config-preset">
        <Typography className="sim-config-param-label">
          Restroom
        </Typography>
        <Select
          className="sim-config-preset-select"
          size="small"
          fullWidth
          value={config.restroomPreset}
          onChange={(e) => onChange({ restroomPreset: e.target.value })}
          aria-label="Restroom preset"
          MenuProps={{
            PaperProps: { className: "sim-config-toilet-menu" },
          }}
        >
          {presetOptions.map((opt) => (
            <MenuItem key={opt.id} value={opt.id}>
              {opt.label}
            </MenuItem>
          ))}
        </Select>
      </Box>

      {/* Percentage parameters — one row, two columns */}
      <Box className="sim-config-params">
        <Box className="sim-config-param-col">
          <Typography className="sim-config-param-label">
            Shy Pee-er Population
          </Typography>
          <TextField
            className="sim-config-param-input"
            size="small"
            fullWidth
            type="number"
            inputProps={{ min: 0, max: 100, inputMode: "decimal" }}
            InputProps={{
              endAdornment: <InputAdornment position="end">%</InputAdornment>,
            }}
            value={config.shyPeerPct}
            onChange={(e) =>
              onChange({ shyPeerPct: clampPct(e.target.value) })
            }
          />
        </Box>

        <Box className="sim-config-param-col">
          <Typography className="sim-config-param-label">
            Middle Toilet as First Choice
          </Typography>
          <TextField
            className="sim-config-param-input"
            size="small"
            fullWidth
            type="number"
            inputProps={{ min: 0, max: 100, inputMode: "decimal" }}
            InputProps={{
              endAdornment: <InputAdornment position="end">%</InputAdornment>,
            }}
            value={config.middleToiletFirstChoicePct}
            onChange={(e) =>
              onChange({ middleToiletFirstChoicePct: clampPct(e.target.value) })
            }
          />
        </Box>
      </Box>

      {/* Control buttons pinned to bottom */}
      <SimulationControlButtons onChangeStatus={onChangeStatus} />
    </Box>
  );
}
