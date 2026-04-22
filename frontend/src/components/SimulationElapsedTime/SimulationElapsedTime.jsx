import { Box, Typography } from "@mui/material";
import "./SimulationElapsedTime.css";

export default function SimulationElapsedTime({ text, satisfiedUsers }) {
  return (
    <Box className="elapsed-time-block">
      <Typography className="elapsed-time" variant="h6">
        {text}
      </Typography>
      {satisfiedUsers !== undefined && satisfiedUsers !== null && (
        <Typography className="satisfied-users" variant="h6">
          Satisfied Users: {satisfiedUsers}
        </Typography>
      )}
    </Box>
  );
}
