import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import BehavioralModel from "../BehavioralModel/BehavioralModel";
import { toiletTypesForPreset } from "../../lib/restroomPresets";
import "./BehavioralModelDialog.css";

const POSITION_3 = ["Left", "Middle", "Right"];
const POSITION_2 = ["Left", "Right"];

function toiletTypeLabel(toiletTypes, globalIdx) {
  const type = String(toiletTypes[globalIdx] ?? "").toLowerCase();
  if (type === "nonexistent") return "Non-Existent";
  if (type !== "stall" && type !== "urinal") return "—";
  const siblings = toiletTypes
    .map((t, i) => (String(t).toLowerCase() === type ? i : -1))
    .filter((i) => i >= 0);
  const posInGroup = siblings.indexOf(globalIdx);
  const head = type === "stall" ? "Stall" : "Urinal";
  if (siblings.length === 3) return `${head} ${POSITION_3[posInGroup]}`;
  if (siblings.length === 2) return `${head} ${POSITION_2[posInGroup]}`;
  if (siblings.length === 1) return `${head} Only`;
  return `${head} ${posInGroup + 1}`;
}

function toiletCondition(restroomConditions, toiletTypes, globalIdx) {
  const type = String(toiletTypes[globalIdx] ?? "").toLowerCase();
  if (type === "nonexistent") return "Non-Existent";
  const pool =
    type === "stall"
      ? restroomConditions?.stalls
      : restroomConditions?.urinals;
  const id = globalIdx + 1;
  const entry = pool?.find((x) => x.id === id || x.id === String(id));
  return entry?.condition ?? "Clean";
}

function formatProbability(pct) {
  const fraction = pct / 100;
  const s = Number.isInteger(fraction)
    ? String(fraction)
    : fraction.toFixed(2);
  return `${s} (${pct}%)`;
}

export default function BehavioralModelDialog({
  open,
  onClose,
  simulationConfig,
  restroomConditions,
}) {
  const toiletTypes = toiletTypesForPreset(simulationConfig.restroomPreset);
  const resolvedConfig = { ...simulationConfig, toiletTypes };
  const shy = simulationConfig.shyPeerPct;
  const mid = simulationConfig.middleToiletFirstChoicePct;

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
        <Box className="bm-dialog-summary">
          <Box className="bm-dialog-params-list">
            <Typography component="p" className="bm-param-row">
              <strong>
                Key:
              </strong>{" "}
            </Typography>
            <Typography component="p" className="bm-param-row">
              <strong>
                Probability Shy Pee-er <em>P(S.P)</em>:
              </strong>{" "}
              {formatProbability(shy)}
            </Typography>
            <Typography component="p" className="bm-param-row">
              <strong>
                Probability Middle Toilet as First Choice{" "}
                <em>P(M.T.A.F.C)</em>:
              </strong>{" "}
              {formatProbability(mid)}
            </Typography>
            <Typography component="p" className="bm-param-row">
              <strong>
                Toilet Classification <em>T.C:</em>
              </strong>{" "}
            </Typography>
          </Box>

          <TableContainer className="bm-dialog-table-wrap">
            <Table size="small" className="bm-dialog-table">
              <TableHead>
                <TableRow>
                  <TableCell className="bm-th">Toilet #</TableCell>
                  <TableCell className="bm-th">Toilet Type</TableCell>
                  <TableCell className="bm-th">Toilet Cleanliness</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {toiletTypes.map((_, idx) => (
                  <TableRow key={idx} className="bm-tr">
                    <TableCell className="bm-td">{idx + 1}</TableCell>
                    <TableCell className="bm-td">
                      {toiletTypeLabel(toiletTypes, idx)}
                    </TableCell>
                    <TableCell className="bm-td">
                      {toiletCondition(restroomConditions, toiletTypes, idx)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        <Box className="bm-dialog-cases-row">
          <Box className="bm-dialog-case-cell">
            <BehavioralModel
              title="Pee Decision Tree (Empty Restroom)"
              config={resolvedConfig}
              restroomConditions={restroomConditions}
              userType="pee"
              size="large"
            />
          </Box>
          <Box className="bm-dialog-case-cell">
            <BehavioralModel
              title="Poo Decision Tree (Empty Restroom)"
              config={resolvedConfig}
              restroomConditions={restroomConditions}
              userType="poo"
              size="large"
            />
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
