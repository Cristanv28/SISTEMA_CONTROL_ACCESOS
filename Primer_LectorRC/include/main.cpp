#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebSocketsClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <ESP32Servo.h>

// ---------- CONFIG WIFI ----------
const char* ssid     = "MEGACABLE-3326_2.4G";
const char* password = "Nolas1128C.@";

// ---------- IP DEL ESP32 PRINCIPAL ----------
const char* ip_principal   = "192.168.101.200";
const int   puerto_principal = 81;

// ---------- CONFIG SUPABASE ----------
const char* SUPABASE_URL_RPC       = "https://sjvrxqbgaybjmcwcnsle.supabase.co/rest/v1/rpc/registrar_acceso_uid";
const char* SUPABASE_URL_PENDIENTE = "https://sjvrxqbgaybjmcwcnsle.supabase.co/rest/v1/registro_tarjeta_pendiente";
const char* SUPABASE_URL_TARJETA   = "https://sjvrxqbgaybjmcwcnsle.supabase.co/rest/v1/tarjeta_registro";
const char* SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqdnJ4cWJnYXliam1jd2Nuc2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NzE5MjEsImV4cCI6MjA5NjQ0NzkyMX0.dS7qkI5ZGSSz6qsKrVtkX-mldgrMuyv5SZmSB_dHms8";

// ---------- PINES ----------
#define SS_PIN       5
#define RST_PIN      22
#define SERVO_PIN    13   
#define LED_ESCANEO  2    

// ---------- SERVO (ROTACIÓN CONTINUA) ----------
Servo servoEntrada;
#define SERVO_DETENIDO 90
#define SERVO_GIRA_ABRIR 180  
#define SERVO_GIRA_CERRAR 0   

const unsigned long TIEMPO_MOVIMIENTO = 1000; 
const unsigned long TIEMPO_ABIERTO = 3000;    

enum EstadoPuerta { CERRADA, ABRIENDO, ESPERANDO_ABIERTA, CERRANDO };
EstadoPuerta estadoActualPuerta = CERRADA;
unsigned long temporizadorPuerta = 0;

// ---------- MFRC522 y WEBSOCKET ----------
MFRC522 mfrc522(SS_PIN, RST_PIN);
WebSocketsClient webSocket;

// ---------- ESTADO MODO REGISTRO ----------
bool modoRegistroActivo  = false;
long personaIdPendiente  = -1;

unsigned long ultimaRevisionPendiente = 0;
const unsigned long INTERVALO_REVISION = 2000; 

// ---------- PARPADEO LED ESCANEO ----------
bool      ledEstado       = false;
unsigned long ultimoParpadeo = 0;
const unsigned long INTERVALO_PARPADEO = 300; 

// ---------- COOLDOWN RFID ----------
unsigned long ultimoEscaneoRFID = 0;
const unsigned long COOLDOWN_RFID = 1000; 

// ---------- WEBSOCKET EVENTOS ----------
void onWebSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.println("Conectado al nodo Principal");
      break;
    case WStype_DISCONNECTED:
      Serial.println("Desconectado del Principal");
      break;
    case WStype_TEXT:
      Serial.print("Respuesta del Principal: ");
      Serial.println((char*)payload);
      break;
    default: break;
  }
}

// ---------- LEER UID ----------
String leerUID() {
  String uid = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if (mfrc522.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(mfrc522.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  return uid;
}

// ---------- REGISTRAR EN SUPABASE ----------
bool registrarEnSupabase(String uid, String tipo) {
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, SUPABASE_URL_RPC);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);

  String body = "{\"p_uid\":\"" + uid + "\",\"p_tipo\":\"" + tipo + "\",\"p_camara\":\"esp32_1\"}";

  int    httpCode  = http.POST(body);
  String respuesta = http.getString();

  Serial.print("Supabase RPC respuesta: ");
  Serial.println(httpCode);

  if (httpCode <= 0) {
    Serial.println("Error conectando: " + http.errorToString(httpCode));
    http.end();
    return false;
  }

  http.end();
  respuesta.trim();
  return (httpCode == 200 && respuesta == "true");
}

// ---------- CONTROL ASÍNCRONO DEL SERVO ----------
void iniciarApertura() {
  if (estadoActualPuerta == CERRADA) {
    estadoActualPuerta = ABRIENDO;
    temporizadorPuerta = millis();
    Serial.println("Iniciando apertura de puerta...");
  }
}

void actualizarMecanismoPuerta() {
  switch (estadoActualPuerta) {
    case CERRADA:
      break;

    case ABRIENDO:
      servoEntrada.write(SERVO_GIRA_ABRIR); 
      if (millis() - temporizadorPuerta >= TIEMPO_MOVIMIENTO) {
        servoEntrada.write(SERVO_DETENIDO); 
        temporizadorPuerta = millis();
        estadoActualPuerta = ESPERANDO_ABIERTA;
        Serial.println("Puerta ABIERTA. Esperando...");
      }
      break;

    case ESPERANDO_ABIERTA:
      if (millis() - temporizadorPuerta >= TIEMPO_ABIERTO) {
        temporizadorPuerta = millis();
        estadoActualPuerta = CERRANDO;
        Serial.println("Iniciando cierre de puerta...");
      }
      break;

    case CERRANDO:
      servoEntrada.write(SERVO_GIRA_CERRAR); 
      if (millis() - temporizadorPuerta >= TIEMPO_MOVIMIENTO) {
        servoEntrada.write(SERVO_DETENIDO); 
        estadoActualPuerta = CERRADA;
        Serial.println("Puerta CERRADA.");
      }
      break;
  }
}

// ---------- PARSEO JSON MANUAL ----------
long extraerPersonaId(String json) {
  int pos = json.indexOf("\"persona_id\":");
  if (pos == -1) return -1;
  int inicio = pos + String("\"persona_id\":").length();
  int fin    = inicio;
  while (fin < (int)json.length() && isDigit(json.charAt(fin))) fin++;
  if (fin == inicio) return -1;
  return json.substring(inicio, fin).toInt();
}

// ---------- REVISAR REGISTROS PENDIENTES ----------
void revisarRegistroPendiente() {
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(SUPABASE_URL_PENDIENTE) + "?activo=eq.true&select=persona_id&order=fecha.desc&limit=1";
  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);

  int httpCode = http.GET();

  if (httpCode == 200) {
    String respuesta   = http.getString();
    long   idEncontrado = extraerPersonaId(respuesta);

    if (idEncontrado != -1) {
      if (!modoRegistroActivo)
        Serial.println("Modo registro ACTIVADO para persona_id=" + String(idEncontrado));
      modoRegistroActivo = true;
      personaIdPendiente = idEncontrado;
    } else {
      if (modoRegistroActivo)
        Serial.println("Modo registro DESACTIVADO");
      modoRegistroActivo = false;
      personaIdPendiente = -1;
      digitalWrite(LED_ESCANEO, LOW);
    }
  } else {
    Serial.println("Error consultando pendientes: " + String(httpCode));
  }
  http.end();
}

// ---------- VINCULAR TARJETA NUEVA ----------
void vincularTarjeta(String uid, long personaId) {
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, SUPABASE_URL_TARJETA);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Prefer", "return=minimal");

  String body    = "{\"persona_id\":" + String(personaId) + ",\"uid_tarjeta\":\"" + uid + "\",\"estado\":\"Activo\"}";
  int    httpCode = http.POST(body);

  Serial.print("Insert tarjeta_registro: "); Serial.println(httpCode);
  http.end();

  if (httpCode != 201 && httpCode != 200) return; 

  HTTPClient http2;
  String urlPatch = String(SUPABASE_URL_PENDIENTE) + "?persona_id=eq." + String(personaId) + "&activo=eq.true";
  http2.begin(client, urlPatch);
  http2.addHeader("Content-Type", "application/json");
  http2.addHeader("apikey", SUPABASE_KEY);
  http2.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http2.addHeader("Prefer", "return=minimal");

  int httpCode2 = http2.PATCH("{\"activo\":false}");
  Serial.print("Patch pendiente: "); Serial.println(httpCode2);
  http2.end();

  digitalWrite(LED_ESCANEO, LOW);
  webSocket.sendTXT("REGISTRO_OK:" + uid);

  modoRegistroActivo = false;
  personaIdPendiente = -1;
}

// ---------- SETUP ----------
void setup() {
  Serial.begin(115200);
  SPI.begin();
  mfrc522.PCD_Init();

  pinMode(LED_ESCANEO, OUTPUT);
  digitalWrite(LED_ESCANEO, LOW);

  servoEntrada.attach(SERVO_PIN);
  servoEntrada.write(SERVO_DETENIDO); 

  WiFi.begin(ssid, password);
  Serial.print("Conectando WiFi");
  while (WiFi.status() != WL_CONNECTED) { delay(300); Serial.print("."); }
  Serial.println("\nConectado! IP: " + WiFi.localIP().toString());

  webSocket.begin(ip_principal, puerto_principal, "/");
  webSocket.onEvent(onWebSocketEvent);
  webSocket.setReconnectInterval(3000);
}

// ---------- LOOP PRINCIPAL ----------
void loop() {
  webSocket.loop();
  actualizarMecanismoPuerta();

  if (modoRegistroActivo) {
    if (millis() - ultimoParpadeo > INTERVALO_PARPADEO) {
      ultimoParpadeo = millis();
      ledEstado = !ledEstado;
      digitalWrite(LED_ESCANEO, ledEstado);
    }
  }

  if (millis() - ultimaRevisionPendiente > INTERVALO_REVISION) {
    ultimaRevisionPendiente = millis();
    revisarRegistroPendiente();
  }

  if (millis() - ultimoEscaneoRFID > COOLDOWN_RFID) {
    if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
      String uid = leerUID();

      if (modoRegistroActivo && personaIdPendiente != -1) {
        Serial.println("Tarjeta detectada (MODO REGISTRO), UID: " + uid);
        digitalWrite(LED_ESCANEO, HIGH); 
        vincularTarjeta(uid, personaIdPendiente);
      } else {
        Serial.println("Tarjeta detectada (ENTRADA), UID: " + uid);

        bool permitido = registrarEnSupabase(uid, "Entrada");
        Serial.println("Mandando al Principal: " + String(permitido ? "ENTRADA_OK:" : "ENTRADA_DENY:") + uid);
        webSocket.sendTXT(permitido ? ("ENTRADA_OK:" + uid) : ("ENTRADA_DENY:" + uid));

        if (permitido) {
          iniciarApertura(); 
        }
      }

      mfrc522.PICC_HaltA();
      mfrc522.PCD_StopCrypto1();
      ultimoEscaneoRFID = millis(); 
    }
  }
}