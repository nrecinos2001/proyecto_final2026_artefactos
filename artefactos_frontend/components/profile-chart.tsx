"use client";

import { useState } from "react";
import type { HourlyProfile } from "@/lib/api";
import { liters } from "@/lib/format";
import { useWidth } from "./use-width";

const PAD = { top: 12, right: 8, bottom: 24, left: 48 };

/** C_h: consumo promedio por hora del día (barras, un solo tono) */
export function ProfileChart({ profile, height = 200 }: { profile: HourlyProfile; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const currentHour = new Date().getHours();
  const max = Math.max(...profile.hours.map((h) => h.avgLiters), 0);
  const yMax = max > 0 ? max * 1.15 : 1;
  const iw = width - PAD.left - PAD.right;
  const ih = height - PAD.top - PAD.bottom;
  const slot = iw / 24;
  const gap = 2;
  const bw = Math.max(2, slot - gap);
  const y = (v: number) => PAD.top + ih - (v / yMax) * ih;
  const ticks = [0, yMax / 2, yMax];
  const h = hover !== null ? profile.hours[hover] : null;

  if (max === 0) {
    return (
      <div ref={ref} className="flex items-center justify-center rounded-lg bg-surface-2 p-6 text-center text-sm text-faint" style={{ height }}>
        El perfil se arma con los datos de cada día. Aparecerá después de la primera
        medianoche con lecturas (o al procesar el día a mano).
      </div>
    );
  }

  return (
    <div ref={ref} className="relative w-full">
      <svg width={width} height={height} role="img" aria-label="Consumo promedio por hora del día" className="block">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
            <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--faint)" className="tabular">
              {liters(v)}
            </text>
          </g>
        ))}
        {profile.hours.map((p) => {
          const x = PAD.left + p.hour * slot + gap / 2;
          const top = y(p.avgLiters);
          const hgt = PAD.top + ih - top;
          const r = Math.min(4, bw / 2, hgt);
          const isNow = p.hour === currentHour;
          return (
            <g key={p.hour} onPointerEnter={() => setHover(p.hour)} onPointerLeave={() => setHover(null)}>
              <rect x={PAD.left + p.hour * slot} y={PAD.top} width={slot} height={ih} fill="transparent" />
              {hgt > 0 && (
                <path
                  d={`M${x},${PAD.top + ih}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${PAD.top + ih}Z`}
                  fill={isNow ? "var(--water-deep)" : "var(--water)"}
                  opacity={hover === null || hover === p.hour ? 1 : 0.55}
                />
              )}
              {p.hour % 3 === 0 && (
                <text x={x + bw / 2} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--faint)">
                  {p.hour}h
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: Math.min(PAD.left + h.hour * slot, width - 160), top: 0, width: 160 }}
        >
          <div className="text-faint">
            {h.hour}:00 – {h.hour + 1}:00{h.hour === currentHour ? " (ahora)" : ""}
          </div>
          <div className="font-semibold tabular">{liters(h.avgLiters)} en promedio</div>
          <div className="text-muted">{h.samples} día(s) con datos</div>
        </div>
      )}
    </div>
  );
}
