"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type DeviceStatus, type FlowTrend, type HourlyProfile } from "@/lib/api";
import {
  alertTypeLabel,
  clock,
  duration,
  flow,
  levelStateLabel,
  liters,
  percent,
  relative,
} from "@/lib/format";
import { RANGES, useDeviceLive, type RangeKey } from "@/lib/use-device-live";
import { ProfileChart } from "./profile-chart";
import { TankGauge } from "./tank-gauge";
import { TimeChart } from "./time-chart";
import {
  Badge,
  Button,
  Card,
  ErrorBox,
  Skeleton,
  StatusIcon,
  inputClass,
  type Tone,
} from "./ui";

export function Dashboard() {
  const { id } = useParams<{ id: string }>();
  const [range, setRange] = useState<RangeKey>("6h");
  const { status, setStatus, levels, turbidity, error, connected, reload } =
    useDeviceLive(id, range);

  if (error && !status) return <ErrorBox message={error} onRetry={reload} />;
  if (!status) return <DashboardSkeleton />;

  const { device } = status;
  const download = (tipo: "nivel" | "turbidez") => {
    const rangeMs = RANGES.find((r) => r.key === range)!.ms;
    window.location.href = api.exportUrl(device.id, tipo, new Date(Date.now() - rangeMs));
  };

  return (
    <div className="flex flex-col gap-5">
      <Header status={status} connected={connected} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      <ActiveAlerts status={status} />

      <div className="grid gap-5 lg:grid-cols-3">
        <LevelCard status={status} />
        <EstimateCard status={status} />
        <QualityCard status={status} onUpdate={setStatus} />
      </div>

      <Card
        title="Historial del nivel"
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="py-1 text-xs" onClick={() => download("nivel")}>
              Descargar CSV
            </Button>
            <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Periodo">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  aria-pressed={range === r.key}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    range === r.key ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        }
      >
        <TimeChart
          label="Nivel de la cisterna en porcentaje a lo largo del tiempo"
          points={levels.map((r) => ({ t: new Date(r.createdAt).getTime(), v: r.percent }))}
          yMin={0}
          yMax={100}
          formatY={(v) => `${Math.round(v)} %`}
          detail={(p) => liters((p.v / 100) * device.capacityLiters)}
          refLines={[
            { value: device.lowPercent, label: `Bajo ${device.lowPercent} %` },
            { value: device.criticalPercent, label: `Crítico ${device.criticalPercent} %` },
          ]}
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <ProfileCard deviceId={device.id} profileDays={device.profileDays} />
        <Card
          title="Turbidez (respecto al agua limpia)"
          action={
            <Button variant="ghost" className="py-1 text-xs" onClick={() => download("turbidez")}>
              Descargar CSV
            </Button>
          }
        >
          <TimeChart
            label="Turbidez relativa a la referencia de agua limpia"
            height={200}
            points={turbidity
              .filter((r) => r.valid && r.ratio !== null)
              .map((r) => ({ t: new Date(r.createdAt).getTime(), v: r.ratio! * 100 }))}
            yMin={0}
            yMax={Math.max(
              120,
              ...turbidity.map((r) => (r.ratio ?? 0) * 100 + 5),
            )}
            formatY={(v) => `${Math.round(v)} %`}
            refLines={[
              {
                value: device.turbidityThresholdRatio * 100,
                label: `Aviso ${Math.round(device.turbidityThresholdRatio * 100)} %`,
              },
            ]}
            empty={
              device.turbidityReferenceVoltage
                ? "Sin lecturas válidas de turbidez en este periodo."
                : 'Presione "Cisterna limpia" con agua limpia para fijar la referencia.'
            }
          />
          <p className="mt-2 text-xs text-faint">
            100 % = voltaje del agua limpia. Solo se grafican lecturas tomadas con el nivel
            quieto ({device.stableMinutes} min), porque al llenarse se levanta el sedimento.
          </p>
        </Card>
      </div>

      <Simulator deviceId={device.id} heightCm={device.heightCm} />
    </div>
  );
}

function Header({ status, connected }: { status: DeviceStatus; connected: boolean }) {
  const { device, online, level } = status;
  const stateTone: Record<string, Tone> = { normal: "good", bajo: "warning", critico: "critical" };
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{device.name}</h1>
        <p className="text-sm text-muted">
          Código MQTT <code className="font-mono">{device.code}</code> · Última lectura{" "}
          {relative(device.lastSeenAt)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {level?.state && (
          <Badge tone={stateTone[level.state]}>{levelStateLabel[level.state]}</Badge>
        )}
        <Badge tone={online ? "good" : "neutral"}>
          {online ? "Sensor en línea" : "Sensor sin conexión"}
        </Badge>
        {!connected && <Badge tone="warning">Reconectando en vivo…</Badge>}
        <Link href={`/cisternas/${device.id}/configuracion`}>
          <Button variant="secondary">Configuración</Button>
        </Link>
      </div>
    </div>
  );
}

function ActiveAlerts({ status }: { status: DeviceStatus }) {
  const [hidden, setHidden] = useState<number[]>([]);
  const alerts = status.alerts.filter((a) => !a.acknowledged && !hidden.includes(a.id));
  if (!alerts.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {alerts.map((a) => {
        const tone: Tone = a.severity === "critical" ? "critical" : a.severity === "warning" ? "warning" : "info";
        const bg = { critical: "bg-critical-bg", warning: "bg-warning-bg", info: "bg-info-bg" }[
          tone as "critical" | "warning" | "info"
        ];
        return (
          <div key={a.id} className={`flex items-start gap-3 rounded-xl p-3 text-sm ${bg}`}>
            <StatusIcon tone={tone} className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="flex-1">
              <span className="font-medium">{alertTypeLabel[a.type]}.</span> {a.message}{" "}
              <span className="text-muted">({relative(a.createdAt)})</span>
            </div>
            <Button
              variant="ghost"
              className="py-1"
              onClick={() => {
                setHidden((h) => [...h, a.id]);
                api.ackAlert(a.id).catch(() => setHidden((h) => h.filter((x) => x !== a.id)));
              }}
            >
              Enterado
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function LevelCard({ status }: { status: DeviceStatus }) {
  const { device, level } = status;
  return (
    <Card title="Nivel actual">
      <div className="flex items-center gap-4">
        <TankGauge
          percent={level?.percent ?? null}
          state={level?.state ?? null}
          lowPercent={device.lowPercent}
          criticalPercent={device.criticalPercent}
          reservePercent={device.reservePercent}
        />
        <div className="flex flex-col gap-1">
          {level ? (
            <>
              <div className="text-5xl font-semibold tabular">{percent(level.percent)}</div>
              <div className="text-lg tabular">
                {liters(level.liters)}{" "}
                <span className="text-sm text-muted">de {liters(device.capacityLiters)}</span>
              </div>
              <div className="mt-2 text-xs text-faint tabular">
                Distancia al agua: {level.distanceCm.toFixed(1)} cm
                <br />
                Reserva de la bomba: {liters((device.capacityLiters * device.reservePercent) / 100)}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">
              Esperando la primera lectura del sensor en{" "}
              <code className="font-mono text-xs">cisterna/{device.code}/nivel</code>
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

const ZERO_HOURS_HEADLINE: Record<FlowTrend, string> = {
  vaciando: "En reserva",
  llenando: "Llena",
  estable: "Sin consumo",
};

function EstimateCard({ status }: { status: DeviceStatus }) {
  const { flow: q, estimate: e, device } = status;
  let headline = "—";
  let caption = "Se necesitan al menos 3 lecturas recientes para calcular el consumo.";
  let tone: Tone = "neutral";

  if (e) {
    if (e.mode === "estable") {
      headline = "Sin consumo";
      caption = "El nivel no está cambiando de forma significativa.";
    } else if (e.beyondHorizon) {
      headline = "Más de 7 días";
      caption = e.mode === "vaciando" ? "Al ritmo actual el agua alcanza para varios días." : "El llenado es muy lento.";
      tone = "good";
    } else if (e.hours !== null && e.eta) {
      headline = e.hours === 0 ? ZERO_HOURS_HEADLINE[e.mode] : duration(e.hours);
      if (e.mode === "vaciando") {
        caption =
          e.hours === 0
            ? "La cisterna ya está en la reserva de protección de la bomba."
            : `hasta llegar a la reserva (${liters(e.targetLiters ?? 0)}), aprox. ${clock(e.eta)}`;
        tone = e.hours < 6 ? "critical" : e.hours < 24 ? "warning" : "good";
      } else {
        caption = `para llenarse por completo, aprox. ${clock(e.eta)}`;
        tone = "info";
      }
    }
  }

  return (
    <Card title={e?.mode === "llenando" ? "Tiempo para llenarse" : "Tiempo restante de agua"}>
      <div className="flex flex-col gap-3">
        <div>
          <div className="flex items-center gap-2 text-4xl font-semibold tabular">
            {tone !== "neutral" && <StatusIcon tone={tone} className="h-6 w-6" />}
            {headline}
          </div>
          <p className="mt-1 text-sm text-muted">{caption}</p>
        </div>
        <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
          <div>
            <dt className="text-xs text-faint">Caudal (últimos {device.windowMinutes} min)</dt>
            <dd className="font-medium tabular">
              {q ? flow(q.litersPerHour) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-faint">Tendencia</dt>
            <dd className="font-medium capitalize">{q?.trend ?? "—"}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-faint">Método</dt>
            <dd className="text-muted">
              {e?.method === "perfil"
                ? `Perfil de consumo por hora (${e.profileDays} días de datos)`
                : e?.method === "directo"
                  ? `Fórmula directa t = (V − V_reserva) / Q${
                      e.mode === "vaciando" && device.profileDays < 3
                        ? ` · el perfil por hora se usa a partir de 3 días (${device.profileDays}/3)`
                        : ""
                    }`
                  : "—"}
            </dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}

function QualityCard({
  status,
  onUpdate,
}: {
  status: DeviceStatus;
  onUpdate: (s: DeviceStatus) => void;
}) {
  const { turbidity: t, cleaning } = status;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const view: Record<typeof t.status, { tone: Tone; label: string; text: string }> = {
    limpia: { tone: "good", label: "Agua clara", text: "La turbidez está dentro de lo normal." },
    turbia: { tone: "warning", label: "Se recomienda limpiar", text: "Varias lecturas seguidas quedaron por debajo del umbral." },
    esperando_referencia: { tone: "info", label: "Tomando referencia", text: `Se guardará la próxima lectura con el nivel quieto ${status.device.stableMinutes} min.` },
    sin_referencia: { tone: "neutral", label: "Sin referencia", text: 'Con agua limpia, presione "Cisterna limpia" para calibrar.' },
    sin_datos: { tone: "neutral", label: "Sin datos", text: "Aún no llegan lecturas del sensor de turbidez." },
  };
  const v = view[t.status];

  const markClean = async () => {
    setBusy(true);
    setErr(null);
    try {
      onUpdate(await api.markClean(status.device.id));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Calidad del agua">
      <div className="flex flex-col gap-3">
        <div>
          <Badge tone={v.tone}>{v.label}</Badge>
          <p className="mt-2 text-sm text-muted">{v.text}</p>
        </div>
        <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
          <div>
            <dt className="text-xs text-faint">Respecto al agua limpia</dt>
            <dd className="font-medium tabular">
              {t.ratio !== null ? `${Math.round(t.ratio * 100)} %` : "—"}
              {t.valid === false && <span className="ml-1 text-xs text-faint">(nivel en movimiento)</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-faint">Voltaje / referencia</dt>
            <dd className="font-medium tabular">
              {t.voltage !== null ? `${t.voltage.toFixed(2)} V` : "—"} /{" "}
              {t.referenceVoltage !== null ? `${t.referenceVoltage.toFixed(2)} V` : "—"}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-faint">Última limpieza</dt>
            <dd className={cleaning.due ? "font-medium" : ""}>
              {cleaning.lastCleanedAt
                ? cleaning.daysSince === 0
                  ? "Hoy"
                  : `Hace ${cleaning.daysSince} día${cleaning.daysSince === 1 ? "" : "s"}`
                : "Sin registrar"}
              {" · "}
              {cleaning.due
                ? "ya se cumplió el periodo de limpieza"
                : `próxima en ${cleaning.daysUntilDue} días`}
            </dd>
          </div>
        </dl>
        <Button variant="primary" onClick={markClean} disabled={busy}>
          {busy ? "Guardando…" : "Cisterna limpia"}
        </Button>
        {err && <p className="text-sm text-critical">{err}</p>}
        <p className="text-xs text-faint">
          Indicador relativo: avisa cuándo limpiar, pero no certifica que el agua sea potable.
        </p>
      </div>
    </Card>
  );
}

function ProfileCard({ deviceId, profileDays }: { deviceId: string; profileDays: number }) {
  const [profile, setProfile] = useState<HourlyProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api
      .profile(deviceId)
      .then(setProfile)
      .catch((e: Error) => setErr(e.message));
  }, [deviceId, profileDays, version]);

  const processToday = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.recomputeProfile(deviceId);
      setVersion((v) => v + 1);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={`Consumo típico por hora${profile ? ` · ${profile.days} día(s)` : ""}`}
      action={
        <Button
          variant="ghost"
          className="py-1 text-xs"
          onClick={processToday}
          disabled={busy}
          title="Incorpora las lecturas de hoy al perfil; se puede repetir sin duplicar"
        >
          {busy ? "Procesando…" : "Procesar hoy"}
        </Button>
      }
    >
      {profile ? <ProfileChart profile={profile} /> : <Skeleton className="h-[200px]" />}
      {err && <p className="mt-2 text-sm text-critical">{err}</p>}
      <p className="mt-2 text-xs text-faint">
        Se actualiza cada medianoche: C_h = 0.3 × consumo de hoy + 0.7 × C_h anterior. La
        barra oscura es la hora actual.
      </p>
    </Card>
  );
}

function Simulator({ deviceId, heightCm }: { deviceId: string; heightCm: number }) {
  const [distance, setDistance] = useState(heightCm / 2);
  const [voltage, setVoltage] = useState(2.8);
  const [msg, setMsg] = useState<string | null>(null);

  const send = async (kind: "nivel" | "turbidez", value: number) => {
    setMsg(null);
    try {
      await api.simulate(deviceId, kind, value);
      setMsg(`Lectura de ${kind} enviada.`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <details className="rounded-xl border border-dashed border-border p-4">
      <summary className="cursor-pointer text-sm font-medium text-muted">
        Simular lecturas (pruebas sin el ESP8266)
      </summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Distancia sensor → agua (cm)
            <input
              type="number"
              step="0.1"
              min={0}
              className={inputClass}
              value={distance}
              onChange={(e) => setDistance(Number(e.target.value))}
            />
          </label>
          <Button onClick={() => send("nivel", distance)}>Enviar nivel</Button>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Voltaje de turbidez (V)
            <input
              type="number"
              step="0.01"
              min={0}
              max={5}
              className={inputClass}
              value={voltage}
              onChange={(e) => setVoltage(Number(e.target.value))}
            />
          </label>
          <Button onClick={() => send("turbidez", voltage)}>Enviar turbidez</Button>
        </div>
      </div>
      {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
    </details>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-12 w-72" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
