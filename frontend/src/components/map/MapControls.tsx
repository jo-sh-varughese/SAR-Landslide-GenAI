"use client";

import type maplibregl from "maplibre-gl";
import { Box, Compass, Map as MapIcon, Minus, Plus } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { Tip } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export function MapControls({ mapRef }: { mapRef: RefObject<maplibregl.Map | null> }) {
  const [pitched, setPitched] = useState(false);
  const [bearing, setBearing] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      const map = mapRef.current;
      if (!map) return;
      clearInterval(id);
      const sync = () => {
        setPitched(map.getPitch() > 5);
        setBearing(map.getBearing());
      };
      map.on("move", sync);
    }, 200);
    return () => clearInterval(id);
  }, [mapRef]);

  const btn =
    "grid h-9 w-9 place-items-center text-fg-2 transition-colors hover:bg-white/[0.07] hover:text-fg focus-visible:outline-none focus-visible:bg-white/[0.08]";

  return (
    <div className="pointer-events-auto absolute bottom-6 right-[calc(max(360px,min(400px,32vw))+40px)] z-10 hidden flex-col gap-2 md:flex">
      <div className="panel flex flex-col overflow-hidden !rounded-xl">
        <Tip content="Zoom in" side="left">
          <button aria-label="Zoom in" className={btn} onClick={() => mapRef.current?.zoomIn()}>
            <Plus className="h-4 w-4" />
          </button>
        </Tip>
        <div className="h-px bg-white/[0.06]" />
        <Tip content="Zoom out" side="left">
          <button aria-label="Zoom out" className={btn} onClick={() => mapRef.current?.zoomOut()}>
            <Minus className="h-4 w-4" />
          </button>
        </Tip>
      </div>
      <div className="panel flex flex-col overflow-hidden !rounded-xl">
        <Tip content={pitched ? "Flat 2D view" : "Tilted 3D view"} side="left">
          <button
            aria-label="Toggle 3D"
            className={cn(btn, pitched && "text-accent")}
            onClick={() => mapRef.current?.easeTo({ pitch: pitched ? 0 : 55, duration: 700 })}
          >
            <Box className="h-4 w-4" />
          </button>
        </Tip>
        <div className="h-px bg-white/[0.06]" />
        <Tip content="Reset north" side="left">
          <button aria-label="Reset north" className={btn} onClick={() => mapRef.current?.easeTo({ bearing: 0, duration: 600 })}>
            <Compass className="h-4 w-4 transition-transform" style={{ transform: `rotate(${-bearing}deg)` }} />
          </button>
        </Tip>
        <div className="h-px bg-white/[0.06]" />
        <Tip content="Whole Western Ghats" side="left">
          <button
            aria-label="Overview"
            className={btn}
            onClick={() => mapRef.current?.flyTo({ center: [76.55, 10.75], zoom: 7.2, pitch: 0, bearing: 0, duration: 1600 })}
          >
            <MapIcon className="h-4 w-4" />
          </button>
        </Tip>
      </div>
    </div>
  );
}
