# Backend — Monitor de Cisterna

NestJS 11 + TypeORM + PostgreSQL + MQTT (Mosquitto). Ver el
[README principal](../README.md) para la puesta en marcha y el contrato MQTT.

```bash
docker compose up -d   # Mosquitto (1883, 9001 ws) + PostgreSQL (5433)
yarn start:dev         # API en http://localhost:3001/api
yarn simulador         # ESP8266 simulado
yarn test              # pruebas unitarias de los cálculos
```

## Estructura

| Ruta | Responsabilidad |
|---|---|
| `src/common/water-math.ts` | Cálculos puros: litros, regresión, perfil EMA, tiempo restante |
| `src/common/payload.ts` | Lectura tolerante de los payloads del ESP8266 |
| `src/entities/` | Tablas: `devices`, `calibration_points`, `level_readings`, `turbidity_readings`, `hourly_profiles`, `alerts` |
| `src/mqtt/` | Conexión al broker, suscripción y publicación |
| `src/monitoring/ingestion.service.ts` | Procesa cada mensaje: guarda, alertas, LED/buzzer, eventos en vivo |
| `src/monitoring/status.service.ts` | "Foto" del estado de una cisterna (lo que muestra el tablero) |
| `src/monitoring/profile.service.ts` | Perfil de consumo por hora (tarea de cada medianoche) |
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
