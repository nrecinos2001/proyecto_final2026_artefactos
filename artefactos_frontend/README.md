# Frontend — Monitor de Cisterna

Plataforma web en Next.js 16 (App Router). Consume la API del backend por REST
y recibe los cambios en vivo por Server-Sent Events. Ver el
[README principal](../README.md).

```bash
cp .env.example .env.local   # URL de la API vacía = mismo host, puerto NEXT_PUBLIC_API_PORT (3001)
npm install
npm run dev                  # http://localhost:3000
```

## Pantallas

| Ruta | Contenido |
|---|---|
| `/` | Cisternas con su nivel en vivo; alta de cisternas |
| `/cisternas/[id]` | Tablero: tanque, litros, tiempo restante, calidad del agua, historial, perfil por hora, simulador |
| `/cisternas/[id]/configuracion` | Geometría, umbrales, turbidez, tabla de calibración, mantenimiento |
| `/alertas` | Historial de alertas |

Las alertas nuevas aparecen como aviso en pantalla y, si el usuario lo permite,
como notificación del navegador.

## Estructura

- `lib/api.ts`: tipos y cliente de la API, suscripción SSE.
- `lib/use-device-live.ts`: estado en vivo de una cisterna.
- `components/`: tablero, gráficas (SVG propio, sin dependencias), formularios.
