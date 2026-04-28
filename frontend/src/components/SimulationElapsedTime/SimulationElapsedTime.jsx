/* AI-ASSISTED
 * Simulation Controller
 * Matt Krueger, April 2026 
 */

import { Box, Typography } from "@mui/material";
import "./SimulationElapsedTime.css";

export default function SimulationElapsedTime({
  elapsedTimeText,
  satisfiedUsers,
  exitedUsers,
  totalUsers,
  showStats = true,
}) {
  return (
    <Box className="elapsed-time-block">
      <Typography className="elapsed-time" variant="h6">
        <Box component="span" className="elapsed-time-label">
          Elapsed Time:
        </Box>{" "}
        {showStats ? elapsedTimeText : ""}
      </Typography>
      <Box className="elapsed-time-stats">
        {satisfiedUsers !== undefined && satisfiedUsers !== null && (
          <Typography className="satisfied-users" variant="h6">
            <Box component="span" className="elapsed-time-label">
              Satisfied Users:
            </Box>{" "}
            {showStats ? satisfiedUsers : ""}
          </Typography>
        )}
        {exitedUsers !== undefined && exitedUsers !== null && (
          <Typography className="exited-users" variant="h6">
            <Box component="span" className="elapsed-time-label">
              Exited Users:
            </Box>{" "}
            {showStats ? exitedUsers : ""}
          </Typography>
        )}
        {totalUsers !== undefined && totalUsers !== null && (
          <Typography className="total-users" variant="h6">
            <Box component="span" className="elapsed-time-label">
              Total Users:
            </Box>{" "}
            {showStats ? totalUsers : ""}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
