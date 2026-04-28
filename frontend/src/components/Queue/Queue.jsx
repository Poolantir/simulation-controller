/* AI-ASSISTED
 * Simulation Controller
 * Matt Krueger, April 2026 
 */

import { Box, Button, IconButton, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import UsageIcon from "../UsageIcon/UsageIcon";
import "./Queue.css";

export default function Queue({
  queue,
  onAddPee,
  onAddPoo,
  onClearQueue,
  pendingTransferIds,
  canAddUsers = true,
}) {
  const total = queue.length;
  const leavingIds = pendingTransferIds instanceof Set
    ? pendingTransferIds
    : new Set(Array.isArray(pendingTransferIds) ? pendingTransferIds : []);

  return (
    <Box className="queue-container">
      <Typography className="queue-title">Queue</Typography>

      <Box className="queue-body">
        <Box className="queue-actions">
          <IconButton
            type="button"
            className="queue-action-btn queue-action-pee"
            onClick={onAddPee}
            disabled={!canAddUsers}
            aria-label="Add pee"
            size="medium"
          >
            <AddIcon className="queue-action-icon" />
          </IconButton>
          <IconButton
            type="button"
            className="queue-action-btn queue-action-poo"
            onClick={onAddPoo}
            disabled={!canAddUsers}
            aria-label="Add poo"
            size="medium"
          >
            <AddIcon className="queue-action-icon" />
          </IconButton>
        </Box>

        <Button
          type="button"
          variant="outlined"
          size="small"
          className="queue-clear-btn"
          onClick={onClearQueue}
          aria-label="Clear queue"
        >
          Clear
        </Button>

        <Box className="queue-list">
          {queue.map((item) => {
            const leaving = leavingIds.has(item.id);
            const classes = ["queue-block"];
            if (leaving) classes.push("queue-block--leaving");
            return (
              <Box
                key={item.id}
                className="queue-block-wrapper"
                data-queue-item-id={item.id}
              >
                <UsageIcon
                  variant={item.type}
                  className={classes.join(" ")}
                  userNumber={item.id}
                  durationS={item.durationS ?? null}
                  forceLabeled
                  flash={item.exitState === "expiring" ? "danger" : null}
                />
              </Box>
            );
          })}
        </Box>
      </Box>

      <Typography className="queue-total" variant="body2" component="p">
        Total: {total}
      </Typography>
    </Box>
  );
}
