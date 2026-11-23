/*
 * Firmware ESP8266 (NodeMCU) - Monitoreo IoT de cisternas
 * Proyecto final Programación de Artefactos (UCA)
 *
 * Cumple el contrato MQTT del README del repo proyecto_final2026_artefactos:
 *   Publica:   cisterna/<código>/nivel     {"distancia": 12.4}          (cm, mediana de 10)
 *              cisterna/<código>/turbidez  {"voltaje": 2.41, "raw": 748}
 *              cisterna/<código>/estado    online / offline (retenido, offline como Last Will)
 *   Se suscribe: cisterna/<código>/alerta  {"estado":"critico","led":"rojo","buzzer":true,"bomba":false,...}
 *   Respaldo:  si pasa 60 s sin broker, decide LED/buzzer/bomba con umbrales de distancia propios.
 *
 * Librerías (Gestor de librerías del Arduino IDE):
 *   - PubSubClient (Nick O'Leary)
 *   - ArduinoJson  (Benoit Blanchon) v7
 * Placa: "NodeMCU 1.0 (ESP-12E Module)" del core ESP8266.
 *
 * Conexiones sugeridas (cámbielas en la sección PINES si usa otras):
 *   HC-SR04  VCC -> VIN (5 V), GND -> GND
 *            TRIG -> D5
 *            ECHO -> divisor 1 kΩ / 2 kΩ -> D6   (el ECHO sale a 5 V; el ESP8266 aguanta 3.3 V)
 *   Turbidez salida -> divisor 10 kΩ / 20 kΩ -> A0
 *   LED verde -> D1 (con resistencia 220 Ω)
 *   LED rojo  -> D2 (con resistencia 220 Ω)
 *   Relé bomba IN -> D7
 *   Buzzer (+) -> D8   (D8 debe estar en bajo al arrancar: un buzzer activo no estorba)
 */

#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ======================= CONFIGURACIÓN =======================
const char* WIFI_SSID     = "MI_RED";
const char* WIFI_PASSWORD = "MI_CLAVE";

// IP de la laptop donde corre Mosquitto (docker compose). No use "localhost".
const char* MQTT_HOST = "192.168.1.100";
const uint16_t MQTT_PORT = 1883;
const char* MQTT_USER = "";   // vacío en desarrollo (allow_anonymous true)
const char* MQTT_PASS = "";

// Código de la cisterna: letras, números, '-' o '_'. Se registra sola con el primer mensaje.
const char* CODIGO = "demo";

// true para la presentación de la maqueta (nivel cada 5 s); false para uso real (cada 60 s).
#define MODO_DEMO true

#if MODO_DEMO
const unsigned long INTERVALO_NIVEL_MS    = 5000UL;
const unsigned long INTERVALO_TURBIDEZ_MS = 5000UL;
#else
const unsigned long INTERVALO_NIVEL_MS    = 60000UL;
const unsigned long INTERVALO_TURBIDEZ_MS = 60000UL;
#endif

// Respaldo local (maqueta H = 20 cm, A = 150 cm2)
const unsigned long TIEMPO_SIN_BROKER_MS = 60000UL;
const float D_BAJO_CM    = 14.0;  // nivel bajo si d > 14 cm
const float D_CRITICO_CM = 17.0;  // crítico si d > 17 cm
const float HISTERESIS_CM = 0.5;  // evita que el buzzer parpadee en el límite

// ========================== PINES ============================
const uint8_t PIN_TRIG      = D5;
const uint8_t PIN_ECHO      = D6;
const uint8_t PIN_LED_VERDE = D1;
const uint8_t PIN_LED_ROJO  = D2;
const uint8_t PIN_BOMBA     = D7;
const uint8_t PIN_BUZZER    = D8;
const uint8_t PIN_TURBIDEZ  = A0;

// Ponga false si su módulo de relé se activa con LOW (muchos módulos chinos lo hacen).
const bool RELE_ACTIVO_ALTO = true;

// ========================= ESTADO ============================
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

String tNivel, tTurbidez, tEstado, tAlerta, clientId;

unsigned long ultimoNivel = 0;
unsigned long ultimaTurbidez = 0;
unsigned long ultimoIntentoMqtt = 0;
unsigned long ultimaConexionBroker = 0;  // última vez que el broker estuvo conectado

float ultimaDistancia = -1;   // última mediana válida (cm)
bool modoRespaldo = false;

enum Nivel { NORMAL, BAJO, CRITICO };
Nivel nivelLocal = NORMAL;

// ===================== SALIDAS FÍSICAS =======================
void aplicarSalidas(bool ledVerde, bool ledRojo, bool buzzer, bool bomba) {
  digitalWrite(PIN_LED_VERDE, ledVerde ? HIGH : LOW);
  digitalWrite(PIN_LED_ROJO,  ledRojo  ? HIGH : LOW);
  digitalWrite(PIN_BUZZER,    buzzer   ? HIGH : LOW);
  bool nivelRele = RELE_ACTIVO_ALTO ? bomba : !bomba;
  digitalWrite(PIN_BOMBA, nivelRele ? HIGH : LOW);
}

void aplicarNivel(Nivel n) {
  switch (n) {
    case NORMAL:  aplicarSalidas(true,  false, false, true);  break;
    case BAJO:    aplicarSalidas(false, true,  false, true);  break;
    case CRITICO: aplicarSalidas(false, true,  true,  false); break;  // bomba apagada: no trabajar en seco
  }
}

// ======================== SENSORES ===========================
// Una medición del HC-SR04 en cm; -1 si no hubo eco.
float medirUnaVez() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  unsigned long dur = pulseIn(PIN_ECHO, HIGH, 30000UL);  // ~5 m máximo
  if (dur == 0) return -1;
  return dur * 0.0343f / 2.0f;
}

// 10 mediciones, se descartan las inválidas y los extremos, y se devuelve la mediana.
float medirDistancia() {
  float v[10];
  int n = 0;
  for (int i = 0; i < 10; i++) {
    float d = medirUnaVez();
    if (d > 2.0f && d < 400.0f) v[n++] = d;  // rango útil del HC-SR04
    delay(60);                               // deja morir el eco anterior
    yield();
  }
  if (n < 3) return -1;
  // ordenamiento por inserción (son pocos datos)
  for (int i = 1; i < n; i++) {
    float x = v[i];
    int j = i - 1;
    while (j >= 0 && v[j] > x) { v[j + 1] = v[j]; j--; }
    v[j + 1] = x;
  }
  // descartar el mínimo y el máximo y tomar la mediana del resto
  int ini = 1, fin = n - 1;  // [ini, fin)
  int m = fin - ini;
  if (m % 2 == 1) return v[ini + m / 2];
  return (v[ini + m / 2 - 1] + v[ini + m / 2]) / 2.0f;
}

int leerTurbidezRaw() {
  long suma = 0;
  for (int i = 0; i < 16; i++) {
    suma += analogRead(PIN_TURBIDEZ);
    delay(5);
  }
  return (int)(suma / 16);
}

// ========================= MQTT ==============================
void alRecibir(char* topic, byte* payload, unsigned int length) {
  if (tAlerta != topic) return;

  JsonDocument doc;
  if (deserializeJson(doc, payload, length)) {
    Serial.println(F("Alerta con JSON inválido, se ignora"));
    return;
  }
  const char* estado = doc["estado"] | "normal";
  const char* led    = doc["led"]    | "verde";
  bool buzzer        = doc["buzzer"] | false;
  bool bomba         = doc["bomba"]  | true;

  bool verde = strcmp(led, "verde") == 0;
  bool rojo  = strcmp(led, "rojo") == 0;
  aplicarSalidas(verde, rojo, buzzer, bomba);

  // Sincroniza el estado local para que el respaldo arranque desde aquí.
  if (strcmp(estado, "critico") == 0) nivelLocal = CRITICO;
  else if (strcmp(estado, "bajo") == 0) nivelLocal = BAJO;
  else nivelLocal = NORMAL;

  Serial.printf("<- alerta: estado=%s led=%s buzzer=%d bomba=%d\n", estado, led, buzzer, bomba);
}

void conectarWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print(F("Conectando a WiFi"));
  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 15000UL) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(F("WiFi OK, IP: "));
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(F("Sin WiFi por ahora; se sigue midiendo y reintentando"));
  }
}

// Intento de conexión no bloqueante: como máximo uno cada 5 s.
void mantenerMqtt() {
  if (mqtt.connected()) {
    ultimaConexionBroker = millis();
    if (modoRespaldo) {
      modoRespaldo = false;
      Serial.println(F("Broker de vuelta: se sale del modo respaldo"));
    }
    return;
  }
  if (WiFi.status() != WL_CONNECTED) return;
  if (millis() - ultimoIntentoMqtt < 5000UL) return;
  ultimoIntentoMqtt = millis();

  Serial.print(F("Conectando a MQTT... "));
  bool ok;
  // Last Will: "offline" retenido en cisterna/<código>/estado
  if (strlen(MQTT_USER) > 0) {
    ok = mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS,
                      tEstado.c_str(), 1, true, "offline");
  } else {
    ok = mqtt.connect(clientId.c_str(), tEstado.c_str(), 1, true, "offline");
  }
  if (ok) {
    Serial.println(F("OK"));
    mqtt.publish(tEstado.c_str(), "online", true);  // retenido
    mqtt.subscribe(tAlerta.c_str(), 1);              // recibe de inmediato la alerta retenida
    ultimaConexionBroker = millis();
  } else {
    Serial.printf("falló (rc=%d)\n", mqtt.state());
  }
}

// ===================== RESPALDO LOCAL ========================
void evaluarRespaldo() {
  bool sinBroker = millis() - ultimaConexionBroker > TIEMPO_SIN_BROKER_MS;
  if (!sinBroker) return;
  if (!modoRespaldo) {
    modoRespaldo = true;
    Serial.println(F("60 s sin broker: modo respaldo local"));
  }
  if (ultimaDistancia < 0) return;

  float d = ultimaDistancia;
  Nivel nuevo = nivelLocal;
  // Sube de estado al cruzar el umbral; baja solo con margen de histéresis.
  if (d > D_CRITICO_CM) nuevo = CRITICO;
  else if (d > D_BAJO_CM) nuevo = (nivelLocal == CRITICO && d > D_CRITICO_CM - HISTERESIS_CM) ? CRITICO : BAJO;
  else nuevo = (nivelLocal != NORMAL && d > D_BAJO_CM - HISTERESIS_CM) ? BAJO : NORMAL;

  if (nuevo != nivelLocal) {
    Serial.printf("Respaldo: d=%.1f cm -> %s\n", d,
                  nuevo == CRITICO ? "critico" : nuevo == BAJO ? "bajo" : "normal");
  }
  nivelLocal = nuevo;
  aplicarNivel(nivelLocal);
}

// ===================== SETUP / LOOP ==========================
void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println(F("\nFirmware cisterna iniciando"));

  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_LED_VERDE, OUTPUT);
  pinMode(PIN_LED_ROJO, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_BOMBA, OUTPUT);
  aplicarNivel(NORMAL);

  String base = String("cisterna/") + CODIGO;
  tNivel    = base + "/nivel";
  tTurbidez = base + "/turbidez";
  tEstado   = base + "/estado";
  tAlerta   = base + "/alerta";
  clientId  = String("esp8266-") + CODIGO + "-" + String(ESP.getChipId(), HEX);

  conectarWiFi();  // si falla, el core reintenta solo en segundo plano
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(alRecibir);
  mqtt.setKeepAlive(15);

  ultimaConexionBroker = millis();  // da 60 s de gracia al arrancar
}

void loop() {
  mantenerMqtt();
  mqtt.loop();

  unsigned long ahora = millis();

  if (ahora - ultimoNivel >= INTERVALO_NIVEL_MS || ultimoNivel == 0) {
    ultimoNivel = ahora;
    float d = medirDistancia();
    if (d >= 0) {
      ultimaDistancia = d;
      Serial.printf("-> distancia %.1f cm\n", d);
      if (mqtt.connected()) {
        char msg[40];
        snprintf(msg, sizeof(msg), "{\"distancia\":%.1f}", d);
        mqtt.publish(tNivel.c_str(), msg);
      }
    } else {
      Serial.println(F("HC-SR04 sin lecturas válidas; revise conexiones"));
    }
  }

  if (ahora - ultimaTurbidez >= INTERVALO_TURBIDEZ_MS || ultimaTurbidez == 0) {
    ultimaTurbidez = ahora;
    int raw = leerTurbidezRaw();
    float voltaje = raw / 1023.0f * 3.3f;
    Serial.printf("-> turbidez raw=%d (%.2f V)\n", raw, voltaje);
    if (mqtt.connected()) {
      char msg[48];
      snprintf(msg, sizeof(msg), "{\"voltaje\":%.2f,\"raw\":%d}", voltaje, raw);
      mqtt.publish(tTurbidez.c_str(), msg);
    }
  }

  evaluarRespaldo();
}
