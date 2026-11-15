"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  subscribe,
  type DeviceStatus,
  type LevelReading,
  type TurbidityReading,
} from "./api";

export const RANGES = [
  { key: "1h", label: "1 h", ms: 3_600_000 },
  { key: "6h", label: "6 h", ms: 6 * 3_600_000 },
  { key: "24h", label: "24 h", ms: 24 * 3_600_000 },
  { key: "7d", label: "7 días", ms: 7 * 24 * 3_600_000 },
] as const;
export type RangeKey = (typeof RANGES)[number]["key"];

/**
 * Estado de una cisterna en vivo: carga inicial por REST y luego se mantiene
 * actualizado con los eventos SSE del backend.
 */
export function useDeviceLive(deviceId: string, range: RangeKey) {
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [levels, setLevels] = useState<LevelReading[]>([]);
  const [turbidity, setTurbidity] = useState<TurbidityReading[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const rangeMs = RANGES.find((r) => r.key === range)!.ms;

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    const from = new Date(Date.now() - rangeMs);
    Promise.all([
      api.status(deviceId),
      api.readings(deviceId, from),
      api.turbidity(deviceId, from),
    ])
      .then(([s, l, t]) => {
        if (cancelled) return;
        setStatus(s);
        setLevels(l);
        setTurbidity(t);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [deviceId, rangeMs, reloadKey]);

  useEffect(() => {
    const cutoff = () => Date.now() - rangeMs;
    return subscribe(
      (e) => {
        if (e.deviceId !== deviceId) return;
        if (e.type === "status") setStatus(e.data);
        if (e.type === "level")
          setLevels((prev) =>
            [...prev, e.data].filter((r) => new Date(r.createdAt).getTime() >= cutoff()),
          );
        if (e.type === "turbidity")
          setTurbidity((prev) =>
            [...prev, e.data].filter((r) => new Date(r.createdAt).getTime() >= cutoff()),
          );
      },
      { deviceId, onConnection: setConnected },
    );
  }, [deviceId, rangeMs]);

  // Re-render periódico para los textos "hace X min" y el estado en línea
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  return { status, setStatus, levels, turbidity, error, connected, reload };
}
