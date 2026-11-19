# Backend — Monitor de Cisterna

NestJS 11 + TypeORM + PostgreSQL + MQTT (Mosquitto). Ver el
[README principal](../README.md) para la puesta en marcha y el contrato MQTT.

```bash
docker compose up -d   # Mosquitto (1883, 9001 ws) + PostgreSQL (5433)
yarn start:dev         # API en http://localhost:3001/api
yarn simulador         # ESP8266 simulado
yarn semilla           # 3 días de historial para la demo del perfil
yarn test              # pruebas unitarias
yarn test:e2e          # pruebas de punta a punta (necesita docker compose arriba)
```

## Estructura

| Ruta | Responsabilidad |
|---|---|
| `src/common/water-math.ts` | Cálculos puros: litros, regresión con prueba de significancia, perfil EMA, tiempo restante, turbidez |
| `src/common/payload.ts` | Lectura tolerante de los payloads del ESP8266 |
| `src/common/csv.ts` | Formato CSV de las exportaciones |
| `src/entities/` | Tablas: `devices`, `calibration_points`, `level_readings`, `turbidity_readings`, `daily_consumption`, `alerts` |
| `src/mqtt/` | Conexión al broker, suscripción, publicación y republicación al reconectar |
| `src/notifications/` | Avisos por Telegram |
| `src/monitoring/ingestion.service.ts` | Procesa cada mensaje: guarda, alertas, LED/buzzer, eventos en vivo |
| `src/monitoring/status.service.ts` | "Foto" del estado de una cisterna (lo que muestra el tablero) |
| `src/monitoring/profile.service.ts` | Perfil de consumo por hora: procesa los días pendientes al arrancar y a las 00:05 |
| `src/events/` | Server-Sent Events hacia el navegador |

## API (`/api`)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del servidor y de MQTT |
| GET / POST | `/devices` | Listar / crear cisterna |
| GET / PATCH / DELETE | `/devices/:id` | Ver / configurar / eliminar |
| GET / PUT | `/devices/:id/calibration` | Tabla de calibración (`{ points: [{distanceCm, liters}] }`) |
| GET | `/devices/:id/status` | Nivel, caudal, tiempo restante, turbidez, limpieza y alertas activas |
| GET | `/devices/:id/readings?from&to&maxPoints` | Historial de nivel |
| GET | `/devices/:id/turbidity?from&to&maxPoints` | Historial de turbidez |
| GET | `/devices/:id/export?tipo=nivel\|turbidez&from&to` | Descarga CSV (nivel con caudal y tiempo estimado; turbidez) |
| POST | `/devices/:id/clean` | Botón "Cisterna limpia" |
| GET / DELETE | `/devices/:id/profile` | Perfil por hora / reiniciarlo |
| POST | `/devices/:id/profile/recompute` | Procesar un día (`{ date?: "YYYY-MM-DD" }`) |
| POST | `/devices/:id/simulate` | Inyectar lectura (`{ kind: "nivel" \| "turbidez", value }`) |
| GET | `/alerts?deviceId&active&limit` | Historial de alertas |
| POST | `/alerts/:id/ack` | Marcar alerta como vista |
| GET | `/events?deviceId` | SSE: `status`, `level`, `turbidity`, `alert`, `device` |

## Notas

- `DB_SYNCHRONIZE=true` crea y actualiza las tablas a partir de las entidades.
  Es cómodo para el proyecto; en un despliegue real conviene usar migraciones.
- La zona horaria (`TZ`, por defecto `America/El_Salvador`) define a qué hora
  del día pertenece cada lectura en el perfil de consumo.
- Mosquitto acepta conexiones anónimas; para exponerlo a internet configure
  usuarios en `mosquitto/config/mosquitto.conf` y `MQTT_USERNAME`/`MQTT_PASSWORD`.
