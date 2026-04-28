import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import BehavioralModel from "../BehavioralModel/BehavioralModel";
import { toiletTypesForPreset } from "../../lib/restroomPresets";
import "./BehavioralModelDialog.css";

function toiletTypeLabel(toiletTypes, globalIdx) {
  const type = String(toiletTypes[globalIdx] ?? "").toLowerCase();
  if (type === "nonexistent") return null;
  return type === "stall" ? "Stall" : "Urinal";
}

function buildConditionsWithOccupancy(restroomConditions, occupancy, forceCleanWhenOpen) {
  const override = (pool) =>
    pool.map((entry) => {
      const idx = entry.id - 1;
      if (occupancy[idx] === "occupied") return { ...entry, condition: "In-Use" };
      if (forceCleanWhenOpen && entry.condition !== "Non-Existent")
        return { ...entry, condition: "Clean" };
      return entry;
    });
  return {
    stalls: override(restroomConditions?.stalls ?? []),
    urinals: override(restroomConditions?.urinals ?? []),
  };
}

export default function BehavioralModelDialog({
  open,
  onClose,
  simulationConfig,
  restroomConditions,
}) {
  const toiletTypes = toiletTypesForPreset(simulationConfig.restroomPreset);
  const resolvedConfig = { ...simulationConfig, toiletTypes };

  const [occupancy, setOccupancy] = useState(() =>
    Array.from({ length: 6 }, () => "unoccupied")
  );
  const [userType, setUserType] = useState("pee");

  const handleOccupancy = (idx, value) =>
    setOccupancy((prev) => prev.map((v, i) => (i === idx ? value : v)));

  const handleReset = () =>
    setOccupancy(Array.from({ length: 6 }, () => "unoccupied"));

  const expectedConditions = useMemo(
    () => buildConditionsWithOccupancy(restroomConditions, occupancy, true),
    [restroomConditions, occupancy]
  );
  const simulatedConditions = useMemo(
    () => buildConditionsWithOccupancy(restroomConditions, occupancy, false),
    [restroomConditions, occupancy]
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      scroll="paper"
      aria-labelledby="bm-dialog-title"
      slotProps={{ paper: { className: "bm-dialog-paper" } }}
    >
      <DialogTitle className="bm-dialog-title" id="bm-dialog-title">
        Behavioral Model
        <IconButton
          aria-label="close"
          onClick={onClose}
          className="bm-dialog-close"
          size="small"
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers className="bm-dialog-content">
        <Box className="bm-dialog-controls">
          <Button
            variant="outlined"
            size="small"
            startIcon={<RestartAltIcon />}
            onClick={handleReset}
            className="bm-control-reset"
          >
            Reset
          </Button>

          <Box className="bm-controls-separator" />

          <Box className="bm-control-user">
            <Typography className="bm-control-label">Next User</Typography>
            <FormControl size="small" fullWidth>
              <Select
                value={userType}
                onChange={(e) => setUserType(e.target.value)}
                className="bm-control-select"
              >
                <MenuItem value="pee">Pee</MenuItem>
                <MenuItem value="poo">Poo</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Box className="bm-controls-separator" />

          <Box className="bm-controls-toilets">
            {toiletTypes.map((_, idx) => {
              const label = toiletTypeLabel(toiletTypes, idx);
              const isNonexistent = !label;
              return (
                <Box key={idx} className="bm-control-toilet">
                  <Typography className="bm-control-label">
                    {label ? `${idx + 1}. ${label}` : `${idx + 1}. —`}
                  </Typography>
                  <FormControl size="small" fullWidth disabled={isNonexistent}>
                    <Select
                      value={isNonexistent ? "unoccupied" : occupancy[idx]}
                      onChange={(e) => handleOccupancy(idx, e.target.value)}
                      className="bm-control-select"
                    >
                      <MenuItem value="unoccupied">Unoccupied</MenuItem>
                      <MenuItem value="occupied">Occupied</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
              );
            })}
          </Box>
        </Box>

        <Box className="bm-dialog-cases-row">
          <Box className="bm-dialog-case-cell">
            <BehavioralModel
              title="Expected Model"
              config={resolvedConfig}
              restroomConditions={expectedConditions}
              userType={userType}
              size="large"
            />
          </Box>
          <Box className="bm-dialog-case-cell">
            <BehavioralModel
              title="Simulated Model"
              config={resolvedConfig}
              restroomConditions={simulatedConditions}
              userType={userType}
              size="large"
            />
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
