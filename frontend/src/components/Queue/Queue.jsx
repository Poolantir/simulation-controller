import { Box, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import "./Queue.css";

export default function Queue({ queue, onAddPee, onAddPoo }) {
  return (
    <Box className="queue-container">
      <Typography className="queue-title">Queue</Typography>

      <Box className="queue-add-square" onClick={onAddPee}>
        <AddIcon sx={{ color: "#bbb", fontSize: 28 }} />
      </Box>

      <Box className="queue-list">
        {queue.map((item) => (
          <Box
            key={item.id}
            className={`queue-block queue-block-${item.type}`}
          />
        ))}
      </Box>
    </Box>
  );
}
