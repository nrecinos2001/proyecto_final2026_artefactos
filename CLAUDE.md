# CLAUDE.md

Sistema de Monitoreo IoT para Reservas de Agua (proyecto UCA, Programación de
Artefactos). Este repo contiene **solo el backend y la plataforma web**. El firmware
del ESP8266 lo hace otra persona; aquí no se toca. La especificación es el
anteproyecto (PDF), resumido en [README.md](README.md).

- Contrato MQTT, puesta en marcha y fórmulas: [README.md](README.md)
- Configuración, límites y pruebas de cada flujo: [docs/OPERACION.md](docs/OPERACION.md)
- Detalle de la API: [artefactos_backend/README.md](artefactos_backend/README.md)

## Arranque (en este orden)

```bash
# 1. Infraestructura: Mosquitto (1883, 9001 ws) + PostgreSQL (host 5433)
cd artefactos_backend && cp -n .env.example .env && docker compose up -d

# 2. Backend NestJS → http://localhost:3001/api   (usar yarn)
cd artefactos_backend && yarn install && yarn start:dev

# 3. Frontend Next.js → http://localhost:3000       (usar npm)
cd artefactos_frontend && cp -n .env.example .env.local && npm install && npm run dev

# 4. Opcional: ESP8266 simulado
cd artefactos_backend && yarn simulador --interval=2 --rate=3
```

Comprobaciones rápidas:

```bash
curl -s localhost:3001/api/health          # {"status":"ok","mqtt":"conectado"}
docker exec cisterna_mosquitto mosquitto_sub -t 'cisterna/#' -v
```

Si un puerto está ocupado por una sesión anterior: `lsof -t -i:3000 -i:3001 | xargs -r kill`.

## Verificación antes de dar algo por terminado

```bash
cd artefactos_backend  && yarn lint && yarn test && yarn build
cd artefactos_frontend && npx tsc --noEmit && npx eslint . && npx next build
```

`yarn test:e2e` necesita la infraestructura levantada.

## Arquitectura

```
ESP8266 ─MQTT─► Mosquitto ─► NestJS (TypeORM) ─► PostgreSQL
                                │ REST /api + SSE /api/events
   cisterna/<code>/alerta ◄─────┘            ▼
                                      Next.js (cliente)
```

- **Backend** (`artefactos_backend/src`):
  - `common/water-math.ts`: todos los cálculos puros, con pruebas.
  - `common/payload.ts`: lectura de los payloads MQTT.
  - `mqtt/`: transporte.
  - `monitoring/ingestion.service.ts`: procesa los mensajes con una cola por dispositivo.
  - `monitoring/status.service.ts`: arma la "foto" que consume el tablero.
  - `monitoring/profile.service.ts`: perfil C_h, con un cron a las 00:05.
  - `events/`: SSE.
- **Frontend** (`artefactos_frontend`):
  - Todo se renderiza en el cliente: `lib/api.ts` (tipos y fetch), `lib/use-device-live.ts` (REST + SSE).
  - Las gráficas son SVG propios en `components/`, sin librerías.
- Los tipos de `lib/api.ts` reflejan a mano las respuestas del backend (`DeviceStatus`,
  `Device`…). Si cambia una entidad o el status, actualizar ambos lados.

## Decisiones y trampas conocidas

- **PostgreSQL en el puerto 5433**, no 5432: en esta máquina el 5432 lo usa otro proyecto.
- **ORM TypeORM con `DB_SYNCHRONIZE=true`**: no hay migraciones; las tablas salen de
  las entidades. Las columnas están en camelCase, así que en SQL van entre comillas
  dobles (`"deviceId"`, `"createdAt"`).
- **Versiones de Nest**: `@nestjs/config@4`, `@nestjs/schedule@6`, `@nestjs/typeorm@11`
  (alineadas con Nest 11). Las majors más nuevas son solo-ESM y rompen Jest. No
  actualizarlas sin migrar antes la configuración de Jest.
- **DTOs con `target ES2023`**: los campos opcionales no enviados existen como
  `undefined`. Antes de `Object.assign` sobre una entidad hay que filtrarlos (ver
  `defined()` en `devices.service.ts`). Para cambios de estado internos se usa
  `DevicesService.patchState`, que no pisa la configuración.
- **Next.js 16 con `cacheComponents`**: leer `artefactos_frontend/AGENTS.md` y la doc
  en `node_modules/next/dist/docs/`. Los componentes que usan `useParams` en rutas
  `[id]` deben ir dentro de `<Suspense>` o el build falla.
- **`AGENTS.md` del frontend lo regenera `next dev`**: hacer commit de los cambios que aparezcan.
- **Lockfiles**: backend usa yarn (`yarn.lock`); frontend usa npm (`package-lock.json`).
  Hay un `artefactos_frontend/yarn.lock` sin versionar pendiente de decidir; no usar
  yarn en el frontend mientras tanto.
- **Zona horaria**: `TZ=America/El_Salvador` se fija en `main.ts`; define la hora
  del día de cada lectura en el perfil.
- **Capturas de pantalla**: Chrome headless con `--virtual-time-budget` se cuelga por
  la conexión SSE abierta. Usar puppeteer-core con `/usr/bin/google-chrome` desde
  un directorio temporal (no instalarlo en el proyecto).
- **`pkill -f <patrón>`** puede matar la propia shell si el patrón aparece en el
  comando. Usar `kill $(pgrep -f "simul[a]dor")` o `lsof -t -i:<puerto>`.

## Convenciones

- Textos de la interfaz, mensajes de alerta, errores de la API y comentarios en **español**.
- Commits en inglés con gitmoji (`:sparkles:`, `:memo:`, `:whale:`…), uno por tema.
  El trabajo está en la rama `feat/monitoreo-cisterna`, y el push lo hace el usuario.
- Colores: un solo tono azul para el agua y la paleta de estados (good/warning/critical)
  definida como tokens en `app/globals.css`, con modo oscuro. Un estado nunca se
  indica solo con color: siempre va con icono y texto.

## Datos de prueba

La cisterna `demo` (3 L: H = 20 cm, A = 150 cm², porcentaje = 5 × (20 − d)) se crea
sola al publicar en `cisterna/demo/...`. Para limpiar los datos o reiniciar la base,
ver la sección 4 de [docs/OPERACION.md](docs/OPERACION.md).
