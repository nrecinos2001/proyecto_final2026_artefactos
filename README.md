# Sistema de Monitoreo IoT para Reservas de Agua en Hogares

Plataforma web y backend del proyecto de Programación de Artefactos (UCA). El
ESP8266 mide la distancia al agua (HC-SR04) y la turbidez, publica por MQTT, y
la plataforma muestra nivel, litros, tiempo restante, calidad del agua y alertas.

```
ESP8266 ──MQTT──► Mosquitto ──► Backend NestJS ──► PostgreSQL
   ▲                                │  REST /api + eventos en vivo (SSE)
   └──── cisterna/<código>/alerta ◄─┘            ▼
                                         Frontend Next.js
```

| Carpeta | Contenido |
|---|---|
| [artefactos_backend/](artefactos_backend/) | API NestJS + TypeORM, cliente MQTT, cálculos, `docker-compose.yml` (Mosquitto + PostgreSQL) |
| [artefactos_frontend/](artefactos_frontend/) | Plataforma web Next.js |

## Puesta en marcha

Requisitos: Node 20+, Yarn 1, Docker.

```bash
# 1. Infraestructura (Mosquitto en 1883/9001 y PostgreSQL en 5433)
cd artefactos_backend
cp .env.example .env
docker compose up -d

# 2. Backend → http://localhost:3001/api
yarn install
yarn start:dev

# 3. Frontend → http://localhost:3000
cd ../artefactos_frontend
cp .env.example .env.local
npm install
npm run dev

# 4. (Opcional) Simular el ESP8266 sin hardware
cd ../artefactos_backend
yarn simulador                 # cisterna "demo" que se vacía y se llena, con pausas
yarn simulador --turbia        # además el agua se ensucia después de la primera pausa
```

Las tablas se crean solas (`DB_SYNCHRONIZE=true`). Una cisterna nueva se registra
automáticamente con el primer mensaje MQTT que publique su código.

Para cambiar la configuración y los límites, y para probar cada flujo paso a
paso, vea la [guía de operación](docs/OPERACION.md).

## Contrato MQTT para el firmware del ESP8266

Broker: `mqtt://<ip-del-servidor>:1883`, sin usuario en desarrollo. `<código>` es
el identificador de la cisterna (letras, números, `-`, `_`), p. ej. `cisterna-01`.

### El ESP8266 publica

| Tópico | Cuándo | Payload (cualquiera de estas formas) |
|---|---|---|
| `cisterna/<código>/nivel` | Cada 60 s en uso real y cada 5 s en modo demo (la ventana de 2 min de la maqueta necesita al menos 3 lecturas): 10 mediciones, descartar extremos, enviar la **mediana** | `{"distancia": 12.4}` (cm) · o solo `12.4` |
| `cisterna/<código>/turbidez` | Cada minuto (el backend descarta las tomadas con el nivel en movimiento) | `{"voltaje": 2.41}` · `{"raw": 748}` (ADC 0–1023) · o ambos |
| `cisterna/<código>/estado` | Al conectar `online` (retenido); como *Last Will* `offline` | `online` / `offline` |

- La distancia es del sensor (tapa) a la superficie del agua, en centímetros.
- El voltaje de turbidez es el de la entrada A0 (después del divisor 10 kΩ / 20 kΩ).
  Si se envía solo `raw`, el backend calcula `raw / 1023 × 3.3`.
- QoS 1 recomendado.

### El ESP8266 se suscribe

`cisterna/<código>/alerta` (retenido, se publica cuando cambia el estado del nivel):

```json
{ "estado": "critico", "led": "rojo", "buzzer": true, "bomba": false, "porcentaje": 8.2 }
```

| estado | led | buzzer | bomba |
|---|---|---|---|
| `normal` | `verde` | `false` | `true` |
| `bajo` | `rojo` | `false` | `true` |
| `critico` | `rojo` | `true` | `false` (apagar para que no trabaje en seco) |

Los umbrales (bajo 30 %, crítico 15 %, reserva 10 % por defecto) se configuran
desde la plataforma, así el firmware no necesita recompilarse.

Prueba rápida desde la terminal:

```bash
docker exec cisterna_mosquitto mosquitto_pub -t cisterna/demo/nivel -m '{"distancia": 8.5}'
docker exec cisterna_mosquitto mosquitto_sub -t 'cisterna/#' -v
```

## Avisos por Telegram

Cada alerta nueva (nivel bajo, nivel crítico, agua turbia, limpieza programada o
sensor desconectado) se envía por Telegram, así llega al celular aunque la
plataforma esté cerrada o el celular use datos móviles. El servidor necesita
salida a internet.

1. En Telegram, abra el chat con `@BotFather`, envíe `/newbot` y copie el token.
2. Cada persona que quiera recibir avisos abre el bot nuevo y le envía `/start`.
3. Abra `https://api.telegram.org/bot<token>/getUpdates` en el navegador y copie
   el `message.chat.id` de cada persona.
4. En `artefactos_backend/.env`:
   ```
   TELEGRAM_BOT_TOKEN=<token>
   TELEGRAM_CHAT_IDS=<id1>,<id2>
   ```
5. Reinicie el backend y publique un nivel crítico para probar:
   `docker exec cisterna_mosquitto mosquitto_pub -t cisterna/demo/nivel -m '{"distancia": 17.5}'`.

Sin esas variables los avisos quedan desactivados (el log lo indica al iniciar).
Si Telegram no responde, la alerta se guarda y se muestra igual, y el error queda
en el log con el código de respuesta.

## Cómo se calcula (resumen del anteproyecto)

1. **Distancia → litros**: `V = A × (H − d)`, o interpolación en la tabla de
   calibración si se cargan 2+ puntos (cisternas irregulares).
2. **Caudal Q**: regresión lineal de litros contra tiempo con las lecturas de la
   ventana (30 min por defecto). Negativo = vaciando, positivo = llenando.
3. **Perfil por hora C_h**: cada medianoche se calcula el consumo de cada hora
   del día anterior y se actualiza `C_h = 0.3 × hoy + 0.7 × C_h anterior`.
4. **Tiempo restante**: con menos de 3 días de perfil, `t = (V − V_reserva) / |Q|`;
   después, simulación hora por hora (hora actual con Q, siguientes con C_h).
   Si se está llenando, `t = (capacidad − V) / Q`.
5. **Turbidez**: solo cuenta si el nivel lleva `stableMinutes` quieto. "Cisterna
   limpia" guarda el voltaje de referencia; 3 lecturas válidas seguidas bajo el
   80 % de la referencia generan el aviso de limpieza. Además hay recordatorio por
   días desde la última limpieza.

Las fórmulas están en [water-math.ts](artefactos_backend/src/common/water-math.ts)
con sus pruebas (incluye el ejemplo de 550 L / 30 L/h = 18.3 h).

## Consejos para la demostración (recipiente de 3 L)

En **Configuración** de la cisterna: H y A del recipiente real, ventana del
caudal de 2–5 min y "minutos de nivel quieto" en 1 para que la turbidez responda
rápido. "Procesar hoy" en el tablero incorpora las lecturas del día al perfil sin
esperar a la medianoche.
