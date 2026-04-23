import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import BehavioralModel from "../BehavioralModel/BehavioralModel";
import "./BehavioralModelDialog.css";

/**
 * BehavioralModelDialog
 * Presents three probability-tree visualizations of the next-user toilet
 * choice:
 *   Case 1       — First user is a Pee, all toilets Clean.
 *   Case 2       — First user is a Poo, all toilets Clean.
 *   General Case — uses live per-toilet cleanliness conditions.
 *
 * All three react to simulation configuration (toilet types, shy pee-er %,
 * middle-toilet-as-first-choice %); only the General Case additionally
 * weights by live cleanliness.
 */
export default function BehavioralModelDialog({
  open,
  onClose,
  simulationConfig,
  restroomConditions,
}) {
  const toiletTypes = simulationConfig.toiletTypes;
  const shy = simulationConfig.shyPeerPct;
  const mid = simulationConfig.middleToiletFirstChoicePct;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      scroll="paper"
      aria-labelledby="bm-dialog-title"
      slotProps={{ paper: { className: "bm-dialog-paper" } }}
    >
      <DialogTitle className="bm-dialog-title" id="bm-dialog-title">
        Behavioral Model
      </DialogTitle>
      <DialogContent dividers>
        <Typography className="bm-dialog-intro" component="p">
          Probability that the next user picks each toilet, derived from the
          current Simulation Configuration. Case 1 and Case 2 assume an empty
          restroom with every toilet Clean; the General Case additionally
          weights each branch by the toilet&apos;s current cleanliness
          classification (T.C).
        </Typography>

        <Box className="bm-dialog-params" component="div">
          <span>
            <strong>P(S.P):</strong> {shy}%
          </span>
          <span>
            <strong>P(M.T.A.F.C):</strong> {mid}%
          </span>
          <span>
            <strong>Layout:</strong>{" "}
            {toiletTypes
              .map((t, i) => `${i + 1}:${String(t).slice(0, 1).toUpperCase()}`)
              .join(" · ")}
          </span>
        </Box>

        <Box className="bm-dialog-cases-row">
          <Box className="bm-dialog-case-cell">
            <BehavioralModel
              title="Case 1"
              subtitle={"Empty Restroom & First User is a Pee — All Toilets “Clean”"}
              config={simulationConfig}
              userType="pee"
              allClean
              showToiletClassification={false}
              size="small"
            />
          </Box>
          <Box className="bm-dialog-case-cell">
            <BehavioralModel
              title="Case 2"
              subtitle={"Empty Restroom & First User is a Poo — All Toilets “Clean”"}
              config={simulationConfig}
              userType="poo"
              allClean
              showToiletClassification={false}
              size="small"
            />
          </Box>
        </Box>

        <Box className="bm-dialog-general">
          <BehavioralModel
            title="General Case"
            subtitle="Taking live toilet classification (T.C) into account"
            config={simulationConfig}
            restroomConditions={restroomConditions}
            userType="pee"
            showToiletClassification
            size="large"
          />
        </Box>

        <Box className="bm-dialog-key" component="div">
          <Typography className="bm-dialog-key-title" component="p">
            Key
          </Typography>
          <ul className="bm-dialog-key-list">
            <li>
              <strong>S.P</strong> = Shy Pee-er Population
            </li>
            <li>
              <strong>M.T.A.F.C</strong> = Middle Toilet as First Choice
            </li>
            <li>
              <strong>T.C</strong> = Toilet Classification (Clean = 100%, Fair
              = 75%, Dirty = 50%, Horrendous = 10%, In-Use / Out-of-Order = 0%)
            </li>
          </ul>
          <Typography className="bm-dialog-key-note" component="p">
            Leaf percentages are normalized within each branch group so the
            group&apos;s leaves sum to its level-1 probability.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions className="bm-dialog-actions">
        <Button type="button" variant="outlined" size="small" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
