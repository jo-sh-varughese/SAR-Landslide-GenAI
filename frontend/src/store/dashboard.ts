import { create } from "zustand";
import type { HazardCellProps, Polarization, PredictionResponse } from "@/lib/types";
import { addDays, isoDay } from "@/lib/utils";

export type Target =
  | { kind: "zone"; zone: string; label: string; lon: number; lat: number }
  | { kind: "point"; label: string; lon: number; lat: number };

export type Imagery = "none" | "sar" | "optical_synthesized" | "optical_cloudy";
export type InsightTab = "overview" | "trends" | "imagery" | "provenance";

export const SITES: Record<string, Extract<Target, { kind: "zone" }>> = {
  wayanad: { kind: "zone", zone: "wayanad", label: "Wayanad", lon: 76.132, lat: 11.6854 },
  idukki: { kind: "zone", zone: "idukki", label: "Idukki", lon: 76.9667, lat: 9.85 },
};

// Open-Meteo coverage (see backend real_data.py): last 92 days + 16-day forecast.
export const DATE_PRESETS = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "14d", label: "14 days", days: 14 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "90 days", days: 90 },
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number]["id"] | "forecast" | "custom";

function rangeFor(days: number) {
  const end = new Date();
  return { startDate: isoDay(addDays(end, -(days - 1))), endDate: isoDay(end) };
}

interface DashboardState {
  target: Target;
  startDate: string;
  endDate: string;
  datePreset: DatePreset;
  polarization: Polarization;
  steps: number;

  showHazard: boolean;
  showZones: boolean;
  imagery: Imagery;
  imageryOpacity: number;
  extrusion: number;

  running: boolean;
  error: string | null;
  result: PredictionResponse | null;
  /** request params that produced `result`, to detect stale settings */
  resultKey: string | null;
  hovered: (HazardCellProps & { x: number; y: number }) | null;
  selected: HazardCellProps | null;
  tab: InsightTab;
  paletteOpen: boolean;

  setTarget: (t: Target) => void;
  setPreset: (p: DatePreset) => void;
  setDates: (start: string, end: string) => void;
  setPolarization: (p: Polarization) => void;
  setSteps: (n: number) => void;
  set: (patch: Partial<DashboardState>) => void;
}

export const useDashboard = create<DashboardState>((set) => ({
  target: SITES.wayanad,
  ...rangeFor(30),
  datePreset: "30d",
  polarization: "VV+VH",
  steps: 25,

  showHazard: true,
  showZones: true,
  imagery: "none",
  imageryOpacity: 0.85,
  extrusion: 0.6,

  running: false,
  error: null,
  result: null,
  resultKey: null,
  hovered: null,
  selected: null,
  tab: "overview",
  paletteOpen: false,

  setTarget: (target) => set({ target, selected: null }),
  setPreset: (p) => {
    if (p === "forecast") {
      const s = new Date();
      return set({ datePreset: p, startDate: isoDay(s), endDate: isoDay(addDays(s, 13)) });
    }
    const preset = DATE_PRESETS.find((d) => d.id === p);
    if (preset) set({ datePreset: p, ...rangeFor(preset.days) });
  },
  setDates: (startDate, endDate) => set({ startDate, endDate, datePreset: "custom" }),
  setPolarization: (polarization) => set({ polarization }),
  setSteps: (steps) => set({ steps }),
  set: (patch) => set(patch),
}));

export function requestKey(s: Pick<DashboardState, "target" | "startDate" | "endDate" | "polarization" | "steps">) {
  const t = s.target.kind === "zone" ? s.target.zone : `${s.target.lon.toFixed(4)},${s.target.lat.toFixed(4)}`;
  return `${t}|${s.startDate}|${s.endDate}|${s.polarization}|${s.steps}`;
}
