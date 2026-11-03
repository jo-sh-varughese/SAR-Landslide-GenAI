"use client";

import { CalendarRange, Cpu, Loader2, MapPin, Play, RotateCw, Satellite, Search, CloudRain } from "lucide-react";
import Link from "next/link";
import { runAnalysis, useStatus } from "@/hooks/queries";
import { DATE_PRESETS, requestKey, useDashboard, type DatePreset } from "@/store/dashboard";
import { Button, Kbd, Segmented, Tip } from "@/components/ui/primitives";
import { cn, fmt } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7cb8ff" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#lg)" />
      <path d="M5 23 L12 13 L16.5 18.5 L20 14 L27 23 Z" fill="#05070a" opacity="0.85" />
      <path d="M8 9.5 a9 9 0 0 1 16 0" stroke="#05070a" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.6" />
      <path d="M11 11 a5.5 5.5 0 0 1 10 0" stroke="#05070a" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

export function CommandBar() {
  const target = useDashboard((s) => s.target);
  const datePreset = useDashboard((s) => s.datePreset);
  const startDate = useDashboard((s) => s.startDate);
  const endDate = useDashboard((s) => s.endDate);
  const running = useDashboard((s) => s.running);
  const stale = useDashboard((s) => s.result !== null && s.resultKey !== requestKey(s));
  const hasResult = useDashboard((s) => s.result !== null);

  return (
    <header className="panel pointer-events-auto flex h-14 items-center gap-3 px-3 pr-2.5">
      <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-lg pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
        <Logo className="h-8 w-8" />
        <div className="hidden leading-tight lg:block">
          <div className="text-[13.5px] font-semibold tracking-tight">SAR-Landslide-GenAI</div>
          <div className="text-[11px] text-fg-3">Western Ghats hazard intelligence</div>
        </div>
      </Link>

      <div className="mx-1 hidden h-6 w-px bg-white/[0.08] lg:block" />

      <button
        onClick={() => useDashboard.setState({ paletteOpen: true })}
        className="group flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-xl bg-black/30 px-3 text-left ring-1 ring-white/[0.06] transition hover:ring-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 md:max-w-80"
      >
        <MapPin className="h-4 w-4 shrink-0 text-accent" />
        <span className="truncate text-[13px] font-medium">{target.label}</span>
        <span className="hidden truncate font-mono text-[11px] text-fg-3 sm:inline">
          {target.lat.toFixed(3)}, {target.lon.toFixed(3)}
        </span>
        <span className="ml-auto flex items-center gap-1 text-fg-3">
          <Search className="h-3.5 w-3.5 sm:hidden" />
          <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
        </span>
      </button>

      <div className="hidden items-center gap-2 xl:flex">
        <CalendarRange className="h-4 w-4 text-fg-3" />
        <Segmented<DatePreset>
          value={datePreset}
          onChange={(p) => useDashboard.getState().setPreset(p)}
          options={[
            ...DATE_PRESETS.map((d) => ({ value: d.id as DatePreset, label: d.label })),
            { value: "forecast", label: "Forecast" },
          ]}
        />
        {datePreset === "custom" && (
          <span className="font-mono text-[11px] text-fg-3">
            {startDate} → {endDate}
          </span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <StatusChips />
        <Tip content={<span>Run analysis <Kbd className="ml-1">R</Kbd></span>} side="bottom">
          <Button
            variant="primary"
            onClick={() => runAnalysis()}
            disabled={running}
            className={cn("min-w-[104px]", stale && !running && "animate-pulse")}
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : hasResult ? (
              <RotateCw className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 fill-current" />
            )}
            {running ? "Analysing" : stale ? "Re-run" : hasResult ? "Refresh" : "Analyse"}
          </Button>
        </Tip>
      </div>
    </header>
  );
}

function StatusChips() {
  const { data, isError } = useStatus();
  const online = !!data && !isError;
  const chip = "hidden h-9 items-center gap-2 rounded-xl px-2.5 text-[12px] text-fg-2 ring-1 ring-white/[0.06] 2xl:flex";
  return (
    <>
      <Tip content={online ? `Backend ${data.status.toLowerCase()} · ${data.device}` : "Backend offline. Start it with ./run.sh"} side="bottom">
        <div className="flex h-9 items-center gap-2 rounded-xl px-2.5 text-[12px] text-fg-2 ring-1 ring-white/[0.06]">
          <span
            className={cn("h-2 w-2 rounded-full animate-pulse-dot", online ? "bg-safe text-safe" : "bg-critical text-critical")}
          />
          <span className="hidden md:inline">{online ? "Live" : "Offline"}</span>
        </div>
      </Tip>
      {data && (
        <>
          <div className={chip}>
            <Satellite className="h-3.5 w-3.5 text-fg-3" />
            {data.active_satellite_pass}
          </div>
          <div className={chip}>
            <CloudRain className="h-3.5 w-3.5 text-fg-3" />
            Monsoon · {data.monsoon_level}
          </div>
          {data.last_inference_ms != null && (
            <div className={chip}>
              <Cpu className="h-3.5 w-3.5 text-fg-3" />
              <span className="tnum">{fmt.ms(data.last_inference_ms)}</span>
            </div>
          )}
        </>
      )}
    </>
  );
}
