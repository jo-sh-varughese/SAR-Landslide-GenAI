"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Radar, RotateCw } from "lucide-react";
import { runAnalysis } from "@/hooks/queries";
import { riskMeta } from "@/lib/hazard";
import { cn } from "@/lib/utils";
import { useDashboard, type InsightTab } from "@/store/dashboard";
import { Button, Kbd, RiskBadge } from "@/components/ui/primitives";
import { ImageryTab } from "@/components/insights/Imagery";
import { OverviewTab, RiskGauge } from "@/components/insights/Overview";
import { ProvenanceTab } from "@/components/insights/Provenance";
import { TrendsTab } from "@/components/insights/Trends";

const TABS: { id: InsightTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "trends", label: "Trends" },
  { id: "imagery", label: "Imagery" },
  { id: "provenance", label: "Provenance" },
];

export function InsightsPanel({ className }: { className?: string }) {
  const r = useDashboard((s) => s.result);
  const running = useDashboard((s) => s.running);
  const error = useDashboard((s) => s.error);
  const tab = useDashboard((s) => s.tab);
  const target = useDashboard((s) => s.target);
  const zoneKey = target.kind === "zone" ? target.zone : target.label;

  return (
    <aside className={cn("panel pointer-events-auto relative flex flex-col overflow-hidden", className)}>
      {running && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden">
          <div className="animate-indeterminate h-full w-1/3 bg-gradient-to-r from-transparent via-accent to-transparent" />
        </div>
      )}

      {/* Hero */}
      <div className="shrink-0 border-b border-white/[0.06] px-5 pb-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Area assessment</div>
            <h2 className="mt-1 truncate text-[17px] font-semibold tracking-tight">{target.label}</h2>
            <div className="mt-0.5 font-mono text-[11px] text-fg-3">
              {target.lat.toFixed(4)}°N · {target.lon.toFixed(4)}°E
            </div>
          </div>
          {r && !running && <RiskBadge level={r.risk_level} />}
        </div>

        <AnimatePresence mode="wait">
          {r ? (
            <motion.div key="hero" initial={{ opacity: 0 }} animate={{ opacity: running ? 0.45 : 1 }} exit={{ opacity: 0 }} className="mt-2">
              <RiskGauge value={r.mean_hazard_index} level={r.risk_level} />
              <p className="mt-2 text-center text-[12.5px] text-fg-2">{riskMeta(r.risk_level).blurb}</p>
            </motion.div>
          ) : running ? (
            <motion.div key="load" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 flex flex-col items-center gap-3 py-6">
              <Scanner />
              <p className="text-[12.5px] text-fg-2">Fetching terrain, rainfall and running diffusion…</p>
            </motion.div>
          ) : error ? null : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 flex flex-col items-center gap-3 py-6 text-center">
              <Radar className="h-8 w-8 text-fg-3" />
              <p className="max-w-60 text-[12.5px] text-fg-2">Click anywhere on the map, search with <Kbd>⌘K</Kbd>, or press <Kbd>R</Kbd> to analyse.</p>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-critical/[0.08] p-3 text-[12px] ring-1 ring-critical/25">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-critical" />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-fg">Analysis failed</div>
              <div className="mt-0.5 break-words text-fg-3">{error}</div>
            </div>
            <Button variant="ghost" className="h-7 px-2" onClick={() => runAnalysis()}>
              <RotateCw className="h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs.Root value={tab} onValueChange={(v) => useDashboard.setState({ tab: v as InsightTab })} className="flex min-h-0 flex-1 flex-col">
        <Tabs.List className="relative flex shrink-0 gap-1 border-b border-white/[0.06] px-3" aria-label="Insights">
          {TABS.map((t) => (
            <Tabs.Trigger
              key={t.id}
              value={t.id}
              className="relative h-10 px-2.5 text-[12.5px] font-medium text-fg-3 transition-colors hover:text-fg-2 focus-visible:outline-none focus-visible:text-fg data-[state=active]:text-fg"
            >
              {t.label}
              {tab === t.id && <motion.span layoutId="tab-ink" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <Tabs.Content value="trends" className="focus:outline-none">
            <TrendsTab zone={zoneKey} />
          </Tabs.Content>
          {r ? (
            <>
              <Tabs.Content value="overview" className="focus:outline-none"><OverviewTab r={r} /></Tabs.Content>
              <Tabs.Content value="imagery" className="focus:outline-none"><ImageryTab r={r} /></Tabs.Content>
              <Tabs.Content value="provenance" className="focus:outline-none"><ProvenanceTab r={r} /></Tabs.Content>
            </>
          ) : (
            tab !== "trends" && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2.5">
                  {[0, 1, 2, 3].map((i) => <div key={i} className={cn("h-[86px]", running ? "skeleton" : "rounded-2xl bg-white/[0.02] ring-1 ring-white/[0.04]")} />)}
                </div>
                <div className={cn("h-40", running ? "skeleton" : "rounded-2xl bg-white/[0.02] ring-1 ring-white/[0.04]")} />
              </div>
            )
          )}
        </div>
      </Tabs.Root>
    </aside>
  );
}

function Scanner() {
  return (
    <div className="relative h-16 w-16">
      <div className="absolute inset-0 rounded-full ring-1 ring-accent/30" />
      <div className="absolute inset-3 rounded-full ring-1 ring-accent/20" />
      <div className="absolute inset-0 animate-spin rounded-full [animation-duration:1.6s]" style={{ background: "conic-gradient(from 0deg, transparent 70%, rgb(76 155 255 / 0.55))" }} />
      <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
    </div>
  );
}
