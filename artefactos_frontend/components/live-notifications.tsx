"use client";

import { useEffect, useState } from "react";
import { subscribe, type Alert } from "@/lib/api";
import { alertTypeLabel } from "@/lib/format";
import { StatusIcon, type Tone } from "./ui";

const toneOf = (a: Alert): Tone =>
  a.severity === "critical" ? "critical" : a.severity === "warning" ? "warning" : "info";

/**
 * Escucha las alertas nuevas en toda la app: muestra un aviso en pantalla y,
 * si el usuario lo permitió, una notificación del navegador (útil en el celular).
 */
export function LiveNotifications() {
  const [toasts, setToasts] = useState<Alert[]>([]);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "default",
  );

  useEffect(() => {
    const p = "Notification" in window ? Notification.permission : "unsupported";
    queueMicrotask(() => setPermission(p));
  }, []);

  useEffect(() => {
    const seen = new Set<number>();
    return subscribe((e) => {
      if (e.type !== "alert") return;
      const alert = e.data;
      if (!alert.active || alert.acknowledged || seen.has(alert.id)) return;
      seen.add(alert.id);
      setToasts((t) => [alert, ...t].slice(0, 4));
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== alert.id)), 10_000);
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(alertTypeLabel[alert.type], { body: alert.message, tag: `alert-${alert.id}` });
      }
    });
  }, []);

  return (
    <>
      {permission === "default" && (
        <div className="border-b border-border bg-info-bg">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2 text-sm">
            <StatusIcon tone="info" />
            <span>Active las notificaciones para recibir los avisos de nivel bajo y limpieza.</span>
            <button
              className="ml-auto font-medium text-water hover:underline"
              onClick={() => Notification.requestPermission().then(setPermission)}
            >
              Activar notificaciones
            </button>
          </div>
        </div>
      )}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((a) => (
          <div
            key={a.id}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-surface p-3 text-sm shadow-lg"
          >
            <StatusIcon tone={toneOf(a)} className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="flex-1">
              <div className="font-medium">{alertTypeLabel[a.type]}</div>
              <div className="text-muted">{a.message}</div>
            </div>
            <button
              aria-label="Cerrar"
              className="text-faint hover:text-foreground"
              onClick={() => setToasts((t) => t.filter((x) => x.id !== a.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
