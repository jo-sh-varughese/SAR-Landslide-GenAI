"use client";

import { Info, Layers, SlidersHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { HAZARD_GRADIENT_CSS, RISK_CLASSES } from "@/lib/hazard";
import type { Polarization } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DATE_PRESETS, useDashboard, type DatePreset, type Imagery } from "@/store/dashboard";
import { Section, Segmented, Slider, Switch, Tip } from "@/components/ui/primitives";

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="flex items-center gap-1.5 text-[13px] text-fg-2">
        {label}
        {hint && (
          <Tip content={hint}>
            <Info className="h-3 w-3 text-fg-3" />
          </Tip>
        )}
      </span>
      {children}
    </div>
  );
}

export function ControlPanel() {
  const [open, setOpen] = useState(true);
  const s = useDashboard(
    useShallow((d) => ({
      datePreset: d.datePreset, startDate: d.startDate, endDate: d.endDate, polarization: d.polarization, steps: d.steps,
      showHazard: d.showHazard, showZones: d.showZones, extrusion: d.extrusion, imagery: d.imagery, imageryOpacity: d.imageryOpacity,
      setPreset: d.setPreset, setDates: d.setDates, setPolarization: d.setPolarization, setSteps: d.setSteps, set: d.set,
    })),
  );

  return (
    <aside className="panel pointer-events-auto flex max-h-full w-[288px] flex-col overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 shrink-0 items-center gap-2 px-4 text-[13px] font-semibold focus-visible:outline-none"
        aria-expanded={open}
      >
        <SlidersHorizontal className="h-4 w-4 text-fg-3" />
        Parameters
        <span className={cn("ml-auto text-fg-3 transition-transform", !open && "-rotate-90")}>▾</span>
      </button>

      {open && (
        <div className="scrollbar-thin space-y-5 overflow-y-auto border-t border-white/[0.06] px-4 pb-4 pt-4">
          <Section title="Observation window">
            <Segmented<DatePreset>
              size="sm"
              value={s.datePreset}
              onChange={(p) => s.setPreset(p)}
              options={[...DATE_PRESETS.map((d) => ({ value: d.id as DatePreset, label: d.label.replace(" days", "d") })), { value: "forecast", label: "+14d" }]}
            />
            <div className="grid grid-cols-2 gap-2">
              {(["startDate", "endDate"] as const).map((k) => (
                <label key={k} className="block">
                  <span className="mb-1 block text-[11px] text-fg-3">{k === "startDate" ? "From" : "To"}</span>
                  <input
                    type="date"
                    value={s[k]}
                    onChange={(e) =>
                      k === "startDate" ? s.setDates(e.target.value, s.endDate) : s.setDates(s.startDate, e.target.value)
                    }
                    className="h-8 w-full rounded-lg bg-black/30 px-2 font-mono text-[11.5px] text-fg ring-1 ring-white/[0.06] [color-scheme:dark] focus:outline-none focus:ring-accent/60"
                  />
                </label>
              ))}
            </div>
          </Section>

          <Section title="SAR synthesis">
            <Row label="Polarisation" hint="Sentinel-1 channels fed to the ControlNet condition encoder. Affects imagery only, never the hazard score.">
              <Segmented<Polarization>
                size="sm"
                className="w-[150px]"
                value={s.polarization}
                onChange={s.setPolarization}
                options={[
                  { value: "VV", label: "VV" },
                  { value: "VH", label: "VH" },
                  { value: "VV+VH", label: "Dual" },
                ]}
              />
            </Row>
            <div>
              <Row label="Diffusion steps" hint="DDPM reverse-process steps. More steps cost more time.">
                <span className="tnum font-mono text-[12px] text-fg">{s.steps}</span>
              </Row>
              <Slider label="Diffusion steps" value={s.steps} min={5} max={100} step={5} onChange={s.setSteps} />
            </div>
          </Section>

          <Section title="Layers" action={<Layers className="h-3.5 w-3.5 text-fg-3" />}>
            <Row label="Hazard surface">
              <Switch label="Hazard surface" checked={s.showHazard} onChange={(v) => s.set({ showHazard: v })} />
            </Row>
            <Row label="Vulnerability zones" hint="Historically documented high-risk belts. Click one to analyse it.">
              <Switch label="Vulnerability zones" checked={s.showZones} onChange={(v) => s.set({ showZones: v })} />
            </Row>
            <div>
              <Row label="Extrusion">
                <span className="tnum font-mono text-[12px] text-fg">{Math.round(s.extrusion * 100)}%</span>
              </Row>
              <Slider label="Extrusion" value={s.extrusion} min={0} max={1} step={0.05} onChange={(v) => s.set({ extrusion: v })} />
            </div>
            <div className="space-y-2 pt-1">
              <span className="text-[13px] text-fg-2">Imagery underlay</span>
              <Segmented<Imagery>
                size="sm"
                value={s.imagery}
                onChange={(v) => s.set({ imagery: v })}
                options={[
                  { value: "none", label: "Off" },
                  { value: "sar", label: "SAR" },
                  { value: "optical_cloudy", label: "Cloudy" },
                  { value: "optical_synthesized", label: "GenAI" },
                ]}
              />
              {s.imagery !== "none" && (
                <Slider label="Imagery opacity" value={s.imageryOpacity} min={0.1} max={1} step={0.05} onChange={(v) => s.set({ imageryOpacity: v })} />
              )}
            </div>
          </Section>
        </div>
      )}
    </aside>
  );
}

export function Legend() {
  return (
    <div className="panel pointer-events-auto w-[288px] p-4">
      <div className="mb-3">
        <div className="eyebrow">Hazard index</div>
        <div className="mt-1 font-mono text-[10.5px] text-fg-3">0.45·slope + 0.40·rain + 0.15·relief</div>
      </div>
      <div className="h-2 rounded-full" style={{ background: HAZARD_GRADIENT_CSS }} />
      <div className="relative mt-1.5 h-4">
        {RISK_CLASSES.map((r) => (
          <span key={r.level} className="tnum absolute -translate-x-1/2 font-mono text-[10px] text-fg-3" style={{ left: `${Math.max(3, r.from * 100)}%` }}>
            {r.from.toFixed(2)}
          </span>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-1">
        {RISK_CLASSES.map((r) => (
          <span key={r.level} className="flex items-center gap-1.5 text-[11.5px] text-fg-2">
            <span className="h-2 w-2 rounded-[3px]" style={{ background: r.color }} />
            {r.level}
          </span>
        ))}
      </div>
    </div>
  );
}
