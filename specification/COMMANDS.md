# Poolantir Central Server Command Reference (JSON)

## Command Types
1. Mode Control
2. SIM Mode
3. TEST Mode
4. FLASH Mode

### Command Format

All messages sent over the BLE connection will JSON formatted:

```json
{"command":"...", "id":"...", "type":"...", "action":"..."}
```

_Notes:_
_- `id` will store the id of the user and is only applied to Usage Completion and Send User messages within SIM mode_
_- `action` may be a string or number, depending on the command._

# 1. Mode Control
## (TX) Central Server -> ESP32
The central server will control the internal mode of the ESP32

### Set TEST
```json
{"command":"MODE","type":"SET","action":"TEST"}
```

This command from the Central Server will set the ESP32 to TEST mode. See specification within [TEST_MODE.md](TEST_MODE.md) 

### Set SIM
```json
{"command":"MODE","type":"SET","action":"SIM"}
```
This command from the Central Server will set the ESP32 to SIM mode. See specification within [SIM_MODE.md](SIM_MODE.md) 

## (RX) ESP32 -> Central Server
After receiving the mode change message from the Central Server and performing operations to change its internal state, the ESP32 will respond with an acknowledgment message.

# 2. SIM Mode
## (TX) Central Server -> ESP32
The Central Server will add new users to be simulated by the ESP32

```json
{"command":"SIM", "id":"{user_id}", "type":"NEW", "action":{duration_s: float}}
```

_Notes:_
_- id: {user_id}: set by the central server (int). This value should be saved within the ESP32 during this user_id's usage cycle_
_- action: {duration_s: float}: determines the time which the servo sits at MAX position. 

### PAUSE/PLAY

```json
{"command":"SIM", "id":"", "type":"CONTROL", "action":{"PAUSE" | "PLAY"}}
```

The Central Server will send commands to play the simulation or pause the simulation. When there is a current usage cycle while the "PAUSE" command is sent, the ESP32 should save the current state that all variables, LEDS, and servo positions. Upon receiving a play command, it should resume from the saved state.

## (RX) ESP32 -> Central Server
The ESP32 will alert the Central Server when the user has completed its usage cycle

```json
{"command":"SIM", "id":"{user_id}", "type":"COMPLETE", "action":{success: bool}}
```

_Notes:_
_- id: {user_id}: is saved within the ESP32 while its cycle is in-use.
_- action: {success: bool}: returns whether or not the cycle was successfully completed.

# 3. TEST Mode

## (TX) Central Server -> ESP32

Test 1: LED Test:
- This test simply flashes the LED specified for 1s

```json
{"command":"TEST","type":"LED","action":"R"}
```

Valid `action` values: `"R"`, `"G"`, `"B"`.

Test 2: Servo Test:
- This test allows the operator to move the servo motor
```json
{"command":"TEST","type":"SERVO","action":"MAX"}
```

Valid `action` values: `"MAX"`, `"REST"`.

Test 3: Queue Test
- This test runs a static queue 
```json
{"command":"TEST","type":"QUEUE","action":"RUN"}
```

Behavior:
- Runs static queue `{1,2,1,1}`.
- Each value is treated as hold seconds at servo `MAX`, then servo returns `REST`.
- Start LED as GREEN
- ToF is on during this mode; while obj are in range, the LED is RED, else GREEN

# 4. FLASH Mode
The flash mode allows the operator to configure **runtime-tunable** parameters of the node via the testbench. Each message sets **one** parameter; use separate commands to change `in_range_mm` and `servo_ramp_ms`.

## (TX) Central Server -> ESP32

### Set in-range distance threshold

```json
{"command":"FLASH","id":"","type":"IN_RANGE","action":60}
```

| | |
|--|--|
| `action` | number (int) |
| Maps to in firmware | `IN_RANGE_MM` |
| Usage | ToF distance threshold (mm). When `0 < range_mm <= in_range_mm`, the target counts as *in range* (e.g. SIM presence / queue LED logic). |
| Suggested bounds (may clamp) | e.g. 20–2000 |

### Set servo move duration (ramp)

```json
{"command":"FLASH","id":"","type":"SERVO_RAMP","action":2000}
```

| | |
|--|--|
| `action` | number (int), milliseconds |
| Maps to in firmware | `kMoveMs` / animation duration |
| Usage | Milliseconds to complete a servo move from `gServoStartDeg` to `gServoTargetDeg` (linear ramp). Smaller = snappier; larger = slower glide. |
| Suggested bounds (may clamp) | e.g. 200–10000 |

For ramp semantics, see [ANIMATION.md](ANIMATION.md).

**Notes**

- `id` is unused for FLASH; use `""` or omit if your client allows.


Obtaining the parameters:
upon connecting to the nodes, the Server will query each node to obtain both its IN_RANGE and SERVO_RAMP values. 

```json
{"command":"GET", "id":"", "type":"SERVO_RAMP", action:""}
```

```json
{"command":"GET", "id":"", "type":"IN_RANGE", action:""}
```

These values are used set as the defaults within the Testbench UI

## (RX) ESP32 -> Central Server

```json
{"command":"GET", "id":"", "type":"SERVO_RAMP", action:{SERVO_RAMP}}
```

```json
{"command":"GET", "id":"", "type":"IN_RANGE", action:{IN_RANGE}}
```