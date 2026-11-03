"use client";

import { ChevronsLeftRight, FlaskConical } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { PreviewImages, PredictionResponse } from "@/lib/types";
import { Section, Segmented } from "@/components/ui/primitives";

type Key = keyof PreviewImages;
const LABEL: Record<Key, string> = { sar: "SAR (VV·VH)", optical_cloudy: "Optical (cloudy)", optical_synthesized: "GenAI optical" };

export function ImageryTab({ r }: { r: PredictionResponse }) {
  const [left, setLeft] = useState<Key>("sar");
  const [pos, setPos] = useState(0.5);
  const box = useRef<HTMLDivElement>(null);
  const imgs = r.preview_images;

  const move = useCallback((clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (rect) setPos(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)));
  }, []);

  if (!imgs)
    return <p className="text-[12.5px] text-fg-3">This backend build does not return preview imagery. Update the backend to enable swipe-compare.</p>;

  return (
    <div className="space-y-4">
      <Section title="Swipe compare">
        <Segmented<Key>
          size="sm"
          value={left}
          onChange={setLeft}
          options={[
            { value: "sar", label: "SAR input" },
            { value: "optical_cloudy", label: "Cloudy optical" },
          ]}
        />
        <div
          ref={box}
          className="relative aspect-square w-full cursor-ew-resize touch-none select-none overflow-hidden rounded-2xl ring-1 ring-white/[0.08]"
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            move(e.clientX);
          }}
          onPointerMove={(e) => e.buttons === 1 && move(e.clientX)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgs.optical_synthesized} alt="Synthesised pseudo-optical image" className="absolute inset-0 h-full w-full object-cover [image-rendering:auto]" draggable={false} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgs[left]}
            alt={LABEL[left]}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ clipPath: `inset(0 ${(1 - pos) * 100}% 0 0)` }}
            draggable={false}
          />
          <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos * 100}%` }}>
            <div className="absolute inset-y-0 -left-px w-0.5 bg-white/90 shadow-[0_0_12px_rgb(0_0_0/0.6)]" />
            <div
              role="slider"
              tabIndex={0}
              aria-label="Comparison position"
              aria-valuenow={Math.round(pos * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 0.05));
                if (e.key === "ArrowRight") setPos((p) => Math.min(1, p + 0.05));
              }}
              className="pointer-events-auto absolute top-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-ink-950 shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/50"
            >
              <ChevronsLeftRight className="h-4 w-4" />
            </div>
          </div>
          <span className="absolute left-2.5 top-2.5 rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium backdrop-blur">{LABEL[left]}</span>
          <span className="absolute right-2.5 top-2.5 rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium backdrop-blur">{LABEL.optical_synthesized}</span>
        </div>
      </Section>

      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(LABEL) as Key[]).map((k) => (
          <figure key={k} className="space-y-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgs[k]} alt={LABEL[k]} className="aspect-square w-full rounded-xl object-cover ring-1 ring-white/[0.08]" />
            <figcaption className="text-center text-[10.5px] text-fg-3">{LABEL[k]}</figcaption>
          </figure>
        ))}
      </div>

      <div className="flex gap-2.5 rounded-xl bg-watch/[0.06] px-3 py-2.5 text-[11.5px] leading-relaxed text-fg-2 ring-1 ring-watch/20">
        <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-watch" />
        <span>
          The ControlNet diffusion weights are not yet trained, so the GenAI view is illustrative. It never feeds the hazard
          score. Mode: <span className="font-mono text-fg">{r.model_mode}</span> · {r.diffusion_steps} steps · {r.polarization}
        </span>
      </div>
    </div>
  );
}
