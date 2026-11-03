"use client";

import { memo, useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTimeseries } from "@/hooks/queries";
import type { TimeSeriesPoint } from "@/lib/types";
import { Section } from "@/components/ui/primitives";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]}`;
};

const axis = { stroke: "#2c2c2a", tick: { fill: "#6c7583", fontSize: 10.5 }, tickLine: false, axisLine: false } as const;

function ChartTooltip({ active, payload, label, unit, name }: { active?: boolean; payload?: { value: number }[]; label?: string; unit: string; name: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-ink-700/95 px-2.5 py-1.5 text-[11.5px] shadow-xl ring-1 ring-white/10 backdrop-blur">
      <div className="text-fg-3">{label && fmtDay(label)}</div>
      <div className="tnum font-medium text-fg">
        {name} <span className="font-mono">{payload[0].value}{unit}</span>
      </div>
    </div>
  );
}

interface Spec {
  key: keyof TimeSeriesPoint;
  name: string;
  unit: string;
  color: string;
  kind: "area" | "bar";
  domain?: [number, number];
  ref?: { y: number; label: string };
}

const SPECS: Spec[] = [
  { key: "risk_score", name: "Risk", unit: "", color: "#f0834f", kind: "area", domain: [0, 1], ref: { y: 0.65, label: "Critical" } },
  { key: "rainfall_mm", name: "Rainfall", unit: " mm", color: "#3987e5", kind: "bar" },
  { key: "soil_moisture_pct", name: "Soil moisture", unit: "%", color: "#199e70", kind: "area", domain: [0, 100] },
];

const MiniChart = memo(function MiniChart({ data, spec, last }: { data: TimeSeriesPoint[]; spec: Spec; last: boolean }) {
  const peak = useMemo(() => data.reduce((m, p) => Math.max(m, p[spec.key] as number), 0), [data, spec.key]);
  const common = { data, syncId: "season", margin: { top: 6, right: 4, bottom: 0, left: -8 } };
  const x = <XAxis dataKey="date" {...axis} tickFormatter={fmtDay} minTickGap={36} hide={!last} height={last ? 20 : 0} />;
  const y = <YAxis {...axis} domain={spec.domain ?? [0, "auto"]} width={44} tickCount={3} />;
  const grid = <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 0.05)" />;
  const tip = <Tooltip cursor={{ stroke: "rgb(255 255 255 / 0.25)", fill: "rgb(255 255 255 / 0.04)" }} content={<ChartTooltip unit={spec.unit} name={spec.name} />} />;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[12px]">
        <span className="flex items-center gap-1.5 text-fg-2">
          <span className="h-2 w-2 rounded-[3px]" style={{ background: spec.color }} />
          {spec.name}
        </span>
        <span className="tnum font-mono text-[11px] text-fg-3">peak {spec.key === "risk_score" ? peak.toFixed(2) : `${Math.round(peak)}${spec.unit}`}</span>
      </div>
      <div className={last ? "h-[104px]" : "h-[84px]"}>
        <ResponsiveContainer>
          {spec.kind === "bar" ? (
            <BarChart {...common} barCategoryGap={1}>
              {grid}
              {x}
              {y}
              {tip}
              <Bar dataKey={spec.key} fill={spec.color} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
          ) : (
            <AreaChart {...common}>
              <defs>
                <linearGradient id={`g-${spec.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={spec.color} stopOpacity={0.35} />
                  <stop offset="1" stopColor={spec.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              {grid}
              {x}
              {y}
              {tip}
              {spec.ref && <ReferenceLine y={spec.ref.y} stroke="#e5484d" strokeDasharray="3 3" strokeOpacity={0.6} label={{ value: spec.ref.label, position: "insideTopRight", fill: "#6c7583", fontSize: 10 }} />}
              <Area dataKey={spec.key} type="monotone" stroke={spec.color} strokeWidth={2} fill={`url(#g-${spec.key})`} isAnimationActive={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#0a0d12" }} />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
});

export function TrendsTab({ zone }: { zone: string }) {
  const { data, isLoading, error } = useTimeseries(zone);

  return (
    <Section title={data?.season ?? "Monsoon season"} action={<span className="text-[11px] text-fg-3">May → Sep · 3-day step</span>}>
      {isLoading && <div className="skeleton h-[300px]" />}
      {error && <p className="text-[12px] text-critical">{(error as Error).message}</p>}
      {data && (
        <div className="space-y-4">
          {SPECS.map((spec, i) => (
            <MiniChart key={spec.key} data={data.points} spec={spec} last={i === SPECS.length - 1} />
          ))}
          <p className="rounded-xl bg-white/[0.025] px-3 py-2.5 text-[11.5px] leading-relaxed text-fg-3 ring-1 ring-white/[0.05]">
            Modelled seasonal profile (Gaussian monsoon envelope, peak mid-July) for context. The live hazard score uses
            Open-Meteo rainfall for your selected window, not this curve.
          </p>
        </div>
      )}
    </Section>
  );
}
