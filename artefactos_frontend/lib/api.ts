export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export type LevelState = "normal" | "bajo" | "critico";
export type FlowTrend = "vaciando" | "llenando" | "estable";
export type AlertType =
  | "NIVEL_BAJO"
  | "NIVEL_CRITICO"
  | "TURBIDEZ"
  | "LIMPIEZA_PROGRAMADA"
  | "DESCONECTADO";
export type Severity = "info" | "warning" | "critical";
export type TurbidityStatus =
  | "sin_datos"
  | "esperando_referencia"
  | "sin_referencia"
  | "limpia"
  | "turbia";

export interface Device {
  id: string;
  code: string;
  name: string;
  heightCm: number;
  areaCm2: number;
  capacityLiters: number;
  reservePercent: number;
  lowPercent: number;
  criticalPercent: number;
  windowMinutes: number;
  stableMinutes: number;
  turbidityReferenceVoltage: number | null;
  awaitingTurbidityReference: boolean;
  turbidityThresholdRatio: number;
  turbidityConsecutive: number;
  lastCleanedAt: string | null;
  cleaningIntervalDays: number;
  lastSeenAt: string | null;
  levelState: LevelState | null;
  profileDays: number;
  profileLastDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DeviceConfig = Partial<
  Pick<
    Device,
    | "name"
    | "heightCm"
    | "areaCm2"
    | "capacityLiters"
    | "reservePercent"
    | "lowPercent"
    | "criticalPercent"
    | "windowMinutes"
    | "stableMinutes"
    | "turbidityThresholdRatio"
    | "turbidityConsecutive"
    | "cleaningIntervalDays"
  >
> & { turbidityReferenceVoltage?: number };

export interface Alert {
  id: number;
  deviceId: string;
  type: AlertType;
  severity: Severity;
  message: string;
  active: boolean;
  acknowledged: boolean;
  createdAt: string;
  resolvedAt: string | null;
}

export interface LevelReading {
  id: number;
  deviceId: string;
  distanceCm: number;
  liters: number;
  percent: number;
  createdAt: string;
}

export interface TurbidityReading {
  id: number;
  deviceId: string;
  voltage: number;
  raw: number | null;
  valid: boolean;
  ratio: number | null;
  createdAt: string;
}

export interface DeviceStatus {
  device: Device;
  online: boolean;
  generatedAt: string;
  level: {
    distanceCm: number;
    liters: number;
    percent: number;
    state: LevelState | null;
    at: string;
  } | null;
  flow: {
    litersPerHour: number;
    trend: FlowTrend;
    samples: number;
    windowMinutes: number;
  } | null;
  estimate: {
    mode: FlowTrend;
    method: "perfil" | "directo" | null;
    hours: number | null;
    eta: string | null;
    targetLiters: number | null;
    beyondHorizon: boolean;
    profileDays: number;
  } | null;
  turbidity: {
    status: TurbidityStatus;
    voltage: number | null;
    ratio: number | null;
    valid: boolean | null;
    at: string | null;
    referenceVoltage: number | null;
    thresholdRatio: number;
    levelStable: boolean;
    levelStableSince: string | null;
  };
  cleaning: {
    lastCleanedAt: string | null;
    daysSince: number;
    intervalDays: number;
    daysUntilDue: number;
    due: boolean;
  };
  alerts: Alert[];
}

export interface HourlyProfile {
  days: number;
  lastDate: string | null;
  hours: { hour: number; avgLiters: number; samples: number }[];
}

export interface CalibrationPoint {
  distanceCm: number;
  liters: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      `No se pudo conectar con el servidor (${API_URL}). ¿Está encendido el backend?`,
      0,
    );
  }
  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const body = await res.json();
      message = Array.isArray(body.message)
        ? body.message.join(". ")
        : (body.message ?? message);
    } catch {}
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  devices: () => request<Device[]>("/devices"),
  device: (id: string) => request<Device>(`/devices/${id}`),
  createDevice: (body: DeviceConfig & { code: string; name: string }) =>
    request<Device>("/devices", { method: "POST", body: json(body) }),
  updateDevice: (id: string, body: DeviceConfig) =>
    request<Device>(`/devices/${id}`, { method: "PATCH", body: json(body) }),
  deleteDevice: (id: string) =>
    request<void>(`/devices/${id}`, { method: "DELETE" }),
  status: (id: string) => request<DeviceStatus>(`/devices/${id}/status`),
  readings: (id: string, from: Date, maxPoints = 400) =>
    request<LevelReading[]>(
      `/devices/${id}/readings?from=${from.toISOString()}&maxPoints=${maxPoints}`,
    ),
  turbidity: (id: string, from: Date, maxPoints = 400) =>
    request<TurbidityReading[]>(
      `/devices/${id}/turbidity?from=${from.toISOString()}&maxPoints=${maxPoints}`,
    ),
  profile: (id: string) => request<HourlyProfile>(`/devices/${id}/profile`),
  recomputeProfile: (id: string, date?: string) =>
    request<unknown>(`/devices/${id}/profile/recompute`, {
      method: "POST",
      body: json(date ? { date } : {}),
    }),
  resetProfile: (id: string) =>
    request<void>(`/devices/${id}/profile`, { method: "DELETE" }),
  markClean: (id: string) =>
    request<DeviceStatus>(`/devices/${id}/clean`, { method: "POST" }),
  calibration: (id: string) =>
    request<CalibrationPoint[]>(`/devices/${id}/calibration`),
  saveCalibration: (id: string, points: CalibrationPoint[]) =>
    request<CalibrationPoint[]>(`/devices/${id}/calibration`, {
      method: "PUT",
      body: json({ points }),
    }),
  simulate: (id: string, kind: "nivel" | "turbidez", value: number) =>
    request<unknown>(`/devices/${id}/simulate`, {
      method: "POST",
      body: json({ kind, value }),
    }),
  alerts: (params: { deviceId?: string; active?: boolean; limit?: number }) => {
    const q = new URLSearchParams();
    if (params.deviceId) q.set("deviceId", params.deviceId);
    if (params.active !== undefined) q.set("active", String(params.active));
    if (params.limit) q.set("limit", String(params.limit));
    return request<Alert[]>(`/alerts?${q}`);
  },
  ackAlert: (id: number) =>
    request<Alert>(`/alerts/${id}/ack`, { method: "POST" }),
};

export type LiveEvent =
  | { type: "status"; deviceId: string; data: DeviceStatus }
  | { type: "level"; deviceId: string; data: LevelReading }
  | { type: "turbidity"; deviceId: string; data: TurbidityReading }
  | { type: "alert"; deviceId: string; data: Alert }
  | { type: "device"; deviceId: string; data: Device };

/** Se suscribe al flujo SSE del backend. Devuelve una función para cerrar. */
export function subscribe(
  onEvent: (e: LiveEvent) => void,
  opts: { deviceId?: string; onConnection?: (open: boolean) => void } = {},
) {
  const url = new URL(`${API_URL}/events`);
  if (opts.deviceId) url.searchParams.set("deviceId", opts.deviceId);
  const source = new EventSource(url);
  const handler = (ev: MessageEvent) => {
    try {
      onEvent(JSON.parse(ev.data) as LiveEvent);
    } catch {}
  };
  for (const t of ["status", "level", "turbidity", "alert", "device"]) {
    source.addEventListener(t, handler);
  }
  source.onopen = () => opts.onConnection?.(true);
  source.onerror = () => opts.onConnection?.(false);
  return () => source.close();
}
