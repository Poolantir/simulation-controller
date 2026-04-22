import { Box } from "@mui/material";
import Queue from "../Queue/Queue";
import SimulationElapsedTime from "../SimulationElapsedTime/SimulationElapsedTime";
import StallContainer from "../StallContainer/StallContainer";
import UrinalContainer from "../UrinalContainer/UrinalContainer";
import "./SimulationDigitalTwin.css";

export default function SimulationDigitalTwin({
  elapsedTimeText,
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
        <SimulationElapsedTime text={elapsedTimeText} />

        <Box className="toilet-column">
          {stalls.map((s) => (
            <StallContainer
              key={`stall-${s.id}`}
              id={s.id}
              usagePct={s.usagePct}
              outOfOrder={s.outOfOrder || false}
              fillColor={s.outOfOrder ? "empty" : "pee"}
              alert={s.usagePct <= 10 && !s.outOfOrder}
            />
          ))}

          {urinals.map((u) => (
            <UrinalContainer
              key={`urinal-${u.id}`}
              id={u.id}
              usagePct={u.usagePct}
              fillColor="pee"
              alert={u.usagePct <= 10}
            />
          ))}
        </Box>
      </Box>
    </Box>
  );
}
