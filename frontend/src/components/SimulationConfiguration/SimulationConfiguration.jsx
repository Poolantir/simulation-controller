import {
  Box,
  Typography,
  Select,
  MenuItem,
  TextField,
  InputAdornment,
} from "@mui/material";
import SimulationControlButtons from "../SimulationControlButtons/SimulationControlButtons";
import "./SimulationConfiguration.css";

const TOILET_COUNT = 6;
const TYPE_OPTIONS = ["stall", "urinal"];

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
  const handleTypeChange = (index, value) => {
    const next = [...config.toiletTypes];
    next[index] = value;
    onChange({ toiletTypes: next });
  };

  return (
    <Box className="sim-config">
      {/* Toilet type row */}
      <Box className="sim-config-toilets">
        {Array.from({ length: TOILET_COUNT }, (_, i) => (
          <Box key={i} className="sim-config-toilet-col">
            <Typography className="sim-config-toilet-label">
              Toilet {i + 1}
            </Typography>
            <Select
              className="sim-config-toilet-select"
              size="small"
              value={config.toiletTypes[i]}
              onChange={(e) => handleTypeChange(i, e.target.value)}
              aria-label={`Toilet ${i + 1} type`}
              MenuProps={{
                PaperProps: { className: "sim-config-toilet-menu" },
              }}
            >
              {TYPE_OPTIONS.map((opt) => (
                <MenuItem key={opt} value={opt}>
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </MenuItem>
              ))}
            </Select>
          </Box>
        ))}
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
