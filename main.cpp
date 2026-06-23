#include <WiFi.h>
#include <WebSocketsServer.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// ---------- CONFIG WIFI ----------
const char* ssid = "MEGACABLE-3326_2.4G";
const char* password = "Nolas1128C.@";
const char* ip_principal ="192.168.101.200";
// ---------- CONFIG IP ESTATICA ----------
IPAddress local_IP(192, 168, 101, 200);
IPAddress gateway(192, 168, 101, 1);
IPAddress subnet(255, 255, 255, 0);

// ---------- PINES LEDs / BUZZER ----------
#define LED_VERDE     25
#define LED_ROJO      26
#define LED_AZUL      27
#define LED_ESCANEO   4
#define BUZZER        14

// ---------- PINES SENSOR ULTRASONICO ----------
#define TRIG_PIN    32
#define ECHO_PIN    33

const float DISTANCIA_ACTIVACION = 50.0; // cm
unsigned long ultimaDeteccion = 0;
const unsigned long COOLDOWN_SENSOR = 5000; // 5 segundos

// ---------- ESTADO DE ESCANEO ----------
bool escaneando = false;
unsigned long ultimoParpadeo = 0;
bool estadoLedEscaneo = false;
const unsigned long INTERVALO_PARPADEO = 300; // ms

// ---------- LCD I2C ----------
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ---------- SERVIDOR WEBSOCKET ----------
WebSocketsServer webSocket = WebSocketsServer(81);

// Lista de UIDs autorizados
String uidsAutorizados[] = {"A1B2C3D4", "1A2B3C4D"};
const int totalUIDs = 2;

void mostrarStandby() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Sistema Listo");
  lcd.setCursor(0, 1);
  lcd.print("Acerque tarjeta");
  digitalWrite(LED_AZUL, HIGH);
  digitalWrite(LED_VERDE, LOW);
  digitalWrite(LED_ROJO, LOW);
  digitalWrite(LED_ESCANEO, LOW);
}

void mostrarEscaneando() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Persona detect.");
  lcd.setCursor(0, 1);
  lcd.print("Escaneando...");
  digitalWrite(LED_AZUL, LOW);
}

bool validarUID(String uid) {
  for (int i = 0; i < totalUIDs; i++) {
    if (uidsAutorizados[i] == uid) return true;
  }
  return false;
}

void mostrarAcceso(bool permitido, String uid, String tipo) {
  escaneando = false;
  digitalWrite(LED_ESCANEO, LOW);
  digitalWrite(LED_AZUL, LOW);
  lcd.clear();

  if (permitido) {
    lcd.setCursor(0, 0);
    lcd.print(tipo + " OK");
    lcd.setCursor(0, 1);
    lcd.print("UID:" + uid);

    digitalWrite(LED_VERDE, HIGH);
    digitalWrite(LED_ROJO, LOW);

    digitalWrite(BUZZER, HIGH);
    delay(150);
    digitalWrite(BUZZER, LOW);

  } else {
    lcd.setCursor(0, 0);
    lcd.print(tipo + " DENEGADA");
    lcd.setCursor(0, 1);
    lcd.print("UID:" + uid);

    digitalWrite(LED_VERDE, LOW);
    digitalWrite(LED_ROJO, HIGH);

    digitalWrite(BUZZER, HIGH);
    delay(600);
    digitalWrite(BUZZER, LOW);
  }

  delay(2500);
  mostrarStandby();
}

// ---------- Pantalla/acceso para FaceID ----------
void mostrarFaceID(bool reconocido, String nombre) {
  escaneando = false;
  digitalWrite(LED_ESCANEO, LOW);
  digitalWrite(LED_AZUL, LOW);
  lcd.clear();

  if (reconocido) {
    lcd.setCursor(0, 0);
    lcd.print("FaceID OK");
    lcd.setCursor(0, 1);
    lcd.print(nombre);

    digitalWrite(LED_VERDE, HIGH);
    digitalWrite(LED_ROJO, LOW);

    digitalWrite(BUZZER, HIGH);
    delay(150);
    digitalWrite(BUZZER, LOW);

  } else {
    lcd.setCursor(0, 0);
    lcd.print("FaceID");
    lcd.setCursor(0, 1);
    lcd.print("No reconocido");

    digitalWrite(LED_VERDE, LOW);
    digitalWrite(LED_ROJO, HIGH);

    digitalWrite(BUZZER, HIGH);
    delay(600);
    digitalWrite(BUZZER, LOW);
  }

  delay(2500);
  mostrarStandby();
}

// ---------- ALERTAS DESDE LA PAGINA WEB ----------
// Estado de emergencia persistente: a diferencia de un acceso normal,
// la emergencia se queda activa en LCD/LED/buzzer hasta que llegue "NORMALIZAR".
bool emergenciaActiva = false;
String tipoEmergenciaActual = "";

// ---------- Patron tipo "sirena" para el buzzer durante emergencias ----------
unsigned long ultimoCambioSirena = 0;
const unsigned long INTERVALO_SIRENA = 120; // ms entre cada cambio de tono (rapido = urgente)
bool tonoAgudo = true;
const int FREQ_AGUDO = 2200;  // Hz
const int FREQ_GRAVE = 1200;  // Hz

void activarAlertaEmergencia(String tipo) {
  escaneando = false;
  emergenciaActiva = true;
  tipoEmergenciaActual = tipo;

  digitalWrite(LED_ESCANEO, LOW);
  digitalWrite(LED_AZUL, LOW);
  digitalWrite(LED_VERDE, LOW);

  lcd.clear();
  if (tipo == "lockdown") {
    lcd.setCursor(0, 0);
    lcd.print("** LOCKDOWN **");
    lcd.setCursor(0, 1);
    lcd.print("Acceso bloqueado");
  } else if (tipo == "evacuacion") {
    lcd.setCursor(0, 0);
    lcd.print("** EVACUACION **");
    lcd.setCursor(0, 1);
    lcd.print("Salida liberada");
  } else {
    lcd.setCursor(0, 0);
    lcd.print("** EMERGENCIA **");
    lcd.setCursor(0, 1);
    lcd.print(tipo.substring(0, 16));
  }

  digitalWrite(LED_ROJO, HIGH);

  // Arranca la sirena de inmediato
  tonoAgudo = true;
  tone(BUZZER, FREQ_AGUDO);
  ultimoCambioSirena = millis();
}

void normalizarSistema() {
  emergenciaActiva = false;
  noTone(BUZZER);
  tipoEmergenciaActual = "";
  digitalWrite(LED_ROJO, LOW);
  digitalWrite(BUZZER, LOW);
  mostrarStandby();
}

// ---------- SENSOR ULTRASONICO ----------
float leerDistancia() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duracion = pulseIn(ECHO_PIN, HIGH, 30000); // timeout 30ms
  if (duracion == 0) return -1;

  float distancia = duracion * 0.0343 / 2; // cm

  // Filtro de lecturas invalidas / ruido tipico del HC-SR04
  if (distancia <= 2 || distancia > 400) return -1;

  return distancia;
}

void onWebSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.printf("Cliente #%u conectado\n", num);
      break;

    case WStype_DISCONNECTED:
      Serial.printf("Cliente #%u desconectado\n", num);
      break;

    case WStype_TEXT: {
      String mensaje = String((char*)payload);
      Serial.println("Mensaje recibido: " + mensaje);

      int separador = mensaje.indexOf(':');
      String tipo = "Acceso";
      String uid = mensaje;
      String prefijo = "";

      if (separador != -1) {
        prefijo = mensaje.substring(0, separador);
        uid = mensaje.substring(separador + 1);
      }

      if (prefijo == "ENTRADA_OK") {
        // El lector ya consulto Supabase y confirmo acceso permitido
        mostrarAcceso(true, uid, "Entrada");
        webSocket.sendTXT(num, "OK");

      } else if (prefijo == "ENTRADA_DENY") {
        // El lector ya consulto Supabase y confirmo acceso denegado
        mostrarAcceso(false, uid, "Entrada");
        webSocket.sendTXT(num, "DENEGADO");

      } else if (prefijo == "SALIDA_OK") {
        mostrarAcceso(true, uid, "Salida");
        webSocket.sendTXT(num, "OK");

      } else if (prefijo == "SALIDA_DENY") {
        mostrarAcceso(false, uid, "Salida");
        webSocket.sendTXT(num, "DENEGADO");

      } else if (prefijo == "REGISTRO_OK") {
        // Confirmacion de tarjeta vinculada exitosamente
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Tarjeta OK");
        lcd.setCursor(0, 1);
        lcd.print(uid.substring(0, 16));
        digitalWrite(LED_VERDE, HIGH);
        digitalWrite(BUZZER, HIGH);
        delay(150);
        digitalWrite(BUZZER, LOW);
        delay(2500);
        mostrarStandby();
        webSocket.sendTXT(num, "OK");

      // ---- Compatibilidad: si algun otro ESP aun manda ENTRADA/SALIDA sin resultado ----
      } else if (prefijo == "ENTRADA") {
        mostrarAcceso(false, uid, "Entrada"); // sin validacion Supabase = mostrar denegado por seguridad
        webSocket.sendTXT(num, "DENEGADO");

      } else if (prefijo == "SALIDA") {
        mostrarAcceso(false, uid, "Salida");
        webSocket.sendTXT(num, "DENEGADO");

      } else if (prefijo == "FACEID") {
        bool reconocido = (uid != "DESCONOCIDO");
        mostrarFaceID(reconocido, uid);
        webSocket.sendTXT(num, reconocido ? "OK" : "DENEGADO");

      } else if (prefijo == "ALERTA") {
        // Formato alterno por si lo usas en otro lugar: "ALERTA:tipo"
        activarAlertaEmergencia(uid);
        webSocket.sendTXT(num, "ALERTA_OK");

      } else if (mensaje.startsWith("EMERGENCIA:")) {
        String tipoEmergencia = mensaje.substring(String("EMERGENCIA:").length());
        activarAlertaEmergencia(tipoEmergencia);
        webSocket.sendTXT(num, "EMERGENCIA_OK");

      } else if (mensaje == "NORMALIZAR") {
        normalizarSistema();
        webSocket.sendTXT(num, "NORMALIZADO");

      } else {
        bool ok = validarUID(uid);
        mostrarAcceso(ok, uid, tipo);
        webSocket.sendTXT(num, ok ? "OK" : "DENEGADO");
      }
      break;
    }

    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(LED_VERDE, OUTPUT);
  pinMode(LED_ROJO, OUTPUT);
  pinMode(LED_AZUL, OUTPUT);
  pinMode(LED_ESCANEO, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW); // estado inicial limpio del TRIG

  Wire.begin();
  lcd.init();
  lcd.backlight();

  lcd.setCursor(0, 0);
  lcd.print("Conectando WiFi");

  if (!WiFi.config(local_IP, gateway, subnet)) {
    Serial.println("Fallo al configurar IP estatica");
  }

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }

  Serial.println("\nConectado!");
  Serial.print("IP del Principal: ");
  Serial.println(WiFi.localIP());

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("IP:");
  lcd.print(WiFi.localIP());
  delay(3000);

  webSocket.begin();
  webSocket.onEvent(onWebSocketEvent);

  // Pequeña espera para que el sensor HC-SR04 se estabilice tras encender
  delay(500);

  mostrarStandby();
}

void loop() {
  webSocket.loop();

  // ---------- Mientras hay una emergencia activa: sirena alternante, sensor desactivado ----------
  if (emergenciaActiva) {
    if (millis() - ultimoCambioSirena > INTERVALO_SIRENA) {
      ultimoCambioSirena = millis();
      tonoAgudo = !tonoAgudo;
      tone(BUZZER, tonoAgudo ? FREQ_AGUDO : FREQ_GRAVE);
      digitalWrite(LED_ROJO, tonoAgudo ? HIGH : LOW); // parpadeo sincronizado con la sirena
    }
    return; // no procesar sensor ni parpadeo normal mientras dura la emergencia
  }

  // ---------- Lectura del sensor (solo si no estamos ya escaneando) ----------
  static unsigned long ultimaLectura = 0;
  static int lecturasValidasSeguidas = 0; // anti-falso-positivo

  if (!escaneando && millis() - ultimaLectura > 300) {
    ultimaLectura = millis();

    float distancia = leerDistancia();

    if (distancia > 0 && distancia < DISTANCIA_ACTIVACION) {
      lecturasValidasSeguidas++;
    } else {
      lecturasValidasSeguidas = 0;
    }

    // Exige 2 lecturas seguidas por debajo del umbral antes de activar,
    // esto evita que ruido electrico / eco aislado dispare la camara solo.
    if (lecturasValidasSeguidas >= 2) {
      if (millis() - ultimaDeteccion > COOLDOWN_SENSOR) {
        ultimaDeteccion = millis();
        lecturasValidasSeguidas = 0;
        Serial.println("Persona detectada, activando camara...");

        escaneando = true;
        mostrarEscaneando();
        webSocket.broadcastTXT("ACTIVAR_CAMARA");
      }
    }
  }

  // ---------- Parpadeo del LED de escaneo (no bloqueante) ----------
  if (escaneando) {
    if (millis() - ultimoParpadeo > INTERVALO_PARPADEO) {
      ultimoParpadeo = millis();
      estadoLedEscaneo = !estadoLedEscaneo;
      digitalWrite(LED_ESCANEO, estadoLedEscaneo);
    }
  }
}
