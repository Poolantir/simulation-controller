import { Box } from "@mui/material";
import Queue from "../Queue/Queue";
import SimulationElapsedTime from "../SimulationElapsedTime/SimulationElapsedTime";
import StallContainer from "../StallContainer/StallContainer";
import UrinalContainer from "../UrinalContainer/UrinalContainer";
import "./SimulationDigitalTwin.css";

export default function SimulationDigitalTwin({
  elapsedTimeText,
  satisfiedUsers,
  queue,
  stalls,
  urinals,
  onAddPee,
  onAddPoo,
  onClearQueue,
}) {
  return (
    <Box className="digital-twin">
      <Queue
        queue={queue}
        onAddPee={onAddPee}
        onAddPoo={onAddPoo}
        onClearQueue={onClearQueue}
      />

      <Box className="digital-twin-right">
        <SimulationElapsedTime
          text={elapsedTimeText}
          satisfiedUsers={satisfiedUsers}
        />

        <Box className="toilet-column">
          {stalls.map((s, idx) => (
            <StallContainer
              key={`stall-${s.id}`}
              id={s.id}
              usagePct={s.usagePct}
              outOfOrder={s.outOfOrder || false}
              fillColor={s.outOfOrder ? "empty" : "pee"}
              alert={s.usagePct <= 10 && !s.outOfOrder}
              border={idx === 0 ? "top-and-bottom" : "bottom"}
            />
          ))}

          {urinals.map((u, idx) => (
            <UrinalContainer
              key={`urinal-${u.id}`}
              id={u.id}
              usagePct={u.usagePct}
              fillColor="pee"
              alert={u.usagePct <= 10}
              border={idx === 0 ? "top-and-bottom" : "bottom"}
            />
          ))}
        </Box>
      </Box>
    </Box>
  );
}
