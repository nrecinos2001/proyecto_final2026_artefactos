"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, subscribe, type Device, type DeviceStatus } from "@/lib/api";
import { levelStateLabel, liters, percent, relative } from "@/lib/format";
import { NewDeviceForm } from "./new-device-form";
import { Badge, Button, Card, ErrorBox, Skeleton, type Tone } from "./ui";

const stateTone: Record<string, Tone> = { normal: "good", bajo: "warning", critico: "critical" };

export function DeviceList() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [statuses, setStatuses] = useState<Record<string, DeviceStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    api
      .devices()
      .then(async (list) => {
        setDevices(list);
        setError(null);
        const all = await Promise.all(list.map((d) => api.status(d.id)));
        setStatuses(Object.fromEntries(all.map((s) => [s.device.id, s])));
      })
      .catch((e: Error) => setError(e.message));
  }, [reloadKey]);

  useEffect(
    () =>
      subscribe((e) => {
        if (e.type === "status") setStatuses((s) => ({ ...s, [e.deviceId]: e.data }));
        if (e.type === "device")
          setDevices((list) => {
            if (!list) return list;
            const exists = list.some((d) => d.id === e.data.id);
            return exists ? list.map((d) => (d.id === e.data.id ? e.data : d)) : [...list, e.data];
          });
      }),
    [],
  );

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!devices)
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cisternas</h1>
          <p className="text-sm text-muted">
            Nivel y calidad del agua de cada reserva, actualizados en vivo.
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancelar" : "Agregar cisterna"}
        </Button>
      </div>

      {showForm && (
        <Card title="Nueva cisterna">
          <NewDeviceForm
            onCreated={(d) => {
              setShowForm(false);
              setDevices((list) => (list?.some((x) => x.id === d.id) ? list : [...(list ?? []), d]));
              reload();
            }}
          />
        </Card>
      )}

      {devices.length === 0 && !showForm && (
        <Card>
          <div className="flex flex-col gap-2 py-6 text-center text-sm text-muted">
            <p className="text-base font-medium text-foreground">Todavía no hay cisternas</p>
            <p>
              Agregue una con el botón de arriba, o encienda el ESP8266: al publicar en{" "}
              <code className="font-mono">cisterna/&lt;código&gt;/nivel</code> se registra sola.
            </p>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {devices.map((d) => {
          const s = statuses[d.id];
          const pct = s?.level?.percent ?? null;
          const state = s?.level?.state ?? null;
          const fill = state === "critico" ? "bg-critical" : state === "bajo" ? "bg-warning" : "bg-water";
          return (
            <Link
              key={d.id}
              href={`/cisternas/${d.id}`}
              className="group rounded-xl border border-border bg-surface p-4 transition hover:border-water"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium group-hover:text-water">{d.name}</div>
                  <div className="font-mono text-xs text-faint">{d.code}</div>
                </div>
                {s && (
                  <Badge tone={s.online ? "good" : "neutral"}>
                    {s.online ? "En línea" : "Sin conexión"}
                  </Badge>
                )}
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div className="text-3xl font-semibold tabular">{pct !== null ? percent(pct) : "—"}</div>
                <div className="text-right text-sm text-muted tabular">
                  {s?.level ? liters(s.level.liters) : "Sin lecturas"}
                  <div className="text-xs text-faint">{relative(d.lastSeenAt)}</div>
                </div>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full rounded-full ${fill} transition-all duration-700`}
                  style={{ width: `${pct ?? 0}%` }}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {state && state !== "normal" && (
                  <Badge tone={stateTone[state]}>{levelStateLabel[state]}</Badge>
                )}
                {s?.turbidity.status === "turbia" && <Badge tone="warning">Limpiar cisterna</Badge>}
                {s?.cleaning.due && <Badge tone="info">Limpieza programada</Badge>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
