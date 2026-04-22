import { Box, Button, IconButton, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import UsageIcon from "../UsageIcon/UsageIcon";
import "./Queue.css";

export default function Queue({ queue, onAddPee, onAddPoo, onClearQueue }) {
  const total = queue.length;

  return (
    <Box className="queue-container">
      <Typography className="queue-title">Queue</Typography>

      <Box className="queue-body">
        <Box className="queue-actions">
          <IconButton
            type="button"
            className="queue-action-btn queue-action-pee"
            onClick={onAddPee}
            aria-label="Add pee"
            size="medium"
          >
            <AddIcon className="queue-action-icon" />
          </IconButton>
          <IconButton
            type="button"
            className="queue-action-btn queue-action-poo"
            onClick={onAddPoo}
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
          {queue.map((item) => (
            <UsageIcon
              key={item.id}
              variant={item.type}
              className="queue-block"
            />
          ))}
        </Box>
      </Box>

      <Typography className="queue-total" variant="body2" component="p">
        Total: {total}
      </Typography>
    </Box>
  );
}
