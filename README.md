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

Requisitos: Node 20+, Yarn 1, Docker. En Windows use Git Bash; si `yarn` no está
instalado, `corepack yarn@1.22.22 <comando>` funciona sin instalar nada (o
`npm i -g yarn`). Docker Desktop guarda su disco en C:, así que conviene dejar al
menos 10 GB libres.

Si el 5433 ya está ocupado, levante la infraestructura con otro puerto y use el
mismo en `DB_PORT` del `.env`: `DB_PORT=5434 docker compose up -d`. Para liberar un
puerto en Windows:
`Get-NetTCPConnection -LocalPort 3001 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ }`
(PowerShell).

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
yarn semilla                   # 3 días de historial para mostrar el método "perfil"
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
| `cisterna/<código>/estado` | Al conectar `online` (retenido); como *Last Will* `offline`, también **retenido** | `online` / `offline` |

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
desde la plataforma, así el firmware no necesita recompilarse. El backend vuelve
a publicar este mensaje cada vez que se reconecta al broker.

Respaldo local: si el ESP8266 pasa 60 s sin conexión al broker, debe decidir el
LED y el buzzer por su cuenta con umbrales de distancia propios. Para la maqueta
(H = 20 cm, A = 150 cm2): nivel bajo si d > 14 cm y crítico si d > 17 cm.

Prueba rápida desde la terminal:

```bash
docker exec cisterna_mosquitto mosquitto_pub -t cisterna/demo/nivel -m '{"distancia": 8.5}'
docker exec cisterna_mosquitto mosquitto_sub -t 'cisterna/#' -v
```

## Demo en red local (celular)

1. Conecte la laptop, el ESP8266 y el celular a la misma red. Un hotspot de
   celular evita los portales cautivos de las redes de la universidad.
2. Busque la IP de la laptop con `ipconfig` (Dirección IPv4, p. ej. `192.168.0.8`).
3. Backend: en `artefactos_backend/.env` ponga `FRONTEND_URL=*` para aceptar
   la página desde cualquier IP de la red.
4. Frontend: deje `NEXT_PUBLIC_API_URL` vacío. La página usa su mismo host y el
   puerto `NEXT_PUBLIC_API_PORT` (3001 por defecto). Córralo en modo producción:
   ```bash
   cd artefactos_frontend
   npm run build
   npx next start -H 0.0.0.0
   ```
5. Firewall de Windows (PowerShell como administrador), con la red marcada como
   privada:
   ```powershell
   New-NetFirewallRule -DisplayName "Cisterna demo" -Direction Inbound -Protocol TCP -LocalPort 3000,3001,1883 -Action Allow -Profile Private
   ```
6. En el celular abra `http://<IP>:3000`. El ESP8266 usa `mqtt://<IP>:1883`.

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
   ventana (30 min por defecto). Negativo = vaciando, positivo = llenando. Solo
   hay tendencia si |Q| supera el 1 % de la capacidad por hora y 3 veces el
   error estándar de la pendiente (prueba de significancia), así el ruido del
   sensor con el agua quieta no se confunde con consumo.
3. **Perfil por hora C_h**: se guarda el consumo de cada día y hora (tabla
   `daily_consumption`) y C_h se calcula aplicando `C_h = 0.3 x día + 0.7 x C_h
   anterior` en orden de fecha. Reprocesar un día lo reemplaza; al arrancar y a
   las 00:05 se procesan todos los días pendientes. Las variaciones menores que
   la resolución del sensor no cuentan como consumo.
4. **Tiempo restante**: con menos de 3 días de perfil, `t = (V − V_reserva) / |Q|`;
   después, simulación hora por hora (hora actual con Q, siguientes con C_h; las
   horas sin datos usan el promedio de las horas con datos).
   Si se está llenando, `t = (capacidad - V) / Q`. Cada lectura guarda el caudal
   y el tiempo estimado en ese momento, y se pueden exportar a CSV.
5. **Turbidez**: solo cuenta si el nivel lleva `stableMinutes` quieto. "Cisterna
   limpia" guarda el voltaje de referencia; 3 lecturas válidas seguidas, tomadas
   después de la última limpieza, bajo el 80 % de la referencia vigente generan
   el aviso de limpieza. Además hay recordatorio por días desde la última limpieza.

Las fórmulas están en [water-math.ts](artefactos_backend/src/common/water-math.ts)
con sus pruebas (incluye el ejemplo de 550 L / 30 L/h = 18.3 h).

## Consejos para la demostración (recipiente de 3 L)

En **Configuración** de la cisterna: H y A del recipiente real, ventana del
caudal de 2–5 min y "minutos de nivel quieto" en 1 para que la turbidez responda
rápido. El firmware debe publicar cada 5 s. Para mostrar el método "perfil" sin
esperar 3 días, cargue el historial con `yarn semilla` antes de la demo. "Procesar
hoy" en el tablero incorpora las lecturas del día al perfil y se puede repetir sin
duplicar. Los botones "Descargar CSV" del tablero dan los datos para la validación
con cronómetro y las gráficas del documento.
