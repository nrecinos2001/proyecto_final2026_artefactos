# Guía de operación: configuración, límites y pruebas de los flujos

Esta guía explica cómo cambiar los datos de una cisterna, qué límites usa el
sistema y dónde se ajustan, y cómo comprobar paso a paso que cada flujo
funciona (nivel, alertas, tiempo restante, turbidez, desconexión y perfil).

Antes de empezar, el sistema tiene que estar corriendo (ver el
[README principal](../README.md)):

```bash
cd artefactos_backend && docker compose up -d && yarn start:dev   # terminal 1
cd artefactos_frontend && npm run dev                             # terminal 2
```

Todos los comandos de esta guía se ejecutan en una terminal aparte y usan
estas variables:

```bash
API=http://localhost:3001/api
J='Content-Type: application/json'
# id de la cisterna con código "demo" (cámbielo por el código que use)
ID=$(curl -s $API/devices | jq -r '.[] | select(.code=="demo") | .id')
echo $ID
```

> Si todavía no existe la cisterna `demo`, publique cualquier lectura con ese
> código (paso 2.1) y se registra sola.

En Windows los comandos funcionan en Git Bash. `jq` se instala con
`winget install jqlang.jq`. Si el backend corre en otro puerto (por ejemplo 3101
porque el 3001 está ocupado), cambie `API` en consecuencia.

---

## 1. Actualizar datos y límites

### 1.1 Desde la plataforma web

- **Tablero** → botón **Configuración** (`/cisternas/<id>/configuracion`).
- Ahí se editan nombre, geometría, umbrales, turbidez, tabla de calibración y
  mantenimiento (reiniciar el perfil o eliminar la cisterna).
- Los cambios se aplican de inmediato a las lecturas nuevas; las lecturas ya
  guardadas conservan los litros y el porcentaje con que se calcularon.

### 1.2 Desde la API

Se envían solo los campos que se quieren cambiar:

```bash
curl -s -X PATCH $API/devices/$ID -H "$J" -d '{
  "name": "Maqueta 3 L",
  "heightCm": 20,
  "areaCm2": 150,
  "capacityLiters": 3
}' | jq
```

Crear una cisterna nueva (si no se manda `capacityLiters`, se calcula A × H / 1000):

```bash
curl -s -X POST $API/devices -H "$J" -d '{
  "code": "cisterna-01",
  "name": "Cisterna de la casa",
  "heightCm": 100,
  "areaCm2": 11000
}' | jq
```

### 1.3 Campos configurables por cisterna

| Campo | Qué controla | Por defecto | Rango aceptado |
|---|---|---|---|
| `name` | Nombre visible | `Cisterna <código>` | 1–120 caracteres |
| `heightCm` | **H**: distancia del sensor (tapa) al fondo | 20 | > 0 |
| `areaCm2` | **A**: área de la base | 150 | > 0 |
| `capacityLiters` | Volumen que equivale al 100 % | 3 | > 0 |
| `lowPercent` | Umbral de **nivel bajo** (aviso + LED rojo) | 30 | 0–100 |
| `criticalPercent` | Umbral de **nivel crítico** (buzzer + apagar bomba) | 15 | 0–100, debe ser ≤ `lowPercent` |
| `reservePercent` | Reserva que protege la bomba; es la meta del tiempo restante | 10 | 0–100 |
| `windowMinutes` | Ventana de la regresión lineal del caudal | 30 | 1–1440 |
| `stableMinutes` | Minutos con el nivel quieto para aceptar una lectura de turbidez | 10 | 0–1440 |
| `turbidityThresholdRatio` | Fracción de la referencia bajo la cual el agua cuenta como turbia | 0.8 | 0.05–1 |
| `turbidityConsecutive` | Lecturas válidas seguidas bajo el umbral para avisar | 3 | 1–100 |
| `turbidityReferenceVoltage` | Voltaje del agua limpia (normalmente lo fija "Cisterna limpia") | — | > 0 |
| `cleaningIntervalDays` | Días entre limpiezas para el recordatorio | 180 | 1–3650 |

El backend rechaza con **400** los valores fuera de rango, los campos que no
existen y un `criticalPercent` mayor que `lowPercent`.

### 1.4 Tabla de calibración (cisternas irregulares)

Con **dos o más puntos**, el volumen se interpola en la tabla en lugar de usar
V = A × (H − d). Con la lista vacía se vuelve a la fórmula.

```bash
# Reemplaza la tabla completa
curl -s -X PUT $API/devices/$ID/calibration -H "$J" -d '{
  "points": [
    { "distanceCm": 2,  "liters": 3.0 },
    { "distanceCm": 8,  "liters": 1.9 },
    { "distanceCm": 14, "liters": 0.9 },
    { "distanceCm": 20, "liters": 0.0 }
  ]
}' | jq

# Volver a la fórmula
curl -s -X PUT $API/devices/$ID/calibration -H "$J" -d '{"points": []}'
```

### 1.5 Variables de entorno

**Backend** (`artefactos_backend/.env`, se leen al iniciar; reinicie el backend tras cambiarlas):

| Variable | Uso | Por defecto |
|---|---|---|
| `PORT` | Puerto de la API | 3001 |
| `FRONTEND_URL` | Orígenes permitidos por CORS (separados por coma). `*` acepta cualquiera, útil para la demo en red local | http://localhost:3000 |
| `TZ` | Zona horaria para el perfil por hora | America/El_Salvador |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Conexión a PostgreSQL | localhost, 5433, cisterna… |
| `DB_SYNCHRONIZE` | Crear/actualizar tablas desde las entidades | true |
| `MQTT_URL` | Broker | mqtt://localhost:1883 |
| `MQTT_USERNAME`, `MQTT_PASSWORD` | Credenciales del broker (vacías en desarrollo) | — |
| `MQTT_TOPIC_PREFIX` | Prefijo de los tópicos | cisterna |
| `MQTT_AUTO_REGISTER` | Registrar cisternas desconocidas al recibir su primer mensaje | true |
| `DEVICE_OFFLINE_MINUTES` | Minutos sin mensajes para marcar "sensor desconectado" | 5 |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_IDS` | Bot y chats (separados por coma) que reciben cada alerta nueva. Vacías = avisos desactivados | (vacías) |

**Frontend** (`artefactos_frontend/.env.local` o `.env`):

| Variable | Uso | Por defecto |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | URL completa de la API. Vacía: la página usa su mismo host | (vacía) |
| `NEXT_PUBLIC_API_PORT` | Puerto de la API cuando `NEXT_PUBLIC_API_URL` está vacía | 3001 |

Next.js lee estas variables al compilar, así que hay que reiniciar `npm run dev`
(o volver a ejecutar `npm run build`) después de cambiarlas.

### 1.6 Límites fijos en el código

Estos valores no se configuran desde la web; para cambiarlos hay que editar el
archivo indicado.

| Constante | Valor | Archivo | Efecto |
|---|---|---|---|
| `LEVEL_HYSTERESIS` | 2 puntos % | `src/monitoring/ingestion.service.ts` | Para salir de "bajo" o "crítico" el nivel debe subir 2 puntos sobre el umbral (evita parpadeo) |
| Tolerancia de nivel quieto | máx(1 % de la capacidad, 0.5 cm de altura) | `src/monitoring/ingestion.service.ts` | Cambios menores no reinician el contador de `stableMinutes` |
| `REFERENCE_LOOKBACK_MS` | 15 min | `src/monitoring/ingestion.service.ts` | "Cisterna limpia" promedia hasta 3 lecturas válidas de los últimos 15 min |
| `STABLE_FLOW_RATIO` | 1 % de la capacidad por hora | `src/common/water-math.ts` | Caudal mínimo para hablar de "vaciando" o "llenando" |
| `SLOPE_SIGNIFICANCE` | 3 errores estándar | `src/common/water-math.ts` | La pendiente también debe superar 3 veces su error estándar; así el ruido del sensor con el agua quieta se ve como "sin consumo" |
| `PROFILE_MIN_DAYS` | 3 días | `src/common/water-math.ts` | Días de perfil necesarios antes de usar el cálculo hora por hora |
| `EMA_ALPHA` | 0.3 | `src/common/water-math.ts` | Peso del día nuevo en C_h |
| `MAX_ESTIMATE_HOURS` | 168 h (7 días) | `src/common/water-math.ts` | Más allá se muestra "Más de 7 días" |
| `NOISE_RATIO`, `SENSOR_RESOLUTION_CM` | máx(0.5 % de la capacidad, A x 0.3 cm) | `src/common/water-math.ts` | Subidas y bajadas menores no cuentan como consumo ni como llenado en el perfil |
| `MAX_CARRY_GAP_MS` | 15 min | `src/common/water-math.ts` | La última lectura de una hora solo se usa como punto de partida de la siguiente si está a 15 min o menos |
| `PROFILE_BACKFILL_DAYS` | 30 días | `src/common/water-math.ts` | Máximo de días pendientes que se procesan al arrancar |
| Distancia válida | 0–1000 cm | `src/common/payload.ts` | Fuera de rango, el mensaje se descarta |
| Voltaje válido | 0–5 V (`raw` 0–1023 → 0–3.3 V) | `src/common/payload.ts` | Fuera de rango, el mensaje se descarta |

Tareas programadas: la revisión de desconexión corre **cada minuto**; el
recordatorio de limpieza, **cada hora**; y el perfil, **a las 00:05** y al
iniciar el backend, procesando todos los días pendientes desde el último
procesado (si la laptop estuvo apagada varios días, se ponen al día todos).

### 1.7 Valores recomendados para la maqueta de 3 L

Para que todo responda rápido durante la presentación:

```bash
curl -s -X PATCH $API/devices/$ID -H "$J" -d '{
  "heightCm": 20, "areaCm2": 150, "capacityLiters": 3,
  "windowMinutes": 2, "stableMinutes": 1, "turbidityConsecutive": 3
}' | jq '{heightCm, areaCm2, capacityLiters, windowMinutes, stableMinutes}'
```

La ventana de 2 min necesita al menos 3 lecturas, así que en la demo el firmware
debe publicar cada 5 s. Con lecturas cada 60 s nunca hay caudal ni tiempo restante.

Mida H y A del recipiente real. Con H = 20 cm y A = 150 cm², el porcentaje
es **5 × (20 − d)**, así que cada distancia equivale a:

| Distancia `d` (cm) | Litros | % | Estado esperado |
|---|---|---|---|
| 2 | 2.70 | 90 | normal |
| 8.5 | 1.73 | 57.5 | normal |
| 15 | 0.75 | 25 | bajo |
| 17.5 | 0.38 | 12.5 | crítico |
| 18.5 | 0.23 | 7.5 | crítico (bajo la reserva: tiempo restante "En reserva") |

---

## 2. Corroborar los flujos

Abra en paralelo:

- El tablero: `http://localhost:3000/cisternas/<id>`.
- Un monitor del broker:
  ```bash
  docker exec cisterna_mosquitto mosquitto_sub -t 'cisterna/#' -v
  ```
- (Opcional) Los eventos en vivo que recibe el navegador:
  ```bash
  curl -N $API/events?deviceId=$ID
  ```

Las lecturas se pueden inyectar de dos formas:

- **Por MQTT** (prueba el camino real del ESP8266):
  ```bash
  docker exec cisterna_mosquitto mosquitto_pub -t cisterna/demo/nivel -m '{"distancia": 8.5}'
  ```
- **Por HTTP**, sin pasar por el broker (igual que el panel "Simular lecturas" del tablero):
  ```bash
  curl -s -X POST $API/devices/$ID/simulate -H "$J" -d '{"kind":"nivel","value":8.5}'
  ```

Un atajo para ver el estado resumido:

```bash
st() { curl -s $API/devices/$ID/status | jq '{online, level, flow, estimate: (.estimate|{mode,method,hours,eta}), turbidity: (.turbidity|{status,ratio,valid,referenceVoltage,levelStable}), cleaning, alerts: [.alerts[].type]}'; }
st
```

### 2.1 Conexión y lectura de nivel

```bash
curl -s $API/health
# {"status":"ok","mqtt":"conectado"}

docker exec cisterna_mosquitto mosquitto_pub -t cisterna/demo/nivel -m '{"distancia": 8.5}'
st
```

**Resultado esperado:**
- `level.distanceCm` = 8.5, `liters` ≈ 1.725, `percent` = 57.5, `state` = `normal`.
- El tablero se actualiza solo, sin recargar la página.

También se aceptan `8.5` sin JSON y `{"distanceCm": 8.5}`. Un payload inválido
(p. ej. `hola`) se descarta y aparece un aviso en el log del backend.

### 2.2 Alertas de nivel, LED/buzzer y histéresis

```bash
pub() { docker exec cisterna_mosquitto mosquitto_pub -t cisterna/demo/nivel -m "{\"distancia\": $1}"; sleep 1; }
pub 15;   st | jq '{s: .level.state, a: .alerts}'   # 25 %   → bajo,    alerta NIVEL_BAJO
pub 17.5; st | jq '{s: .level.state, a: .alerts}'   # 12.5 % → critico, NIVEL_CRITICO (se resuelve NIVEL_BAJO)
pub 16.8; st | jq '{s: .level.state, a: .alerts}'   # 16 %   → sigue critico (histéresis: hace falta ≥ 17 %)
pub 16;   st | jq '{s: .level.state, a: .alerts}'   # 20 %   → bajo
pub 13;   st | jq '{s: .level.state, a: .alerts}'   # 35 %   → normal, sin alertas de nivel
```

**Resultado esperado:**
- En el monitor del broker, cada cambio de estado publica en `cisterna/demo/alerta` (retenido):
  ```
  {"estado":"bajo","led":"rojo","buzzer":false,"bomba":true,"porcentaje":25}
  {"estado":"critico","led":"rojo","buzzer":true,"bomba":false,"porcentaje":12.5}
  {"estado":"normal","led":"verde","buzzer":false,"bomba":true,"porcentaje":35}
  ```
- En la web aparecen el aviso emergente y el banner de la alerta. "Enterado"
  la marca como vista (`POST /alerts/:id/ack`).
- Para revisar el último mensaje retenido:
  ```bash
  docker exec cisterna_mosquitto mosquitto_sub -t cisterna/demo/alerta -C 1
  ```

### 2.3 Caudal y tiempo restante (vaciado)

Con `windowMinutes` = 2 (sección 1.7), envíe una lectura cada 5 s bajando el
agua 0.2 cm por lectura (0.03 L cada 5 s = 21.6 L/h):

```bash
for d in $(LC_ALL=C seq 8 0.2 11); do
  docker exec cisterna_mosquitto mosquitto_pub -t cisterna/demo/nivel -m "{\"distancia\": $d}"
  sleep 5
done
st | jq '{flow, estimate}'
```

**Resultado esperado:**
- `flow.trend` = `vaciando` y `flow.litersPerHour` ≈ −21.6.
- `estimate.method` = `directo` mientras el perfil tenga menos de 3 días.
- `estimate.hours` ≈ (litros actuales − 0.3 L de reserva) / 21.6. Por ejemplo,
  con d = 11 (1.35 L) da ≈ 0.049 h ≈ 3 min.
- En el tablero, la tarjeta "Tiempo restante de agua" muestra la duración y la hora aproximada.

**Validación con cronómetro (la del anteproyecto):** saque agua a ritmo
constante, anote el tiempo estimado, y compárelo con el tiempo real hasta que el
nivel cruce la reserva.

Cada lectura guarda el caudal, la tendencia y las horas estimadas en ese momento,
así que el experimento también queda registrado. Con el botón "Descargar CSV" del
historial (o `GET $API/devices/$ID/export?tipo=nivel&from=<ISO>`) se obtiene
`fecha_hora,distancia_cm,litros,porcentaje,caudal_lph,tendencia,horas_estimadas,metodo`.
Para cada fila, la hora estimada de llegada es `fecha_hora + horas_estimadas`; el
error es la diferencia con la hora real en que `porcentaje` cruzó la reserva. El
promedio de los errores absolutos es el dato para la sección de resultados del
documento y del artículo. `tipo=turbidez` exporta
`fecha_hora,voltaje,raw,valida,razon` para la prueba de agua limpia contra agua
con tierra.

**Comprobar la fórmula con el ejemplo del documento** (1100 L, 660 L, reserva
110 L, 30 L/h → 18.3 h). Está cubierto por las pruebas unitarias:

```bash
cd artefactos_backend && yarn test
```

### 2.4 Tiempo de llenado

Igual que el paso anterior, pero bajando la distancia (el agua sube):

```bash
for d in $(LC_ALL=C seq 11 -0.2 8); do
  docker exec cisterna_mosquitto mosquitto_pub -t cisterna/demo/nivel -m "{\"distancia\": $d}"
  sleep 5
done
st | jq '{flow, estimate}'
```

**Resultado esperado:** `trend` = `llenando`, caudal positivo, y la tarjeta
cambia a "Tiempo para llenarse" con `hours` = (capacidad − litros actuales) / Q.
Si no se envían lecturas que cambien durante la ventana, el modo pasa a `estable`
("Sin consumo").

### 2.5 Turbidez y aviso de limpieza

Requisito: `stableMinutes` = 1 (sección 1.7).

```bash
tpub() { docker exec cisterna_mosquitto mosquitto_pub -t cisterna/demo/turbidez -m "{\"voltaje\": $1}"; sleep 1; }

# 1) Nivel fijo y esperar más de 1 minuto sin que cambie
docker exec cisterna_mosquitto mosquitto_pub -t cisterna/demo/nivel -m '{"distancia": 8}'
sleep 70

# 2) Agua limpia: lectura válida y fijar la referencia
tpub 2.8
curl -s -X POST $API/devices/$ID/clean | jq '.turbidity'
#    referenceVoltage: 2.8, status: "limpia"

# 3) Agua con tierra: 3 lecturas seguidas bajo el 80 % (2.8 × 0.8 = 2.24 V)
tpub 2.0; tpub 1.9; tpub 1.8
st | jq '{t: .turbidity.status, a: .alerts}'
#    status: "turbia", alerta TURBIDEZ ("Se recomienda limpiar la cisterna")

# 4) Agua limpia otra vez: 3 lecturas sobre el umbral resuelven la alerta
tpub 2.8; tpub 2.8; tpub 2.8
st | jq '{t: .turbidity.status, a: .alerts}'
```

**Comportamiento que conviene verificar:**
- **Lecturas con el nivel en movimiento:** si se envía turbidez antes de que el
  nivel lleve `stableMinutes` quieto, la lectura se guarda con `valid: false`, no
  cuenta para el aviso, y el tablero muestra "(nivel en movimiento)".
- **"Cisterna limpia" sin lecturas válidas recientes:** queda en
  `esperando_referencia` y toma como referencia la próxima lectura válida.
- **Alerta TURBIDEZ:** "Cisterna limpia" la resuelve, al igual que
  `LIMPIEZA_PROGRAMADA`, y reinicia el conteo de días.
- **Formato `raw`:** también se acepta, p. ej. `{"raw": 868}` → 2.8 V.

### 2.6 Desconexión del sensor

Hay dos caminos para comprobarla:

```bash
# a) Last Will / mensaje explícito
docker exec cisterna_mosquitto mosquitto_pub -t cisterna/demo/estado -m offline
st | jq '{online, alerts}'      # online: false, alerta DESCONECTADO

docker exec cisterna_mosquitto mosquitto_pub -t cisterna/demo/estado -m online
st | jq '{online, alerts}'      # online: true, alerta resuelta

# b) Silencio: no enviar nada durante DEVICE_OFFLINE_MINUTES (5 min).
#    La revisión corre cada minuto y crea la alerta; la siguiente lectura la resuelve.
```

`yarn simulador` configura el Last Will: al detenerlo con Ctrl+C el broker
publica `offline` automáticamente.

### 2.7 Perfil de consumo por hora

```bash
# Ver el perfil (24 horas)
curl -s $API/devices/$ID/profile | jq '{days, lastDate, hours: [.hours[] | select(.samples>0)]}'

# Procesar hoy sin esperar a la medianoche (botón "Procesar hoy" del tablero)
curl -s -X POST $API/devices/$ID/profile/recompute -H "$J" -d '{}' | jq

# Procesar un día específico
curl -s -X POST $API/devices/$ID/profile/recompute -H "$J" -d '{"date":"2026-11-14"}' | jq

# Reiniciar el perfil (vuelve a la fórmula directa)
curl -s -X DELETE $API/devices/$ID/profile
```

**Resultado esperado:**
- `consumptionByHour` muestra los litros consumidos en cada hora con lecturas.
  Los llenados no cuentan como consumo.
- `days` es la cantidad de días distintos con lecturas procesadas. Procesar el
  mismo día otra vez reemplaza sus datos: no lo cuenta dos veces.
- Con `days` >= 3, `estimate.method` pasa a `perfil` y el cálculo usa C_h hora
  por hora. Las horas sin datos usan el promedio de las horas con datos.

**Probar el modo `perfil` sin esperar 3 días:** la semilla carga tres días
completos de historial (una lectura por minuto, con picos de consumo de 6:00 a
7:59 y de 18:00 a 19:59) y los procesa. Lee `DB_PORT` y `PORT` del `.env` del
backend. Si la cisterna ya tiene lecturas en esos días se detiene sin borrar nada
(por ejemplo, para no perder las de la validación con cronómetro); con
`--reemplazar` las sustituye.

```bash
cd artefactos_backend
yarn semilla --code=demo --dias=3
yarn semilla --code=demo --dias=3 --reemplazar   # borra las lecturas de esos días y las vuelve a generar
```

Después repita el paso 2.3: `estimate.method` debe ser `perfil`.

### 2.8 Recordatorio de limpieza por tiempo

```bash
# Simular que la última limpieza fue hace 200 días
docker exec cisterna_postgres psql -U cisterna -d cisterna -c \
  "update devices set \"lastCleanedAt\" = now() - interval '200 days' where code = 'demo';"
st | jq '.cleaning'     # due: true, daysSince: 200
```

La alerta `LIMPIEZA_PROGRAMADA` se crea en la siguiente revisión horaria (al
inicio de cada hora). "Cisterna limpia" la resuelve.

### 2.9 Validaciones de la API

Cada uno de estos comandos debe responder **400** con el motivo:

```bash
curl -s -X PATCH $API/devices/$ID -H "$J" -d '{"lowPercent": 5}'          # crítico (15) > bajo (5)
curl -s -X PATCH $API/devices/$ID -H "$J" -d '{"reservePercent": 150}'    # fuera de 0–100
curl -s -X PATCH $API/devices/$ID -H "$J" -d '{"campoInventado": 1}'      # campo no permitido
curl -s -X POST  $API/devices -H "$J" -d '{"code":"con espacio","name":"x"}'  # código inválido
curl -s $API/devices/no-es-uuid                                           # id inválido
```

Además, crear un código repetido responde **409**, y una cisterna inexistente,
**404**.

### 2.10 Prueba de punta a punta con el simulador

```bash
cd artefactos_backend
yarn simulador --interval=2 --rate=10 --pausa=90            # se vacía y se llena, 90 s quieto en cada extremo
yarn simulador --interval=2 --rate=10 --pausa=90 --turbia   # además el agua se ensucia después de la primera pausa
yarn simulador --quieto --turbia                             # nivel fijo; el agua se ensucia pasados 120 s
```

**Resultado esperado:** el tablero recorre normal → bajo → crítico → llenando →
normal, con sus alertas, y el simulador imprime los mensajes `alerta` que recibe
del backend (lo mismo que verá el ESP8266).

Con `--turbia` y `stableMinutes` = 1 (sección 1.7):

1. Presione "Cisterna limpia" antes de la primera pausa o durante ella. La primera
   lectura válida (con el nivel quieto 1 min) queda como referencia de agua limpia.
2. Al terminar la primera pausa el agua empieza a ensuciarse.
3. En la segunda pausa, tras 3 lecturas válidas bajo el 80 % de la referencia,
   aparece el aviso TURBIDEZ.

---

## 3. Revisar los datos directamente en PostgreSQL

```bash
docker exec -it cisterna_postgres psql -U cisterna -d cisterna
```

> Las columnas están en camelCase y deben ir entre comillas dobles.

```sql
-- Configuración y estado de las cisternas
select code, name, "capacityLiters", "lowPercent", "criticalPercent", "reservePercent",
       "levelState", "lastSeenAt", "profileDays"
from devices;

-- Últimas lecturas de nivel
select "createdAt", "distanceCm", round(liters::numeric, 3) l, round(percent::numeric, 1) pct
from level_readings order by id desc limit 10;

-- Últimas lecturas de turbidez
select "createdAt", voltage, valid, round(ratio::numeric, 2) ratio
from turbidity_readings order by id desc limit 10;

-- Alertas activas
select id, type, severity, message, "createdAt" from alerts where active order by id desc;

-- Consumo por día y hora (de aquí se calcula el perfil C_h)
select date, hour, round(liters::numeric, 3) litros from daily_consumption order by date, hour;
```

## 4. Limpiar los datos de prueba

```bash
# Borrar solo las lecturas, alertas y perfil (se conservan las cisternas)
docker exec cisterna_postgres psql -U cisterna -d cisterna -c \
  "truncate level_readings, turbidity_readings, alerts, daily_consumption;
   update devices set \"levelState\" = null, \"levelStableSince\" = null, \"levelStableRefLiters\" = null,
                      \"profileDays\" = 0, \"profileLastDate\" = null;"

# Eliminar una cisterna con todo su historial
curl -s -X DELETE $API/devices/$ID

# Borrar toda la base (las tablas se recrean al iniciar el backend)
cd artefactos_backend && docker compose down -v && docker compose up -d
```

> Después de borrar alertas a mano, el mensaje retenido `cisterna/<código>/alerta`
> del broker conserva el último estado hasta la siguiente lectura de nivel.
