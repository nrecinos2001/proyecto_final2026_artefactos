"use client";

import { useMemo, useState } from "react";
import { useWidth } from "./use-width";

export interface Point {
  t: number;
  v: number;
}

interface Props {
  points: Point[];
  yMin: number;
  yMax: number;
  formatY: (v: number) => string;
  /** Texto extra en el tooltip */
  detail?: (p: Point) => string | null;
  refLines?: { value: number; label: string }[];
  height?: number;
  label: string;
  empty?: string;
}

const PAD = { top: 12, right: 12, bottom: 26, left: 52 };

function niceTicks(min: number, max: number, count = 4) {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? raw;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(v);
  return ticks;
}

function timeLabel(t: number, spanMs: number) {
  const d = new Date(t);
  if (spanMs > 2 * 86_400_000)
    return d.toLocaleDateString("es-SV", { day: "numeric", month: "short" });
  return d.toLocaleTimeString("es-SV", {
    hour: "numeric",
    minute: "2-digit",
    ...(spanMs < 10 * 60_000 ? { second: "2-digit" } : {}),
  });
}

/** Serie de tiempo de una sola serie: línea de 2px, área suave, cursor + tooltip */
export function TimeChart({
  points,
  yMin,
  yMax,
  formatY,
  detail,
  refLines = [],
  height = 220,
  label,
  empty = "Todavía no hay lecturas en este periodo.",
}: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (points.length === 0) return null;
    const t0 = points[0].t;
    const t1 = Math.max(points[points.length - 1].t, t0 + 60_000);
    const iw = width - PAD.left - PAD.right;
    const ih = height - PAD.top - PAD.bottom;
    const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * iw;
    const y = (v: number) =>
      PAD.top + ih - ((Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin || 1)) * ih;
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
    const area = `${line}L${x(points[points.length - 1].t).toFixed(1)},${PAD.top + ih}L${x(t0).toFixed(1)},${PAD.top + ih}Z`;
    const xTickCount = Math.max(2, Math.floor(iw / 110));
    const xTicks = Array.from({ length: xTickCount + 1 }, (_, i) => t0 + ((t1 - t0) * i) / xTickCount);
    return { x, y, line, area, t0, t1, ih, xTicks, yTicks: niceTicks(yMin, yMax) };
  }, [points, width, height, yMin, yMax]);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (!geo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left + PAD.left;
    let best = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(geo.x(p.t) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  };

  const hp = hover !== null ? points[hover] : null;

  return (
    <div ref={ref} className="relative w-full">
      {!geo ? (
        <div
          className="flex items-center justify-center rounded-lg bg-surface-2 text-sm text-faint"
          style={{ height }}
        >
          {empty}
        </div>
      ) : (
        <svg width={width} height={height} role="img" aria-label={label} className="block select-none">
          {geo.yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={geo.y(v)} y2={geo.y(v)} stroke="var(--grid)" />
              <text x={PAD.left - 8} y={geo.y(v) + 4} textAnchor="end" fontSize={11} fill="var(--faint)" className="tabular">
                {formatY(v)}
              </text>
            </g>
          ))}
          {geo.xTicks.map((t, i) => (
            <text
              key={t}
              x={geo.x(t)}
              y={height - 6}
              textAnchor={i === 0 ? "start" : i === geo.xTicks.length - 1 ? "end" : "middle"}
              fontSize={11}
              fill="var(--faint)"
            >
              {timeLabel(t, geo.t1 - geo.t0)}
            </text>
          ))}
          {refLines.map((r) => (
            <g key={r.label}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={geo.y(r.value)}
                y2={geo.y(r.value)}
                stroke="var(--muted)"
                strokeDasharray="4 4"
              />
              <text x={width - PAD.right} y={geo.y(r.value) - 4} textAnchor="end" fontSize={10} fill="var(--muted)">
                {r.label}
              </text>
            </g>
          ))}
          <path d={geo.area} fill="var(--water)" opacity={0.12} />
          <path d={geo.line} fill="none" stroke="var(--water)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hp && (
            <g>
              <line x1={geo.x(hp.t)} x2={geo.x(hp.t)} y1={PAD.top} y2={PAD.top + geo.ih} stroke="var(--muted)" strokeWidth={1} />
              <circle cx={geo.x(hp.t)} cy={geo.y(hp.v)} r={5} fill="var(--water)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          )}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={Math.max(0, width - PAD.left - PAD.right)}
            height={geo.ih}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}
      {geo && hp && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: Math.min(Math.max(geo.x(hp.t) - 70, 0), width - 150),
            top: Math.max(geo.y(hp.v) - 62, 0),
            width: 150,
          }}
        >
          <div className="text-faint">
            {new Date(hp.t).toLocaleString("es-SV", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", second: "2-digit" })}
          </div>
          <div className="font-semibold tabular">{formatY(hp.v)}</div>
          {detail?.(hp) && <div className="text-muted">{detail(hp)}</div>}
        </div>
      )}
    </div>
  );
}
