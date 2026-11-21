// Simulador del ESP8266: publica lecturas por MQTT igual que lo hará el firmware.
//
//   yarn simulador                         # cisterna "demo", se vacía y se llena
//   yarn simulador --code=cisterna-01 --interval=5 --turbia
//
// Opciones:
//   --code=<id>        código de la cisterna (tópico cisterna/<id>/...)   [demo]
//   --url=<mqtt url>   broker                                  [mqtt://localhost:1883]
//   --interval=<s>     segundos entre lecturas (el firmware usa 60)         [5]
//   --height=<cm>      H, distancia sensor-fondo                            [20]
//   --rate=<cm/min>    velocidad a la que baja/sube el agua                 [0.5]
//   --pausa=<s>        segundos con el nivel quieto al llegar a vacía o llena [120]
//   --quieto           el nivel nunca se mueve
//   --turbia           el agua se ensucia después de la primera pausa
import mqtt from 'mqtt';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const code = args.code ?? 'demo';
const url = args.url ?? process.env.MQTT_URL ?? 'mqtt://localhost:1883';
const intervalS = Number(args.interval ?? 5);
const H = Number(args.height ?? 20);
const rate = Number(args.rate ?? 0.5);
const pauseMs = Number(args.pausa ?? 120) * 1000;
const still = args.quieto === 'true';
const prefix = process.env.MQTT_TOPIC_PREFIX ?? 'cisterna';

let distance = 4; // casi llena
let direction = 1; // 1 = vaciando (la distancia crece), -1 = llenando
let voltage = 2.9;
let pausedUntil = 0;
let cleanUntil = still ? Date.now() + pauseMs : Infinity;

const client = mqtt.connect(url, {
  will: { topic: `${prefix}/${code}/estado`, payload: 'offline', retain: true, qos: 1 },
});

client.on('connect', () => {
  console.log(`Conectado a ${url}. Publicando en ${prefix}/${code}/... cada ${intervalS}s`);
  client.publish(`${prefix}/${code}/estado`, 'online', { retain: true, qos: 1 });
  client.subscribe(`${prefix}/${code}/alerta`);
  tick();
  setInterval(tick, intervalS * 1000);
});

client.on('message', (topic, msg) => console.log(`  ← ${topic}: ${msg}`));
client.on('error', (e) => console.error(e.message));

function tick() {
  const now = Date.now();
  if (!still && now >= pausedUntil) {
    distance += direction * rate * (intervalS / 60);
    const turnaround = distance >= H - 1 || distance <= 3;
    if (turnaround) {
      distance = Math.min(H - 1, Math.max(3, distance));
      direction = distance >= H - 1 ? -1 : 1;
      pausedUntil = now + pauseMs;
      cleanUntil = Math.min(cleanUntil, pausedUntil);
      console.log(`  nivel quieto durante ${pauseMs / 1000} s`);
    }
  }
  // ruido del HC-SR04 (~3 mm)
  const measured = Math.round((distance + (Math.random() - 0.5) * 0.3) * 10) / 10;
  client.publish(`${prefix}/${code}/nivel`, JSON.stringify({ distancia: measured }), { qos: 1 });

  if (args.turbia && now >= cleanUntil) voltage = Math.max(0.8, voltage - 0.03);
  const v = Math.round((voltage + (Math.random() - 0.5) * 0.04) * 100) / 100;
  client.publish(
    `${prefix}/${code}/turbidez`,
    JSON.stringify({ voltaje: v, raw: Math.round((v / 3.3) * 1023) }),
    { qos: 1 },
  );
  console.log(`→ distancia ${measured} cm, turbidez ${v} V`);
}
