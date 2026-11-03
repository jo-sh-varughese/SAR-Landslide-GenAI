"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { runAnalysis } from "@/hooks/queries";
import { CommandBar } from "@/components/panels/CommandBar";
import { CommandPalette } from "@/components/panels/CommandPalette";
import { ControlPanel, Legend } from "@/components/panels/ControlPanel";
import { InsightsPanel } from "@/components/panels/InsightsPanel";
import { useDashboard } from "@/store/dashboard";

// WebGL map is client-only and the heaviest bundle: load it lazily so the
// chrome paints instantly.
const HazardMap = dynamic(() => import("@/components/map/HazardMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-ink-950" />,
});

export default function DashboardPage() {
  useEffect(() => {
    if (!useDashboard.getState().result) runAnalysis();
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-ink-950">
      <HazardMap />

      {/* vignette for panel legibility */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgb(5_7_10/0.65)_100%)]" />

      <div className="pointer-events-none absolute inset-0 flex flex-col gap-3 p-3 md:p-4">
        <CommandBar />
        <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
          <div className="hidden min-h-0 flex-col justify-between gap-3 md:flex">
            <ControlPanel />
            <Legend />
          </div>
          <div className="flex-1" />
          <InsightsPanel className="max-h-[48vh] w-full md:max-h-none md:w-[min(400px,32vw)] md:min-w-[360px]" />
        </div>
      </div>

      <CommandPalette />
    </main>
  );
}
