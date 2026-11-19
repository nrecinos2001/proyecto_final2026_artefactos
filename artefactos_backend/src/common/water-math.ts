/**
 * Funciones puras del cálculo descrito en el anteproyecto
 * ("Estimación del tiempo restante de agua"). No dependen de Nest ni de la BD,
 * así se pueden probar con datos fijos.
 */

export interface CalibrationPair {
  distanceCm: number;
  liters: number;
}

export interface Geometry {
  heightCm: number;
  areaCm2: number;
  capacityLiters: number;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/**
 * Paso 1: distancia (cm) → litros.
 * Si hay al menos dos puntos de calibración se interpola linealmente en la
 * tabla; si no, se usa V = A x (H - d). 1 L = 1000 cm³.
 */
export function distanceToLiters(
  distanceCm: number,
  geometry: Geometry,
  calibration: CalibrationPair[] = [],
): number {
  let liters: number;
  if (calibration.length >= 2) {
    const pts = [...calibration].sort((a, b) => a.distanceCm - b.distanceCm);
    // Fuera de la tabla se extrapola con el tramo extremo
    let i = pts.findIndex((p) => p.distanceCm >= distanceCm);
    if (i === -1) i = pts.length - 1;
    if (i === 0) i = 1;
    const a = pts[i - 1];
    const b = pts[i];
    const span = b.distanceCm - a.distanceCm;
    liters =
      span === 0
        ? a.liters
        : a.liters +
          ((distanceCm - a.distanceCm) / span) * (b.liters - a.liters);
  } else {
    liters = (geometry.areaCm2 * (geometry.heightCm - distanceCm)) / 1000;
  }
  return clamp(liters, 0, geometry.capacityLiters);
}

export interface TimedValue {
  /** Marca de tiempo en milisegundos */
  t: number;
  /** Litros */
  v: number;
}

export interface RegressionFit {
  slopeLph: number;
  stdErrLph: number;
  samples: number;
}

export function regressionFit(points: TimedValue[]): RegressionFit | null {
  const n = points.length;
  if (n < 3) return null;
  const t0 = points[0].t;
  const xs = points.map((p) => (p.t - t0) / 3_600_000);
  const ys = points.map((p) => p.v);
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - meanX) * (ys[i] - meanY);
    sxx += (xs[i] - meanX) ** 2;
  }
  if (sxx === 0) return null;
  const slopeLph = sxy / sxx;
  const intercept = meanY - slopeLph * meanX;
  const residualSquares = xs.reduce(
    (s, x, i) => s + (ys[i] - intercept - slopeLph * x) ** 2,
    0,
  );
  const stdErrLph = Math.sqrt(residualSquares / (n - 2) / sxx);
  return { slopeLph, stdErrLph, samples: n };
}

/** Caudal por debajo del 1 % de la capacidad por hora se considera "sin consumo" */
export const STABLE_FLOW_RATIO = 0.01;
export const SLOPE_SIGNIFICANCE = 3;

export type FlowTrend = 'vaciando' | 'llenando' | 'estable';

export function flowTrend(
  fit: Pick<RegressionFit, 'slopeLph' | 'stdErrLph'>,
  capacityLiters: number,
): FlowTrend {
  const threshold = Math.max(
    capacityLiters * STABLE_FLOW_RATIO,
    SLOPE_SIGNIFICANCE * fit.stdErrLph,
  );
  if (fit.slopeLph <= -threshold) return 'vaciando';
  if (fit.slopeLph >= threshold) return 'llenando';
  return 'estable';
}

/**
 * Consumo (litros) dentro de una serie de lecturas: suma de las bajadas,
 * ignorando los llenados y el ruido menor que `noiseLiters` (histéresis).
 */
export function consumptionFromSeries(
  values: number[],
  noiseLiters: number,
): number {
  if (values.length < 2) return 0;
  let ref = values[0];
  let total = 0;
  for (const v of values.slice(1)) {
    if (v < ref - noiseLiters) {
      total += ref - v;
      ref = v;
    } else if (v > ref + noiseLiters) {
      ref = v; // está entrando agua: se mueve la referencia sin contar consumo
    }
  }
  return total;
}

export const NOISE_RATIO = 0.005;
export const SENSOR_RESOLUTION_CM = 0.3;

export function noiseLitersFor(device: {
  capacityLiters: number;
  areaCm2: number;
}): number {
  return Math.max(
    device.capacityLiters * NOISE_RATIO,
    (device.areaCm2 * SENSOR_RESOLUTION_CM) / 1000,
  );
}

/** Paso 3: promedio móvil exponencial C_h = 0.3 x hoy + 0.7 x anterior */
export const EMA_ALPHA = 0.3;

export function emaUpdate(previous: number | null, today: number): number {
  if (previous === null) return today;
  return EMA_ALPHA * today + (1 - EMA_ALPHA) * previous;
}

/** Días mínimos de perfil antes de usarlo (antes se usa la fórmula directa) */
export const PROFILE_MIN_DAYS = 3;
/** Horizonte máximo de la simulación */
export const MAX_ESTIMATE_HOURS = 24 * 7;

export interface EstimateInput {
  now: Date;
  currentLiters: number;
  capacityLiters: number;
  reserveLiters: number;
  /** Q del paso 2, L/h, con signo */
  flowLph: number;
  trend: FlowTrend;
  /** C_h por hora local 0..23, o null si todavía no hay perfil */
  profile: number[] | null;
}

export interface Estimate {
  mode: FlowTrend;
  /** perfil = Paso 4 hora por hora; directo = t = (V - V_reserva) / Q */
  method: 'perfil' | 'directo' | null;
  /** Horas hasta llegar a la reserva (vaciando) o al lleno (llenando) */
  hours: number | null;
  /** Fecha estimada en la que se alcanza la meta */
  eta: string | null;
  targetLiters: number | null;
  /** true si la meta queda más allá del horizonte máximo */
  beyondHorizon: boolean;
}

/**
 * Paso 4: tiempo restante.
 * - Vaciando y con perfil: resta hora por hora (hora en curso con Q, siguientes con C_h).
 * - Vaciando sin perfil: t = (V_actual - V_reserva) / |Q|.
 * - Llenando: t = (capacidad - V_actual) / Q.
 */
export function estimateRemaining(input: EstimateInput): Estimate {
  const {
    now,
    currentLiters,
    capacityLiters,
    reserveLiters,
    flowLph,
    trend: mode,
    profile,
  } = input;
  const result = (
    hours: number | null,
    method: Estimate['method'],
    target: number | null,
  ): Estimate => {
    const beyond = hours !== null && hours > MAX_ESTIMATE_HOURS;
    const h = beyond ? null : hours;
    return {
      mode,
      method,
      hours: h,
      eta:
        h === null
          ? null
          : new Date(now.getTime() + h * 3_600_000).toISOString(),
      targetLiters: target,
      beyondHorizon: beyond,
    };
  };

  if (mode === 'estable') return result(null, null, null);

  if (mode === 'llenando') {
    return result(
      Math.max(0, (capacityLiters - currentLiters) / flowLph),
      'directo',
      capacityLiters,
    );
  }

  const usable = currentLiters - reserveLiters;
  if (usable <= 0) return result(0, 'directo', reserveLiters);
  const q = Math.abs(flowLph);

  if (!profile) return result(usable / q, 'directo', reserveLiters);

  // Simulación hora por hora
  let remaining = usable;
  let hours = 0;
  const cursor = new Date(now);
  // Fracción que queda de la hora en curso
  const minutesLeft = 60 - cursor.getMinutes() - cursor.getSeconds() / 60;
  const firstFraction = minutesLeft / 60;
  const firstUse = q * firstFraction;
  if (firstUse >= remaining) {
    return result(remaining / q, 'perfil', reserveLiters);
  }
  remaining -= firstUse;
  hours += firstFraction;
  cursor.setMinutes(0, 0, 0);
  cursor.setHours(cursor.getHours() + 1);

  while (hours <= MAX_ESTIMATE_HOURS) {
    const use = Math.max(profile[cursor.getHours()] ?? 0, 0);
    if (use >= remaining && use > 0) {
      return result(hours + remaining / use, 'perfil', reserveLiters);
    }
    remaining -= use;
    hours += 1;
    cursor.setHours(cursor.getHours() + 1);
  }
  return result(MAX_ESTIMATE_HOURS + 1, 'perfil', reserveLiters);
}

/** Fecha local YYYY-MM-DD (usa la zona horaria del proceso, TZ) */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
