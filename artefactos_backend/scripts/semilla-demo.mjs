import pg from 'pg';

process.env.TZ = process.env.TZ || 'America/El_Salvador';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const code = args.code ?? 'demo';
const days = Number(args.dias ?? 3);
const api = (args.api ?? 'http://localhost:3001/api').replace(/\/$/, '');

if (!Number.isInteger(days) || days < 1 || days > 30) {
  console.error(`--dias debe ser un entero entre 1 y 30, se recibió ${args.dias}`);
  process.exit(1);
}

const BASE_LPH = 0.02;
const PEAK_LPH = 0.25;
const PEAK_HOURS = new Set([6, 7, 18, 19]);
const REFILL_BELOW = 0.25;
const REFILL_TO = 0.9;
const NOISE_CM = 0.15;

async function call(path, init) {
  const res = await fetch(`${api}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} respondió ${res.status}: ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

async function findOrCreateDevice() {
  const devices = await call('/devices');
  const existing = devices.find((d) => d.code === code);
  if (existing) return existing;
  console.log(`Creando la cisterna "${code}" (H = 20 cm, A = 150 cm2)`);
  return call('/devices', {
    method: 'POST',
    body: JSON.stringify({ code, name: `Cisterna ${code}`, heightCm: 20, areaCm2: 150 }),
  });
}

function dateKey(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function readingsForDay(device, dayStart, startLiters) {
  const { heightCm, areaCm2, capacityLiters } = device;
  const scale = capacityLiters / 3;
  const rows = [];
  let liters = startLiters;
  for (let minute = 0; minute < 24 * 60; minute++) {
    const at = new Date(dayStart.getTime() + minute * 60_000);
    const rate = PEAK_HOURS.has(at.getHours()) ? PEAK_LPH : BASE_LPH;
    liters -= (rate * scale) / 60;
    if (liters < capacityLiters * REFILL_BELOW) liters = capacityLiters * REFILL_TO;
    const trueDistance = heightCm - (liters * 1000) / areaCm2;
    const measured = Math.round((trueDistance + (Math.random() * 2 - 1) * NOISE_CM) * 10) / 10;
    const measuredLiters = Math.min(
      capacityLiters,
      Math.max(0, (areaCm2 * (heightCm - measured)) / 1000),
    );
    rows.push([device.id, measured, measuredLiters, (measuredLiters / capacityLiters) * 100, at]);
  }
  return { rows, endLiters: liters };
}

async function insertRows(client, rows) {
  const chunk = 1000;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const values = part
      .map((_, j) => `($${j * 5 + 1}, $${j * 5 + 2}, $${j * 5 + 3}, $${j * 5 + 4}, $${j * 5 + 5})`)
      .join(', ');
    await client.query(
      `insert into level_readings ("deviceId", "distanceCm", liters, percent, "createdAt") values ${values}`,
      part.flat(),
    );
  }
}

const device = await findOrCreateDevice();
const today = new Date();
today.setHours(0, 0, 0, 0);
const firstDay = new Date(today);
firstDay.setDate(today.getDate() - days);

const client = new pg.Client({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5433),
  user: process.env.DB_USER ?? 'cisterna',
  password: process.env.DB_PASSWORD ?? 'cisterna',
  database: process.env.DB_NAME ?? 'cisterna',
});
await client.connect();

try {
  await client.query('begin');
  const removed = await client.query(
    'delete from level_readings where "deviceId" = $1 and "createdAt" >= $2 and "createdAt" < $3',
    [device.id, firstDay, today],
  );
  let liters = device.capacityLiters * REFILL_TO;
  const keys = [];
  for (let i = 0; i < days; i++) {
    const dayStart = new Date(firstDay);
    dayStart.setDate(firstDay.getDate() + i);
    const day = readingsForDay(device, dayStart, liters);
    liters = day.endLiters;
    await insertRows(client, day.rows);
    keys.push(dateKey(dayStart));
  }
  await client.query('commit');
  console.log(`Se borraron ${removed.rowCount} lecturas previas y se insertaron ${days * 1440} para ${code}`);

  for (const date of keys) {
    const result = await call(`/devices/${device.id}/profile/recompute`, {
      method: 'POST',
      body: JSON.stringify({ date }),
    });
    console.log(`Perfil ${date}: ${result.readings} lecturas procesadas`);
  }
} catch (err) {
  await client.query('rollback');
  throw err;
} finally {
  await client.end();
}
