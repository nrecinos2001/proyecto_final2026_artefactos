"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, subscribe, type Alert, type Device } from "@/lib/api";
import { alertTypeLabel, relative } from "@/lib/format";
import { Badge, Button, Card, ErrorBox, Skeleton, type Tone } from "./ui";

const toneOf = (a: Alert): Tone =>
  !a.active ? "neutral" : a.severity === "critical" ? "critical" : a.severity === "warning" ? "warning" : "info";

export function AlertHistory() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [devices, setDevices] = useState<Record<string, Device>>({});
  const [onlyActive, setOnlyActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.alerts({ active: onlyActive ? true : undefined, limit: 200 }), api.devices()])
      .then(([a, d]) => {
        setAlerts(a);
        setDevices(Object.fromEntries(d.map((x) => [x.id, x])));
      })
      .catch((e: Error) => setError(e.message));
  }, [onlyActive]);

  useEffect(
    () =>
      subscribe((e) => {
        if (e.type !== "alert") return;
        setAlerts((list) => {
          if (!list) return list;
          const rest = list.filter((a) => a.id !== e.data.id);
          if (onlyActive && !e.data.active) return rest;
          return [e.data, ...rest].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        });
      }),
    [onlyActive],
  );

  if (error) return <ErrorBox message={error} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Alertas</h1>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
          Solo activas
        </label>
      </div>
      <Card>
        {!alerts ? (
          <Skeleton className="h-40" />
        ) : alerts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No hay alertas registradas.</p>
        ) : (
          <ul className="divide-y divide-border">
            {alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start gap-3 py-3 text-sm">
                <Badge tone={toneOf(a)}>{alertTypeLabel[a.type]}</Badge>
                <div className="min-w-0 flex-1">
                  <div>{a.message}</div>
                  <div className="text-xs text-faint">
                    {devices[a.deviceId] ? (
                      <Link href={`/cisternas/${a.deviceId}`} className="hover:underline">
                        {devices[a.deviceId].name}
                      </Link>
                    ) : (
                      "Cisterna"
                    )}{" "}
                    · {new Date(a.createdAt).toLocaleString("es-SV")} ·{" "}
                    {a.active ? "activa" : `resuelta ${relative(a.resolvedAt)}`}
                    {a.acknowledged && " · vista"}
                  </div>
                </div>
                {a.active && !a.acknowledged && (
                  <Button
                    variant="ghost"
                    className="py-1"
                    onClick={() =>
                      api.ackAlert(a.id).then((upd) =>
                        setAlerts((list) => list?.map((x) => (x.id === upd.id ? upd : x)) ?? list),
                      )
                    }
                  >
                    Enterado
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
