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

# 4. Opcional: ESP8266 simulado y 3 días de historial
cd artefactos_backend && yarn simulador --interval=2 --rate=10 --pausa=90
cd artefactos_backend && yarn semilla
```

En Windows: Git Bash para estos comandos; si `yarn` no está instalado, usar
`corepack yarn@1.22.22 <comando>`. Si 5433, 3000 o 3001 están ocupados por otros
proyectos, usar `DB_PORT=5434 docker compose up -d`, `PORT=3101` en el backend y
`NEXT_PUBLIC_API_PORT=3101` + `next start -p 3100` en el frontend.

Comprobaciones rápidas:

```bash
curl -s localhost:3001/api/health          # {"status":"ok","mqtt":"conectado"}
docker exec cisterna_mosquitto mosquitto_sub -t 'cisterna/#' -v
```

Si un puerto está ocupado por una sesión anterior: `lsof -t -i:3000 -i:3001 | xargs -r kill`
en Linux; en Windows (PowerShell)
`Get-NetTCPConnection -LocalPort 3001 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ }`.

## Verificación antes de dar algo por terminado

```bash
cd artefactos_backend  && node_modules/.bin/eslint "{src,apps,libs,test}/**/*.ts" && yarn test && yarn build
cd artefactos_frontend && npx next build && npx tsc --noEmit && npx eslint .
```

- `yarn lint` usa `--fix` y reescribe archivos: para verificar, ESLint sin `--fix`.
- `next build` va antes de `tsc --noEmit` porque genera los tipos de las rutas (`LayoutProps`).
- `yarn test:e2e` necesita la infraestructura levantada (con `DB_PORT` si no es 5433).

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
  - `mqtt/`: transporte; al reconectar se republica el estado de LED/buzzer.
  - `monitoring/ingestion.service.ts`: procesa los mensajes con una cola por dispositivo.
    Un error en un mensaje se registra y no tumba el proceso.
  - `monitoring/status.service.ts`: arma la "foto" que consume el tablero.
  - `monitoring/profile.service.ts`: perfil C_h desde `daily_consumption`; procesa
    los días pendientes al arrancar y a las 00:05, y reprocesar un día lo reemplaza.
  - `notifications/`: avisos por Telegram (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_IDS`).
  - `events/`: SSE.
- **Frontend** (`artefactos_frontend`):
  - Todo se renderiza en el cliente: `lib/api.ts` (tipos, fetch y una sola conexión
    SSE compartida por pestaña), `lib/use-device-live.ts` (REST + SSE, recarga al reconectar).
  - La URL de la API sale de `NEXT_PUBLIC_API_URL` o, si está vacía, del host de la
    página con el puerto `NEXT_PUBLIC_API_PORT` (para entrar desde el celular).
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
  `experimental.agentFeedback` está desactivado a propósito; no volver a activarlo.
- **Lockfiles**: backend usa yarn (`yarn.lock`); frontend usa npm (`package-lock.json`).
  Hay un `artefactos_frontend/yarn.lock` sin versionar pendiente de decidir; no usar
  yarn en el frontend mientras tanto.
- **Zona horaria**: `TZ=America/El_Salvador` se fija en `main.ts`; define la hora
  del día de cada lectura en el perfil.
- **Capturas de pantalla**: Chrome headless con `--virtual-time-budget` se cuelga por
  la conexión SSE abierta. Usar puppeteer-core con el Chrome instalado en la máquina
  desde un directorio temporal (no instalarlo en el proyecto).
- **Disco C: en Windows**: Docker Desktop y las cachés de yarn/npm viven ahí. Con el
  disco lleno la VM de Docker queda en solo lectura; se recupera con
  `docker desktop stop --force`, `wsl --shutdown` y `docker desktop start`.
- **`pkill -f <patrón>`** puede matar la propia shell si el patrón aparece en el
  comando. Usar `kill $(pgrep -f "simul[a]dor")` o `lsof -t -i:<puerto>`.

## Convenciones

- Textos de la interfaz, mensajes de alerta, errores de la API y comentarios en **español**.
- Commits en inglés, en una línea, imperativos y sin gitmoji, uno por tema.
  El trabajo actual está en la rama `fix/revision-2026-11` (la rama
  `feat/monitoreo-cisterna` ya se fusionó en `main`).
- Colores: un solo tono azul para el agua y la paleta de estados (good/warning/critical)
  definida como tokens en `app/globals.css`, con modo oscuro. Un estado nunca se
  indica solo con color: siempre va con icono y texto.

## Datos de prueba

La cisterna `demo` (3 L: H = 20 cm, A = 150 cm², porcentaje = 5 × (20 − d)) se crea
sola al publicar en `cisterna/demo/...`. Para limpiar los datos o reiniciar la base,
ver la sección 4 de [docs/OPERACION.md](docs/OPERACION.md).
