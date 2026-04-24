#include <Arduino.h>
#include <Wire.h>
#include <VL53L0X.h>
#include <ESP32Servo.h>
#include <ESP32PWM.h>
#include <BLEDevice.h>
#include <BLE2902.h>
#include <ArduinoJson.h>
#include <deque>
#include <mutex>
#include "clock.h"

#ifndef POOLANTIR_NODE_ID
#define POOLANTIR_NODE_ID "0"
#endif

#define PIN_SERVO  14
#define LED_R  25
#define LED_G  26
#define LED_B  27
#define TOF_SDA  21
#define TOF_SCL  22

#define PISSING_RANGE_MM   60
#define SERVO_REST_DEG      0
#define SERVO_MAX_DEG     180

#define LED_FLASH_MS     1000
#define SIM_GAP_MS        300   // brief pause between SIM-test queue items


/////////////////////
//     GLOBALS     //
/////////////////////

enum Mode { MODE_TEST, MODE_SIM };
static Mode gMode = MODE_SIM;  // default: simulation/normal operation

static VL53L0X    sensor;
static Servo      servo;

// ToF edge-detection state (IN-USE / COMPLETE reporting)
static bool       gPrevInRange = false;
static ClockTimer gUseTimer;    // measures how long user has been in-range

// Active USAGE-driven servo hold (SIM mode)
static bool       gUsageActive     = false;
static uint32_t   gUsageDurationMs = 0;
static ClockTimer gUsageTimer;

// Built-in SIM test (static queue {1,2,1,1}, values = seconds-in-range)
enum SimTestState { SIMT_IDLE, SIMT_HOLDING, SIMT_GAP };
static SimTestState     gSimTestState = SIMT_IDLE;
static std::deque<int>  gSimTestQueue;
static ClockTimer       gSimTestTimer;
static uint32_t          gSimTestHoldMs = 0;

// BLE
static String             gServiceUuid;
static String             gCharUuid;
static BLECharacteristic* gBleChar      = nullptr;
static bool               gBleConnected = false;
static std::mutex         gRxMutex;
static std::deque<String> gRxQueue;
static String             gRxAssembleBuffer;
static ClockTimer         gAdvRetryTimer;
static bool               gAdvRetryArmed = false;

// Forward decls
static void   writeServo(int degrees);
static void   handleCommand(const String& raw);
static void   sendBleMessage(const String& msg);
static void   restartAdvertising();
static void   ensureAdvertisingWhileDisconnected();
static void   appendRxChunk(const String& chunk);


/////////////////////////
//    BLE CALLBACKS    //
/////////////////////////

class ServerCB : public BLEServerCallbacks {
  void onConnect(BLEServer*) override {
    gBleConnected = true;
    gAdvRetryArmed = false;
    Serial.println("[BLE] connected");
  }
  void onDisconnect(BLEServer* s) override {
    gBleConnected = false;
    Serial.println("[BLE] disconnected, restarting advertising now");
    if (s) {
      s->getAdvertising()->start();
    }
    BLEDevice::startAdvertising();
    gAdvRetryArmed = true;
    gAdvRetryTimer.start();
  }
};

class WriteCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* ch) override {
    std::lock_guard<std::mutex> lock(gRxMutex);
    String raw = String(ch->getValue().c_str());
    Serial.printf("[BLE RX] %s\n", raw.c_str());
    appendRxChunk(raw);
  }
};

static ServerCB sServerCB;
static WriteCB  sWriteCB;


////////////////////////
//    INITIALIZERS    //
////////////////////////

static void initToF() {
  Wire.begin(TOF_SDA, TOF_SCL);
  Wire.setClock(100000);
  sensor.setTimeout(500);
  bool ok = false;
  for (int i = 0; i < 5; i++) {
    if (sensor.init()) { ok = true; break; }
    delay(500);
  }
  if (!ok) {
    Serial.println("[ERROR] ToF sensor init failed");
    digitalWrite(LED_R, HIGH);
    while (1) {}
  }
  sensor.startContinuous();
}

static void initServo() {
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);
  servo.setPeriodHertz(50);
  if (servo.attach(PIN_SERVO, MIN_PULSE_WIDTH, MAX_PULSE_WIDTH) == 0) {
    Serial.println("[WARN] Servo attach failed");
  }
  writeServo(SERVO_REST_DEG);
}

static void initLeds() {
  pinMode(LED_R, OUTPUT);
  pinMode(LED_G, OUTPUT);
  pinMode(LED_B, OUTPUT);
  digitalWrite(LED_R, LOW);
  digitalWrite(LED_G, LOW);
  digitalWrite(LED_B, LOW);
}

static void initBleConnection() {
  gServiceUuid = String("4fafc201-1fb5-459e-8fcc-c5c9c33191a") + POOLANTIR_NODE_ID;
  gCharUuid    = String("beb5483e-36e1-4688-b7f5-e073f246f7b") + POOLANTIR_NODE_ID;

  String name = String("poolantir-node-") + POOLANTIR_NODE_ID;
  BLEDevice::init(name);

  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(&sServerCB);

  BLEService* svc = server->createService(gServiceUuid.c_str());
  gBleChar = svc->createCharacteristic(
    gCharUuid.c_str(),
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_NOTIFY
  );
  gBleChar->addDescriptor(new BLE2902());
  gBleChar->setCallbacks(&sWriteCB);
  svc->start();

  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(gServiceUuid.c_str());
  adv->setScanResponse(true);
  adv->start();

  Serial.printf("[BLE] advertising as \"%s\" svc=%s char=%s\n",
                name.c_str(), gServiceUuid.c_str(), gCharUuid.c_str());
}


////////////////////////////
//    RUNTIME HELPERS     //
////////////////////////////

static void writeServo(int degrees) {
  if (!servo.attached()) return;
  servo.write(constrain(degrees, 0, 180));
}

static bool isToiletInUse() {
  uint16_t mm = sensor.readRangeContinuousMillimeters();
  return !sensor.timeoutOccurred() && mm > 0 && mm <= PISSING_RANGE_MM;
}

static void sendBleMessage(const String& msg) {
  if (!gBleChar || !gBleConnected) {
    Serial.printf("[BLE TX skipped, not connected] %s\n", msg.c_str());
    return;
  }
  gBleChar->setValue(msg);
  gBleChar->notify();
  Serial.printf("[BLE TX] %s\n", msg.c_str());
}

// BLE writes may arrive fragmented by MTU. Reassemble complete JSON objects
// before handing them to the command parser.
static void appendRxChunk(const String& chunk) {
  if (!chunk.length()) return;

  gRxAssembleBuffer += chunk;

  int start = -1;
  int depth = 0;
  bool inString = false;
  bool escape = false;

  for (int i = 0; i < gRxAssembleBuffer.length(); i++) {
    char c = gRxAssembleBuffer[i];

    if (start < 0) {
      if (c == '{') {
        start = i;
        depth = 1;
        inString = false;
        escape = false;
      }
      continue;
    }

    if (inString) {
      if (escape) {
        escape = false;
      } else if (c == '\\') {
        escape = true;
      } else if (c == '"') {
        inString = false;
      }
      continue;
    }

    if (c == '"') {
      inString = true;
    } else if (c == '{') {
      depth++;
    } else if (c == '}') {
      depth--;
      if (depth == 0) {
        gRxQueue.push_back(gRxAssembleBuffer.substring(start, i + 1));
        start = -1;
      }
    }
  }

  if (start < 0) {
    gRxAssembleBuffer = "";
  } else if (start > 0) {
    gRxAssembleBuffer = gRxAssembleBuffer.substring(start);
  }
}

static void restartAdvertising() {
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  if (adv) {
    adv->start();
  }
  BLEDevice::startAdvertising();
  Serial.println("[BLE] advertising restart requested");
}

static void ensureAdvertisingWhileDisconnected() {
  if (gBleConnected) return;

  if (!gAdvRetryArmed) {
    gAdvRetryArmed = true;
    gAdvRetryTimer.start();
    restartAdvertising();
    return;
  }

  if (gAdvRetryTimer.expired(2000)) {
    gAdvRetryTimer.start();
    restartAdvertising();
  }
}

////////////////////////////
//    TX MESSAGES         //
////////////////////////////

static void sendInUse() {
  JsonDocument doc;
  doc["command"] = "IN-USE";
  doc["type"] = "STATE";
  doc["action"] = "ENTER";
  String msg;
  serializeJson(doc, msg);
  sendBleMessage(msg);
}

static void sendComplete(float durationSeconds) {
  JsonDocument doc;
  doc["command"] = "COMPLETE";
  doc["type"] = "DURATION_S";
  doc["action"] = durationSeconds;
  String msg;
  serializeJson(doc, msg);
  sendBleMessage(msg);
}

static void sendEchoAck(const String& message) {
  JsonDocument doc;
  doc["command"] = "ECHO";
  doc["type"] = "MESSAGE";
  doc["action"] = message;
  String msg;
  serializeJson(doc, msg);
  sendBleMessage(msg);
}


////////////////////////////
//    TEST HANDLERS       //
////////////////////////////

static void testLed(const String& action) {
  String a = action;
  a.toUpperCase();

  int pin;
  const char* color;
  if      (a == "R") { pin = LED_R; color = "RED";   }
  else if (a == "G") { pin = LED_G; color = "GREEN"; }
  else if (a == "B") { pin = LED_B; color = "BLUE";  }
  else {
    Serial.printf("[TEST LED] invalid action: \"%s\"\n", action.c_str());
    return;
  }

  Serial.printf("[TEST LED] flashing %s for %d ms\n", color, LED_FLASH_MS);
  digitalWrite(pin, HIGH);
  delay(LED_FLASH_MS);
  digitalWrite(pin, LOW);
}

static void testServo(const String& action) {
  String a = action;
  a.toUpperCase();

  int deg;
  if      (a == "MAX")  deg = SERVO_MAX_DEG;
  else if (a == "REST") deg = SERVO_REST_DEG;
  else {
    Serial.printf("[TEST SERVO] invalid action: \"%s\"\n", action.c_str());
    return;
  }

  writeServo(deg);
  Serial.printf("[TEST SERVO] moved to %s (%d deg)\n", a.c_str(), deg);
}

static void testSimStart() {
  if (gSimTestState != SIMT_IDLE) {
    Serial.println("[TEST SIM] already running, ignoring");
    return;
  }
  gSimTestQueue.clear();
  // Static queue per spec: {1, 2, 1, 1}
  gSimTestQueue.push_back(1);
  gSimTestQueue.push_back(2);
  gSimTestQueue.push_back(1);
  gSimTestQueue.push_back(1);
  Serial.printf("[TEST SIM] starting, %d items queued\n", (int)gSimTestQueue.size());
}


////////////////////////////
//    USAGE HANDLER       //
////////////////////////////

static void startUsage(uint32_t durationSeconds) {
  writeServo(SERVO_MAX_DEG);
  gUsageActive     = true;
  gUsageDurationMs = durationSeconds * 1000UL;
  gUsageTimer.start();
  Serial.printf("[USAGE] holding servo at MAX for %lu s\n",
                (unsigned long)durationSeconds);
}


////////////////////////////
//    MODE HANDLER        //
////////////////////////////

static const char* modeName(Mode m) {
  return (m == MODE_TEST) ? "TEST" : "SIM";
}

static void setMode(const String& setVal) {
  String v = setVal;
  v.toUpperCase();

  Mode next;
  if      (v == "TEST") next = MODE_TEST;
  else if (v == "SIM")  next = MODE_SIM;
  else {
    Serial.printf("[MODE] invalid set value: \"%s\"\n", setVal.c_str());
    return;
  }

  if (next != gMode) {
    // Reset per-mode state on transition.
    gMode = next;
    gUsageActive = false;
    gSimTestState = SIMT_IDLE;
    gSimTestQueue.clear();
    writeServo(SERVO_REST_DEG);
    gPrevInRange = false;
  }
  Serial.printf("[MODE] now %s\n", modeName(gMode));
}


////////////////////////////////
//    COMMAND DISPATCH        //
////////////////////////////////

static void logIncoming(const String& raw) {
  Serial.println();
  Serial.println("Incoming:");
  Serial.print('"');
  Serial.print(raw);
  Serial.println('"');
}

static void logParsed(const String& summary) {
  Serial.print("Parsed: ");
  Serial.println(summary);
  Serial.printf("Status: node=%s connected=%c mode=%s\n",
                POOLANTIR_NODE_ID, gBleConnected ? 'T' : 'F', modeName(gMode));
  Serial.println();
  Serial.println();
  Serial.println();
}

static void handleCommand(const String& raw) {
  logIncoming(raw);

  if (raw.length() == 0) {
    logParsed("<empty>");
    return;
  }

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, raw);
  if (err) {
    logParsed(String("<invalid json: ") + err.c_str() + ">");
    return;
  }

  String command = doc["command"] | "";
  String type = doc["type"] | "";
  String actionText = doc["action"] | "";
  command.trim();
  type.trim();
  actionText.trim();
  command.toUpperCase();
  type.toUpperCase();
  actionText.toUpperCase();

  if (!command.length()) {
    logParsed("<missing command>");
    return;
  }
  if (!type.length()) {
    logParsed("<missing type>");
    return;
  }
  if (doc["action"].isNull()) {
    logParsed("<missing action>");
    return;
  }

  // MODE is always accepted regardless of current mode.
  if (command == "MODE") {
    logParsed(String("MODE ") + type + " " + actionText);
    if (type != "SET") {
      logParsed("MODE invalid type (expected SET)");
      return;
    }
    setMode(actionText);
    return;
  }

  // ECHO is always accepted regardless of current mode.
  if (command == "ECHO") {
    String message = doc["action"] | "";
    logParsed(String("ECHO ") + type + " " + actionText);
    if (type != "MESSAGE") {
      logParsed("ECHO invalid type (expected MESSAGE)");
      return;
    }
    sendEchoAck(message);
    return;
  }

  if (command == "TEST") {
    String summary = String("TEST ") + type + " " + actionText;

    if (gMode != MODE_TEST) {
      summary += String(" (ignored, mode=") + modeName(gMode) + ")";
      logParsed(summary);
      return;
    }

    if (type == "LED") {
      logParsed(summary);
      testLed(actionText);
    } else if (type == "SERVO") {
      logParsed(summary);
      testServo(actionText);
    } else if (type == "SIM") {
      logParsed(summary);
      if (actionText != "RUN") {
        logParsed("TEST SIM invalid action (expected RUN)");
        return;
      }
      testSimStart();
    } else {
      logParsed(summary + " (unknown type)");
    }
    return;
  }

  if (command == "USAGE") {
    bool hasDuration = doc["action"].is<uint32_t>() || doc["action"].is<int>() ||
                       doc["action"].is<float>() || doc["action"].is<double>();
    uint32_t secs = hasDuration ? (uint32_t)(doc["action"].as<float>()) : 0;
    String summary = hasDuration
      ? String("USAGE ") + type + " " + secs
      : String("USAGE ") + type + " <invalid>";

    if (gMode != MODE_SIM) {
      summary += String(" (ignored, mode=") + modeName(gMode) + ")";
      logParsed(summary);
      return;
    }
    if (type != "DURATION_S") {
      logParsed("USAGE invalid type (expected DURATION_S)");
      return;
    }
    if (!hasDuration) {
      logParsed(summary);
      return;
    }
    if (secs == 0) {
      logParsed(summary + " (invalid)");
      return;
    }
    logParsed(summary);
    startUsage(secs);
    return;
  }

  logParsed(String("<unknown command: \"") + command + "\">");
}


//////////////////////////////////
//    PERIODIC STATE MACHINES   //
//////////////////////////////////

// ToF edge detection → IN-USE / COMPLETE. Only active in SIM mode.
static void tofTick() {
  if (gMode != MODE_SIM) return;

  bool inRange = isToiletInUse();

  if (inRange && !gPrevInRange) {
    // Positive edge: out-of-range → in-range
    gUseTimer.start();
    sendInUse();
  } else if (!inRange && gPrevInRange) {
    // Negative edge: in-range → out-of-range
    uint32_t elapsed = gUseTimer.elapsedMs();
    gUseTimer.stop();
    sendComplete(elapsed / 1000.0f);
  }

  gPrevInRange = inRange;
}

// Non-blocking hold for USAGE message (SIM mode).
static void usageTick() {
  if (!gUsageActive) return;
  if (gUsageTimer.expired(gUsageDurationMs)) {
    writeServo(SERVO_REST_DEG);
    gUsageActive = false;
    Serial.println("[USAGE] complete, servo returned to REST");
  }
}

// Non-blocking state machine for the TEST SIM queue.
static void simTestTick() {
  switch (gSimTestState) {

    case SIMT_IDLE: {
      if (gSimTestQueue.empty()) return;
      int val = gSimTestQueue.front();
      gSimTestQueue.pop_front();
      gSimTestHoldMs = (uint32_t)val * 1000UL;
      writeServo(SERVO_MAX_DEG);
      gSimTestTimer.start();
      gSimTestState = SIMT_HOLDING;
      Serial.printf("[TEST SIM] holding %lu ms (%d remain)\n",
                    (unsigned long)gSimTestHoldMs,
                    (int)gSimTestQueue.size());
      break;
    }

    case SIMT_HOLDING: {
      if (!gSimTestTimer.expired(gSimTestHoldMs)) return;
      writeServo(SERVO_REST_DEG);
      gSimTestTimer.start();
      gSimTestState = SIMT_GAP;
      Serial.println("[TEST SIM] hold done, servo to REST");
      break;
    }

    case SIMT_GAP: {
      if (!gSimTestTimer.expired(SIM_GAP_MS)) return;
      if (gSimTestQueue.empty()) {
        gSimTestState = SIMT_IDLE;
        Serial.println("[TEST SIM] queue empty, done");
      } else {
        gSimTestState = SIMT_IDLE;  // loop re-enters IDLE → pops next item
      }
      break;
    }
  }
}


/////////////////
//    SETUP    //
/////////////////

void setup() {
  Serial.begin(115200);
  initLeds();
  initToF();
  initServo();

  digitalWrite(LED_R, HIGH);
  writeServo(SERVO_REST_DEG);
  delay(2000);
  digitalWrite(LED_R, LOW);

  initBleConnection();
  Serial.printf("[ESP3] ready, Node %s mode=%s connected=%c\n",
                POOLANTIR_NODE_ID, modeName(gMode), gBleConnected ? 'T' : 'F');
}


////////////////
//    LOOP    //
////////////////

void loop() {
  // Drain BLE RX queue
  for (;;) {
    String payload;
    {
      std::lock_guard<std::mutex> lock(gRxMutex);
      if (gRxQueue.empty()) break;
      payload = gRxQueue.front();
      gRxQueue.pop_front();
    }
    handleCommand(payload);
  }

  tofTick();
  usageTick();
  simTestTick();
  ensureAdvertisingWhileDisconnected();

  delay(5);
}
