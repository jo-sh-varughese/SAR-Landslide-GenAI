"use client";

import { motion, useSpring, useTransform } from "framer-motion";
import { CloudRain, Droplet, FileDown, Loader2, MousePointerClick, TrendingUp, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { RISK_CLASSES, hazardColor, riskFromIndex, riskMeta } from "@/lib/hazard";
import type { PredictionResponse, RiskLevel } from "@/lib/types";
import { cn, fmt } from "@/lib/utils";
import { useDashboard } from "@/store/dashboard";
import { Button, RiskBadge, Section } from "@/components/ui/primitives";

/* Animated number that eases between values. */
function Ticker({ value, format }: { value: number; format: (n: number) => string }) {
  const spring = useSpring(value, { stiffness: 90, damping: 20 });
  const text = useTransform(spring, format);
  useEffect(() => spring.set(value), [spring, value]);
  return <motion.span className="tnum">{text}</motion.span>;
}

/* 240° arc gauge with the hazard ramp as the track. */
export function RiskGauge({ value, level }: { value: number; level: RiskLevel }) {
  const R = 64;
  const C = 2 * Math.PI * R;
  const span = 240 / 360;
  const stops = useMemo(() => [0, 0.25, 0.45, 0.65, 0.8, 1].map((t) => ({ t, c: `rgb(${hazardColor(t).join(" ")})` })), []);
  const na = level === "Not Applicable";

  return (
    <div className="relative mx-auto h-[150px] w-[168px]">
      <svg viewBox="0 0 168 150" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="gauge" x1="0" y1="1" x2="1" y2="1">
            {stops.map((s) => (
              <stop key={s.t} offset={s.t} stopColor={s.c} />
            ))}
          </linearGradient>
        </defs>
        <g transform="translate(84 84) rotate(150)">
          <circle r={R} fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth="10" strokeDasharray={`${C * span} ${C}`} strokeLinecap="round" />
          <motion.circle
            r={R}
            fill="none"
            stroke={na ? "rgb(255 255 255 / 0.2)" : "url(#gauge)"}
            strokeWidth="10"
            strokeLinecap="round"
            initial={{ strokeDasharray: `0 ${C}` }}
            animate={{ strokeDasharray: `${C * span * (na ? 0 : value)} ${C}` }}
            transition={{ type: "spring", stiffness: 60, damping: 18 }}
          />
        </g>
        {!na && <Needle value={value} r={R} />}
      </svg>
      <div className="absolute inset-x-0 top-[60px] text-center text-[42px] font-semibold leading-none tracking-tight">
        {na ? "—" : <Ticker value={value} format={(n) => n.toFixed(2)} />}
      </div>
      <div className="absolute inset-x-0 bottom-0 text-center text-[11px] text-fg-3">Mean hazard index</div>
    </div>
  );
}

/* Needle dot rides the arc: θ = 150° + 240°·v (SVG angles, clockwise from +x). */
function Needle({ value, r }: { value: number; r: number }) {
  const v = useSpring(0, { stiffness: 60, damping: 16 });
  useEffect(() => v.set(Math.min(1, Math.max(0, value))), [v, value]);
  const cx = useTransform(v, (t) => 84 + r * Math.cos(((150 + 240 * t) * Math.PI) / 180));
  const cy = useTransform(v, (t) => 84 + r * Math.sin(((150 + 240 * t) * Math.PI) / 180));
  return <motion.circle cx={cx} cy={cy} r="6.5" fill="#05070a" stroke="white" strokeWidth="2.5" />;
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof CloudRain; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.025] p-3.5 ring-1 ring-white/[0.05]">
      <div className="flex items-center gap-1.5 text-[11.5px] text-fg-3">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1.5 text-[22px] font-semibold leading-none tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-fg-3">{sub}</div>}
    </div>
  );
}

export function OverviewTab({ r }: { r: PredictionResponse }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5">
        <Stat icon={TrendingUp} label="Peak pixel" value={<Ticker value={r.max_hazard_index} format={(n) => n.toFixed(2)} />} sub={`Highest pixel · ${riskFromIndex(r.max_hazard_index)} level`} />
        <Stat icon={CloudRain} label="Rainfall" value={<><Ticker value={r.rainfall_total_mm} format={(n) => n.toFixed(0)} /><span className="ml-1 text-[13px] font-normal text-fg-3">mm</span></>} sub={`${r.start_date} → ${r.end_date}`} />
        <Stat icon={Droplet} label="Soil saturation" value={<><Ticker value={r.soil_moisture_index * 100} format={(n) => n.toFixed(0)} /><span className="ml-0.5 text-[13px] font-normal text-fg-3">%</span></>} sub="Rainfall × drainage proxy" />
        <Stat icon={Users} label="Exposed population" value={<Ticker value={r.estimated_affected_population} format={(n) => fmt.int(n)} />} sub="Hazard-weighted estimate" />
      </div>
      <SelectedCell />
      <Distribution r={r} />
      <AdvisoryButton r={r} />
    </div>
  );
}

function Distribution({ r }: { r: PredictionResponse }) {
  const { rows, land, water } = useMemo(() => {
    const counts = new Map<RiskLevel, number>();
    let water = 0;
    for (const f of r.hazard_geojson.features) {
      if (f.properties.is_water) water++;
      else counts.set(f.properties.risk_level, (counts.get(f.properties.risk_level) ?? 0) + 1);
    }
    const land = r.hazard_geojson.features.length - water;
    return { rows: RISK_CLASSES.map((c) => ({ ...c, n: counts.get(c.level) ?? 0 })), land, water };
  }, [r]);
  const max = Math.max(1, ...rows.map((x) => x.n));

  return (
    <Section title="Grid cells by risk class" action={<span className="text-[11px] text-fg-3">16×16 grid · {land} land{water ? ` · ${water} water` : ""}</span>}>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.level} className="group grid grid-cols-[68px_1fr_64px] items-center gap-2.5 text-[12px]">
            <span className="text-fg-2">{row.level}</span>
            <div className="h-[18px] rounded-[5px] bg-white/[0.03]">
              <motion.div
                className="h-full rounded-[5px]"
                style={{ background: row.color, opacity: row.n ? 0.9 : 0 }}
                initial={{ width: 0 }}
                animate={{ width: `${(row.n / max) * 100}%` }}
                transition={{ type: "spring", stiffness: 80, damping: 18 }}
              />
            </div>
            <span className="tnum text-right font-mono text-[11px] text-fg-3">
              <span className="text-fg-2">{row.n}</span> · {land ? Math.round((row.n / land) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function SelectedCell() {
  const c = useDashboard((s) => s.selected);
  if (!c)
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-white/[0.08] px-3.5 py-3 text-[12px] text-fg-3">
        <MousePointerClick className="h-4 w-4 shrink-0" />
        Select a column on the map to inspect its terrain factors.
      </div>
    );
  const meta = riskMeta(c.risk_level);
  const factors = [
    { label: "Slope", v: Math.min(1, c.slope_deg / 40), text: `${c.slope_deg.toFixed(1)}°`, w: 0.45 },
    { label: "Saturation", v: c.soil_saturation_pct / 100, text: `${c.soil_saturation_pct.toFixed(0)}%`, w: 0.4 },
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-white/[0.025] p-3.5 ring-1 ring-white/[0.06]">
      <div className="flex items-start justify-between">
        <div>
          <div className="eyebrow">Selected cell</div>
          <div className="mt-1 font-mono text-[11px] text-fg-3">
            {c.center_lat.toFixed(4)}°N {c.center_lon.toFixed(4)}°E · {c.elevation_m.toFixed(0)} m
          </div>
        </div>
        <button aria-label="Clear selection" onClick={() => useDashboard.setState({ selected: null })} className="rounded-md p-1 text-fg-3 hover:bg-white/[0.06] hover:text-fg">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="tnum text-[26px] font-semibold leading-none">{c.hazard_index.toFixed(3)}</span>
        <RiskBadge level={c.risk_level} size="sm" />
      </div>
      <div className="mt-3 space-y-2">
        {factors.map((f) => (
          <div key={f.label} className="grid grid-cols-[72px_1fr_48px] items-center gap-2 text-[11.5px]">
            <span className="text-fg-3">{f.label}</span>
            <div className="h-1.5 rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full" style={{ width: `${f.v * 100}%`, background: meta.color }} />
            </div>
            <span className="tnum text-right font-mono text-fg-2">{f.text}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function AdvisoryButton({ r }: { r: PredictionResponse }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const label = useDashboard((s) => s.target.label);

  const download = async () => {
    setBusy(true);
    setErr(null);
    try {
      const blob = await api.advisoryPdf({
        zone: label,
        risk_level: r.risk_level,
        mean_hazard_index: r.mean_hazard_index,
        estimated_affected_population: r.estimated_affected_population,
      });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: `advisory_${label.toLowerCase().replace(/\W+/g, "_")}.pdf` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Button onClick={download} disabled={busy || r.is_water_dominant} className="h-10 w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
        Citizen advisory PDF
      </Button>
      {err && <p className={cn("mt-2 text-[11.5px] text-critical")}>{err}</p>}
    </div>
  );
}
