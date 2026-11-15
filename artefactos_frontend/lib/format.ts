import type { AlertType, LevelState, Severity } from "./api";

const nf = (digits: number) =>
  new Intl.NumberFormat("es-SV", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

/** Litros con decimales según el tamaño (la maqueta tiene 3 L) */
export function liters(v: number) {
  const digits = Math.abs(v) < 10 ? 2 : Math.abs(v) < 100 ? 1 : 0;
  return `${nf(digits).format(v)} L`;
}

export function percent(v: number) {
  return `${nf(Math.abs(v) < 10 ? 1 : 0).format(v)} %`;
}

export function flow(lph: number) {
  const digits = Math.abs(lph) < 10 ? 2 : Math.abs(lph) < 100 ? 1 : 0;
  return `${nf(digits).format(lph)} L/h`;
}

/** 18.3 h → "18 h 18 min"; 0.2 h → "12 min" */
export function duration(hours: number) {
  const totalMin = Math.round(hours * 60);
  if (totalMin < 1) return "menos de 1 min";
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

export function clock(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString("es-SV", {
    hour: "numeric",
    minute: "2-digit",
  });
  if (d.toDateString() === today.toDateString()) return `hoy ${time}`;
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return `mañana ${time}`;
  return d.toLocaleString("es-SV", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relative(iso: string | null) {
  if (!iso) return "nunca";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 10) return "justo ahora";
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

export const levelStateLabel: Record<LevelState, string> = {
  normal: "Normal",
  bajo: "Nivel bajo",
  critico: "Nivel crítico",
};

export const alertTypeLabel: Record<AlertType, string> = {
  NIVEL_BAJO: "Nivel bajo",
  NIVEL_CRITICO: "Nivel crítico",
  TURBIDEZ: "Agua turbia",
  LIMPIEZA_PROGRAMADA: "Limpieza programada",
  DESCONECTADO: "Sensor desconectado",
};

export const severityTone: Record<Severity, "info" | "warning" | "critical"> = {
  info: "info",
  warning: "warning",
  critical: "critical",
};
