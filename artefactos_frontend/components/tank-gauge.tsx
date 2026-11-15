import type { LevelState } from "@/lib/api";

interface Props {
  percent: number | null;
  state: LevelState | null;
  lowPercent: number;
  criticalPercent: number;
  reservePercent: number;
}

/** Dibujo de la cisterna con el nivel actual y las marcas de los umbrales */
export function TankGauge({ percent, state, lowPercent, criticalPercent, reservePercent }: Props) {
  const W = 160;
  const H = 220;
  const top = 16;
  const bottom = H - 12;
  const left = 20;
  const right = W - 44;
  const inner = bottom - top;
  const p = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  const y = (pct: number) => bottom - (pct / 100) * inner;
  const fill =
    state === "critico" ? "var(--critical)" : state === "bajo" ? "var(--warning)" : "var(--water)";

  const marks = [
    { pct: lowPercent, label: "Bajo" },
    { pct: criticalPercent, label: "Crítico" },
    { pct: reservePercent, label: "Reserva" },
  ]
    .sort((a, b) => b.pct - a.pct)
    // Separa las etiquetas que quedarían encimadas (mín. 12 px entre sí)
    .reduce<{ pct: number; label: string; ty: number }[]>((acc, m) => {
      const prev = acc[acc.length - 1];
      const ty = prev ? Math.max(y(m.pct), prev.ty + 12) : y(m.pct);
      return [...acc, { ...m, ty }];
    }, []);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-56 w-auto"
      role="img"
      aria-label={percent === null ? "Sin lecturas" : `Nivel de la cisterna: ${p.toFixed(0)} %`}
    >
      <defs>
        <clipPath id="tank-clip">
          <rect x={left} y={top} width={right - left} height={inner} rx={10} />
        </clipPath>
      </defs>
      <rect
        x={left}
        y={top}
        width={right - left}
        height={inner}
        rx={10}
        fill="var(--surface-2)"
      />
      <g clipPath="url(#tank-clip)">
        <rect
          x={left}
          y={y(p)}
          width={right - left}
          height={bottom - y(p)}
          fill={fill}
          opacity={0.9}
          style={{ transition: "y 0.8s ease, height 0.8s ease" }}
        />
        {/* reflejo de la superficie */}
        <rect
          x={left}
          y={y(p)}
          width={right - left}
          height={3}
          fill="white"
          opacity={percent === null || p === 0 ? 0 : 0.35}
          style={{ transition: "y 0.8s ease" }}
        />
      </g>
      <rect
        x={left}
        y={top}
        width={right - left}
        height={inner}
        rx={10}
        fill="none"
        stroke="var(--border)"
        strokeWidth={2}
      />
      {marks.map((m) => (
        <g key={m.label}>
          <line
            x1={left - 6}
            x2={right}
            y1={y(m.pct)}
            y2={y(m.pct)}
            stroke="var(--muted)"
            strokeDasharray="3 3"
            strokeWidth={1}
          />
          <text x={right + 4} y={m.ty + 3.5} fontSize={10} fill="var(--muted)">
            {m.label}
          </text>
        </g>
      ))}
      <text x={right + 4} y={top + 4} fontSize={10} fill="var(--faint)">
        100 %
      </text>
    </svg>
  );
}
