import type { BoundingBox, RiskLevel } from "./types";

export type RGB = [number, number, number];

/** Sequential warm ramp for the continuous hazard index (monotone in lightness,
 *  low values recede into the dark basemap, high values pop). */
const RAMP: { t: number; c: RGB }[] = [
  { t: 0.0, c: [56, 74, 92] },
  { t: 0.25, c: [214, 178, 76] },
  { t: 0.45, c: [240, 144, 60] },
  { t: 0.65, c: [232, 88, 58] },
  { t: 0.8, c: [222, 44, 74] },
  { t: 1.0, c: [255, 40, 110] },
];

export function hazardColor(v: number): RGB {
  const x = Math.min(1, Math.max(0, v));
  for (let i = 1; i < RAMP.length; i++) {
    const a = RAMP[i - 1];
    const b = RAMP[i];
    if (x <= b.t) {
      const k = (x - a.t) / (b.t - a.t);
      return [
        Math.round(a.c[0] + (b.c[0] - a.c[0]) * k),
        Math.round(a.c[1] + (b.c[1] - a.c[1]) * k),
        Math.round(a.c[2] + (b.c[2] - a.c[2]) * k),
      ];
    }
  }
  return RAMP[RAMP.length - 1].c;
}

export const HAZARD_GRADIENT_CSS = `linear-gradient(90deg, ${RAMP.map(
  (s) => `rgb(${s.c.join(" ")}) ${s.t * 100}%`,
).join(", ")})`;

export interface RiskMeta {
  level: RiskLevel;
  color: string;
  /** lower bound of the class on the hazard index */
  from: number;
  blurb: string;
}

// Thresholds mirror backend/app/services/inference_engine.py::_risk_level
export const RISK_CLASSES: RiskMeta[] = [
  { level: "Safe", color: "var(--color-safe)", from: 0, blurb: "No significant slope-failure signal." },
  { level: "Watch", color: "var(--color-watch)", from: 0.25, blurb: "Elevated susceptibility. Monitor rainfall." },
  { level: "Warning", color: "var(--color-warning)", from: 0.45, blurb: "Avoid cut slopes and stream banks." },
  { level: "Critical", color: "var(--color-critical)", from: 0.65, blurb: "Prepare to evacuate vulnerable dwellings." },
  { level: "Severe", color: "var(--color-severe)", from: 0.8, blurb: "Evacuate high-risk slopes immediately." },
];

export function riskMeta(level: RiskLevel): RiskMeta {
  return (
    RISK_CLASSES.find((r) => r.level === level) ?? {
      level: "Not Applicable",
      color: "var(--color-fg-3)",
      from: 0,
      blurb: "Area is predominantly open water. No land hazard score applies.",
    }
  );
}

export function riskFromIndex(v: number): RiskLevel {
  let level: RiskLevel = "Safe";
  for (const r of RISK_CLASSES) if (v >= r.from) level = r.level;
  return level;
}

export function bboxAround(lon: number, lat: number, half = 0.06): BoundingBox {
  return { min_lon: lon - half, min_lat: lat - half, max_lon: lon + half, max_lat: lat + half };
}

export function bboxCenter(b: BoundingBox): [number, number] {
  return [(b.min_lon + b.max_lon) / 2, (b.min_lat + b.max_lat) / 2];
}

export function formatCoord(lon: number, lat: number) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${ns}  ${Math.abs(lon).toFixed(4)}°${ew}`;
}

/** Is a data-source string a fallback (not live/real data)? */
export function isFallback(source: string) {
  return /fallback|synthetic|climatology|flat/i.test(source);
}
