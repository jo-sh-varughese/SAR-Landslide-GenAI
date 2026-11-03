"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { bboxAround } from "@/lib/hazard";
import type { PredictionRequest } from "@/lib/types";
import { requestKey, useDashboard } from "@/store/dashboard";

export function useStatus() {
  return useQuery({ queryKey: ["status"], queryFn: api.status, refetchInterval: 30_000, retry: 1 });
}

export function useZones() {
  return useQuery({ queryKey: ["zones"], queryFn: api.zones, staleTime: Infinity, retry: 1 });
}

export function useTimeseries(zone: string) {
  return useQuery({ queryKey: ["timeseries", zone], queryFn: () => api.timeseries(zone), staleTime: 5 * 60_000 });
}

let controller: AbortController | null = null;

/** Runs a prediction for the current dashboard settings. Aborts any in-flight
 *  request when a newer one starts, so rapid map clicks never race. State lives
 *  in the store so every panel sees the same running / error status. */
export async function runAnalysis() {
  const s = useDashboard.getState();
  controller?.abort();
  const mine = (controller = new AbortController());
  const key = requestKey(s);
  const body: PredictionRequest = {
    start_date: s.startDate,
    end_date: s.endDate,
    polarization: s.polarization,
    diffusion_steps: s.steps,
    ...(s.target.kind === "zone" ? { zone: s.target.zone } : { bbox: bboxAround(s.target.lon, s.target.lat) }),
  };
  useDashboard.setState({ running: true, error: null });
  try {
    const result = await api.predict(body, mine.signal);
    if (mine !== controller) return;
    useDashboard.setState({ result, resultKey: key, selected: null, hovered: null, running: false });
  } catch (e) {
    if (mine !== controller || (e as Error).name === "AbortError") return;
    useDashboard.setState({ running: false, error: (e as Error).message });
  }
}
