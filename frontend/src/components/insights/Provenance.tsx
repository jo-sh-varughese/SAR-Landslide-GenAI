"use client";

import { CheckCircle2, CircleDashed, Database, Mountain, Radar, CloudRain, Waves } from "lucide-react";
import { isFallback } from "@/lib/hazard";
import type { PredictionResponse } from "@/lib/types";
import { fmt } from "@/lib/utils";
import { Section } from "@/components/ui/primitives";

export function ProvenanceTab({ r }: { r: PredictionResponse }) {
  const sources = [
    { icon: Mountain, label: "Elevation & slope", value: r.data_sources.elevation, weight: "0.45 + 0.15" },
    { icon: CloudRain, label: "Rainfall", value: r.data_sources.rainfall, weight: "0.40" },
    { icon: Waves, label: "Water mask", value: r.data_sources.water_mask, weight: "mask" },
    { icon: Radar, label: "SAR backscatter", value: r.data_sources.sar, weight: "imagery only" },
  ];
  const g = r.synthesized_geotiff;
  const meta: [string, string][] = [
    ["Request", r.request_id],
    ["Inference", fmt.ms(r.inference_ms)],
    ["Model mode", r.model_mode],
    ["Raster", `${g.width}×${g.height} · ${g.band_count} bands`],
    ["CRS", g.crs],
    ["Resolution", `${g.resolution_m.toFixed(1)} m`],
    ["Artefact", g.filename],
  ];

  return (
    <div className="space-y-5">
      <Section title="Data sources">
        <div className="divide-y divide-white/[0.05] overflow-hidden rounded-2xl ring-1 ring-white/[0.06]">
          {sources.map((s) => {
            const fb = isFallback(s.value);
            return (
              <div key={s.label} className="flex items-start gap-3 bg-white/[0.02] px-3.5 py-3">
                <s.icon className="mt-0.5 h-4 w-4 shrink-0 text-fg-3" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-medium">{s.label}</span>
                    <span className="font-mono text-[10.5px] text-fg-3">w {s.weight}</span>
                  </div>
                  <div className="mt-0.5 break-words font-mono text-[11px] text-fg-3">{s.value}</div>
                </div>
                <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium" style={{ color: fb ? "var(--color-watch)" : "var(--color-safe)" }}>
                  {fb ? <CircleDashed className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {fb ? "Fallback" : "Live"}
                </span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Run metadata" action={<Database className="h-3.5 w-3.5 text-fg-3" />}>
        <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5 text-[11.5px]">
          {meta.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-fg-3">{k}</dt>
              <dd className="truncate font-mono text-fg-2" title={v}>{v}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Method">
        <p className="text-[12px] leading-relaxed text-fg-3">
          Transparent weighted overlay over real inputs, in the family of GSI macro-scale hazard zonation. Weights are fixed and
          documented. They have <span className="text-fg-2">not</span> been calibrated against a landslide inventory, so treat
          this as research-grade decision support, not a replacement for KSDMA / IMD alerts.
        </p>
      </Section>
    </div>
  );
}
