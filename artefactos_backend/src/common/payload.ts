/**
 * Lectura tolerante de los payloads del ESP8266. Se acepta un número plano
 * ("12.3") o JSON con nombres en español o inglés.
 */
function parse(payload: string): unknown {
  const text = payload.trim();
  if (text === '') return null;
  const asNumber = Number(text);
  if (!Number.isNaN(asNumber)) return asNumber;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function pick(obj: unknown, keys: string[]): number | null {
  if (typeof obj === 'number') return Number.isFinite(obj) ? obj : null;
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    const v = (obj as Record<string, unknown>)[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)))
      return Number(v);
  }
  return null;
}

/** Nivel: `12.3` | {"distancia": 12.3} | {"distanceCm": 12.3} (cm) */
export function parseLevelPayload(
  payload: string,
): { distanceCm: number } | null {
  const distanceCm = pick(parse(payload), [
    'distancia',
    'distanceCm',
    'distance',
    'd',
  ]);
  if (distanceCm === null || distanceCm < 0 || distanceCm > 1000) return null;
  return { distanceCm };
}

/** ADC del ESP8266 (NodeMCU): 0..1023 ↔ 0..3.3 V */
export const ADC_MAX = 1023;
export const ADC_VREF = 3.3;

/** Turbidez: `2.41` (V) | {"voltaje": 2.41} | {"raw": 748} | ambos */
export function parseTurbidityPayload(
  payload: string,
): { voltage: number; raw: number | null } | null {
  const obj = parse(payload);
  const raw = typeof obj === 'object' ? pick(obj, ['raw', 'adc']) : null;
  let voltage = pick(obj, ['voltaje', 'voltage', 'v']);
  if (voltage === null && raw !== null) voltage = (raw / ADC_MAX) * ADC_VREF;
  if (voltage === null || voltage < 0 || voltage > 5) return null;
  return { voltage, raw: raw === null ? null : Math.round(raw) };
}

/** Estado: "online" | "offline" | {"estado": "online"} */
export function parseStatusPayload(
  payload: string,
): 'online' | 'offline' | null {
  const text = payload.trim().toLowerCase();
  if (text.includes('offline')) return 'offline';
  if (text.includes('online')) return 'online';
  return null;
}
