"use client";

import { useState } from "react";
import { api, type Device } from "@/lib/api";
import { Button, Field, inputClass } from "./ui";

export function NewDeviceForm({ onCreated }: { onCreated: (d: Device) => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [heightCm, setHeightCm] = useState(20);
  const [areaCm2, setAreaCm2] = useState(150);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const capacity = (heightCm * areaCm2) / 1000;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      onCreated(await api.createDevice({ code: code.trim(), name: name.trim(), heightCm, areaCm2 }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Nombre" hint="Ej.: Cisterna de la casa">
        <input required className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Código MQTT" hint="El mismo que usa el ESP8266 en cisterna/<código>/nivel">
        <input
          required
          pattern="[a-zA-Z0-9_\-]+"
          className={`${inputClass} font-mono`}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="cisterna-01"
        />
      </Field>
      <Field label="Altura H (cm)" hint="Distancia del sensor (tapa) al fondo">
        <input type="number" min={1} step="0.1" required className={inputClass} value={heightCm} onChange={(e) => setHeightCm(Number(e.target.value))} />
      </Field>
      <Field label="Área de la base A (cm²)" hint={`Capacidad calculada: ${capacity.toFixed(2)} L`}>
        <input type="number" min={1} step="0.1" required className={inputClass} value={areaCm2} onChange={(e) => setAreaCm2(Number(e.target.value))} />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Guardando…" : "Crear cisterna"}
        </Button>
        {err && <span className="text-sm text-critical">{err}</span>}
      </div>
    </form>
  );
}
