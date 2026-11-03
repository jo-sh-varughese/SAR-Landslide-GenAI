"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Crosshair, CornerDownLeft, History, MapPin, Mountain, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { runAnalysis, useZones } from "@/hooks/queries";
import { riskMeta } from "@/lib/hazard";
import type { RiskLevel } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SITES, useDashboard, type Target } from "@/store/dashboard";
import { Kbd } from "@/components/ui/primitives";

interface Item {
  id: string;
  group: string;
  title: string;
  subtitle: string;
  risk?: RiskLevel;
  icon: typeof MapPin;
  target: Target;
}

function centroid(geometry: { type: string; coordinates: unknown }): [number, number] {
  const ring = (geometry.type === "MultiPolygon"
    ? (geometry.coordinates as number[][][][])[0][0]
    : (geometry.coordinates as number[][][])[0]) as number[][];
  const n = ring.length - 1 || 1;
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    x += ring[i][0];
    y += ring[i][1];
  }
  return [x / n, y / n];
}

/** Parses "11.68, 76.13" (lat, lon) into a target. */
function parseCoords(q: string): Target | null {
  const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lon = parseFloat(m[2]);
  if (Math.abs(lat) > 85 || Math.abs(lon) > 180) return null;
  return { kind: "point", lat, lon, label: `${lat.toFixed(3)}, ${lon.toFixed(3)}` };
}

export function CommandPalette() {
  const open = useDashboard((s) => s.paletteOpen);
  const zones = useZones().data;
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input, textarea, [contenteditable]");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useDashboard.setState((s) => ({ paletteOpen: !s.paletteOpen }));
      } else if (!typing && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === "r" && !useDashboard.getState().paletteOpen) {
        runAnalysis();
      } else if (!typing && e.key === "/") {
        e.preventDefault();
        useDashboard.setState({ paletteOpen: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const items = useMemo<Item[]>(() => {
    const base: Item[] = Object.values(SITES).map((s) => ({
      id: s.zone,
      group: "Study sites",
      title: s.label,
      subtitle: "District study area · Sentinel-1 AOI",
      icon: MapPin,
      target: s,
    }));
    for (const f of zones?.features ?? []) {
      const [lon, lat] = centroid(f.geometry);
      base.push({
        id: f.properties.id,
        group: "Vulnerability zones",
        title: f.properties.name,
        subtitle: `${f.properties.district} · ${f.properties.historical_events[0] ?? `${f.properties.avg_slope_deg}° mean slope`}`,
        risk: f.properties.risk_level,
        icon: f.properties.historical_events.length ? History : Mountain,
        target: { kind: "point", lon, lat, label: f.properties.name },
      });
    }
    const needle = q.trim().toLowerCase();
    const filtered = needle ? base.filter((i) => `${i.title} ${i.subtitle}`.toLowerCase().includes(needle)) : base;
    const coords = parseCoords(q);
    if (coords)
      filtered.unshift({ id: "coords", group: "Coordinates", title: coords.label, subtitle: "Analyse this exact point", icon: Crosshair, target: coords });
    return filtered;
  }, [zones, q]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (item: Item) => {
    useDashboard.getState().setTarget(item.target);
    useDashboard.setState({ paletteOpen: false });
    setQ("");
    runAnalysis();
  };

  let lastGroup = "";
  return (
    <Dialog.Root open={open} onOpenChange={(o) => useDashboard.setState({ paletteOpen: o })}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content
          className="panel fixed left-1/2 top-[14vh] z-50 w-[min(600px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden !rounded-2xl p-0 focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && items[active]) {
              e.preventDefault();
              choose(items[active]);
            }
          }}
        >
          <Dialog.Title className="sr-only">Choose an area to analyse</Dialog.Title>
          <Dialog.Description className="sr-only">Search study sites and vulnerability zones, or type coordinates.</Dialog.Description>
          <div className="flex items-center gap-3 border-b border-white/[0.06] px-4">
            <Search className="h-4 w-4 text-fg-3" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search zones, districts, or type lat, lon…"
              className="h-14 flex-1 bg-transparent text-[15px] text-fg placeholder:text-fg-3 focus:outline-none"
            />
            <Kbd>esc</Kbd>
          </div>
          <div ref={listRef} className="scrollbar-thin max-h-[360px] overflow-y-auto p-2">
            {items.length === 0 && <p className="px-3 py-8 text-center text-[13px] text-fg-3">No matches. Try coordinates like 11.68, 76.13.</p>}
            {items.map((item, idx) => {
              const header = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              const Icon = item.icon;
              return (
                <div key={item.id}>
                  {header && <div className="eyebrow px-3 pb-1.5 pt-3">{header}</div>}
                  <button
                    data-idx={idx}
                    onMouseMove={() => setActive(idx)}
                    onClick={() => choose(item)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                      idx === active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]",
                    )}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.05] ring-1 ring-white/[0.06]">
                      <Icon className="h-4 w-4 text-fg-2" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{item.title}</span>
                      <span className="block truncate text-[12px] text-fg-3">{item.subtitle}</span>
                    </span>
                    {item.risk && (
                      <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: riskMeta(item.risk).color }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: riskMeta(item.risk).color }} />
                        {item.risk}
                      </span>
                    )}
                    {idx === active && <CornerDownLeft className="h-3.5 w-3.5 text-fg-3" />}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 border-t border-white/[0.06] px-4 py-2.5 text-[11px] text-fg-3">
            <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
            <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> analyse</span>
            <span className="ml-auto">Tip: click anywhere on the map to analyse that spot</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
