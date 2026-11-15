"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type CalibrationPoint, type Device, type DeviceConfig } from "@/lib/api";
import { Button, Card, ErrorBox, Field, Skeleton, inputClass } from "./ui";

type NumericKey = Exclude<keyof DeviceConfig, "name">;

const SECTIONS: {
  title: string;
  fields: { key: NumericKey; label: string; hint: string; step?: string }[];
}[] = [
  {
    title: "Geometría (V = A × (H − d))",
    fields: [
      { key: "heightCm", label: "Altura H (cm)", hint: "Distancia del sensor al fondo", step: "0.1" },
      { key: "areaCm2", label: "Área de la base A (cm²)", hint: "Largo × ancho, o π·r² si es redonda", step: "0.1" },
      { key: "capacityLiters", label: "Capacidad útil (L)", hint: "Volumen máximo que se considera 100 %", step: "0.01" },
    ],
  },
  {
    title: "Umbrales de nivel (% de la capacidad)",
    fields: [
      { key: "lowPercent", label: "Nivel bajo", hint: "Aviso y LED rojo" },
      { key: "criticalPercent", label: "Nivel crítico", hint: "Buzzer y aviso de apagar la bomba" },
      { key: "reservePercent", label: "Reserva de la bomba", hint: "Meta del cálculo de tiempo restante" },
      { key: "windowMinutes", label: "Ventana del caudal (min)", hint: "Lecturas usadas en la regresión lineal" },
    ],
  },
  {
    title: "Calidad del agua",
    fields: [
      { key: "turbidityThresholdRatio", label: "Umbral de turbidez (0–1)", hint: "0.8 = avisar bajo el 80 % de la referencia", step: "0.01" },
      { key: "turbidityConsecutive", label: "Lecturas seguidas para avisar", hint: "Evita avisos por una sola lectura" },
      { key: "stableMinutes", label: "Minutos de nivel quieto", hint: "Para que la lectura de turbidez sea válida" },
      { key: "cleaningIntervalDays", label: "Recordatorio de limpieza (días)", hint: "Ej.: 180 = seis meses" },
    ],
  },
];

export function DeviceSettings() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [device, setDevice] = useState<Device | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [calibration, setCalibration] = useState<CalibrationPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.device(id), api.calibration(id)])
      .then(([d, c]) => {
        setDevice(d);
        setCalibration(c.map(({ distanceCm, liters }) => ({ distanceCm, liters })));
        const f: Record<string, string> = { name: d.name };
        for (const s of SECTIONS) for (const field of s.fields) f[field.key] = String(d[field.key]);
        setForm(f);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) return <ErrorBox message={error} />;
  if (!device) return <Skeleton className="h-96" />;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const body: DeviceConfig = { name: form.name };
    for (const s of SECTIONS)
      for (const f of s.fields) (body as Record<string, number>)[f.key] = Number(form[f.key]);
    void run(async () => setDevice(await api.updateDevice(id, body)), "Configuración guardada.");
  };

  const computedCapacity = (Number(form.heightCm) * Number(form.areaCm2)) / 1000;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/cisternas/${id}`} className="text-sm text-water hover:underline">
            ← Volver al tablero
          </Link>
          <h1 className="text-2xl font-semibold">Configuración de {device.name}</h1>
          <p className="text-sm text-muted">
            Código MQTT <code className="font-mono">{device.code}</code>
          </p>
        </div>
      </div>

      {msg && (
        <div className={`rounded-xl p-3 text-sm ${msg.ok ? "bg-good-bg" : "bg-critical-bg"}`}>{msg.text}</div>
      )}

      <form onSubmit={save} className="flex flex-col gap-5">
        <Card title="General">
          <Field label="Nombre">
            <input
              required
              className={inputClass}
              value={form.name ?? ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
        </Card>
        {SECTIONS.map((s) => (
          <Card key={s.title} title={s.title}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {s.fields.map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  <input
                    type="number"
                    required
                    min={0}
                    step={f.step ?? "1"}
                    className={inputClass}
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
            {s.fields.some((f) => f.key === "capacityLiters") && (
              <button
                type="button"
                className="mt-3 text-sm text-water hover:underline"
                onClick={() => setForm({ ...form, capacityLiters: computedCapacity.toFixed(2) })}
              >
                Usar A × H = {Number.isFinite(computedCapacity) ? computedCapacity.toFixed(2) : "—"} L
              </button>
            )}
          </Card>
        ))}
        <div>
          <Button type="submit" variant="primary" disabled={busy}>
            Guardar configuración
          </Button>
        </div>
      </form>

      <Card title="Tabla de calibración (cisternas irregulares)">
        <p className="mb-3 text-sm text-muted">
          Llene la cisterna con cubetas de volumen conocido y anote la distancia medida en cada
          paso. Con dos o más puntos se interpola en la tabla en lugar de usar la fórmula.
        </p>
        <div className="flex flex-col gap-2">
          {calibration.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                min={0}
                aria-label="Distancia (cm)"
                className={inputClass}
                value={p.distanceCm}
                onChange={(e) =>
                  setCalibration(calibration.map((x, j) => (j === i ? { ...x, distanceCm: Number(e.target.value) } : x)))
                }
              />
              <span className="text-sm text-faint">cm →</span>
              <input
                type="number"
                step="0.01"
                min={0}
                aria-label="Litros"
                className={inputClass}
                value={p.liters}
                onChange={(e) =>
                  setCalibration(calibration.map((x, j) => (j === i ? { ...x, liters: Number(e.target.value) } : x)))
                }
              />
              <span className="text-sm text-faint">L</span>
              <Button variant="ghost" aria-label="Quitar punto" onClick={() => setCalibration(calibration.filter((_, j) => j !== i))}>
                ×
              </Button>
            </div>
          ))}
          {calibration.length === 0 && <p className="text-sm text-faint">Sin puntos: se usa V = A × (H − d).</p>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => setCalibration([...calibration, { distanceCm: 0, liters: 0 }])}>Agregar punto</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const saved = await api.saveCalibration(id, calibration);
                setCalibration(saved.map(({ distanceCm, liters }) => ({ distanceCm, liters })));
              }, "Tabla de calibración guardada.")
            }
          >
            Guardar tabla
          </Button>
        </div>
      </Card>

      <Card title="Mantenimiento">
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy}
            onClick={() => {
              if (confirm("¿Borrar el perfil de consumo por hora? Se volverá a usar la fórmula directa hasta juntar 3 días."))
                void run(() => api.resetProfile(id), "Perfil de consumo reiniciado.");
            }}
          >
            Reiniciar perfil de consumo
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (confirm(`¿Eliminar ${device.name} y todas sus lecturas? Esta acción no se puede deshacer.`))
                void run(async () => {
                  await api.deleteDevice(id);
                  router.push("/");
                }, "Cisterna eliminada.");
            }}
          >
            Eliminar cisterna
          </Button>
        </div>
      </Card>
    </div>
  );
}
