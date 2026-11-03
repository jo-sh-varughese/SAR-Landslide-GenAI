"use client";

import { MapboxOverlay } from "@deck.gl/mapbox";
import { BitmapLayer, GeoJsonLayer, PathLayer, PolygonLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { runAnalysis, useZones } from "@/hooks/queries";
import { bboxAround, hazardColor, riskMeta } from "@/lib/hazard";
import type { BoundingBox, HazardFeature, VulnerabilityZoneProps } from "@/lib/types";
import { useDashboard } from "@/store/dashboard";
import { MapControls } from "./MapControls";

const BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const KERALA_VIEW = { center: [76.55, 10.75] as [number, number], zoom: 7.2, pitch: 0, bearing: 0 };

function ring(b: BoundingBox): [number, number][] {
  return [
    [b.min_lon, b.min_lat],
    [b.max_lon, b.min_lat],
    [b.max_lon, b.max_lat],
    [b.min_lon, b.max_lat],
    [b.min_lon, b.min_lat],
  ];
}

function zoneCentroid(geometry: { type: string; coordinates: unknown }): [number, number] {
  const coords = (geometry.type === "MultiPolygon"
    ? (geometry.coordinates as number[][][][])[0][0]
    : (geometry.coordinates as number[][][])[0]) as number[][];
  const n = coords.length - 1 || 1;
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    x += coords[i][0];
    y += coords[i][1];
  }
  return [x / n, y / n];
}

/** Injects free Terrarium-DEM hillshading under the basemap's labels. */
async function withHillshade(): Promise<StyleSpecification | string> {
  try {
    const style = (await (await fetch(BASEMAP)).json()) as StyleSpecification;
    style.sources.terrain = { type: "raster-dem", tiles: [TERRARIUM], encoding: "terrarium", tileSize: 256, maxzoom: 13 };
    const firstSymbol = style.layers.findIndex((l) => l.type === "symbol");
    style.layers.splice(firstSymbol < 0 ? style.layers.length : firstSymbol, 0, {
      id: "hillshade",
      type: "hillshade",
      source: "terrain",
      paint: {
        "hillshade-exaggeration": 0.55,
        "hillshade-shadow-color": "#000000",
        "hillshade-highlight-color": "#3a4a5e",
        "hillshade-accent-color": "#0b0f15",
      },
    });
    return style;
  } catch {
    return BASEMAP;
  }
}

export default function HazardMap() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [ready, setReady] = useState(false);

  const target = useDashboard((s) => s.target);
  const result = useDashboard((s) => s.result);
  const showHazard = useDashboard((s) => s.showHazard);
  const showZones = useDashboard((s) => s.showZones);
  const imagery = useDashboard((s) => s.imagery);
  const imageryOpacity = useDashboard((s) => s.imageryOpacity);
  const extrusion = useDashboard((s) => s.extrusion);
  const selected = useDashboard((s) => s.selected);
  const zones = useZones().data;

  /* ---------------------------------------------------------- init map */
  useEffect(() => {
    let disposed = false;
    (async () => {
      const style = await withHillshade();
      if (disposed || !container.current) return;
      const map = new maplibregl.Map({
        container: container.current,
        style,
        ...KERALA_VIEW,
        maxPitch: 70,
        attributionControl: { compact: true },
        fadeDuration: 0,
      });
      const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
      map.addControl(overlay);
      mapRef.current = map;
      overlayRef.current = overlay;
      map.on("load", () => setReady(true));
    })();
    return () => {
      disposed = true;
      overlayRef.current?.finalize();
      mapRef.current?.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  /* --------------------------------------------- camera follows target */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.flyTo({ center: [target.lon, target.lat], zoom: 11.4, pitch: 52, bearing: -18, duration: 2200, essential: true });
  }, [target, ready]);

  /* -------------------------------------------------------- deck layers */
  const features = result?.hazard_geojson.features;
  const bbox = useMemo(() => result?.bbox ?? bboxAround(target.lon, target.lat), [result, target]);
  const image = result?.preview_images && imagery !== "none" ? result.preview_images[imagery] : null;

  const layers = useMemo(() => {
    const L = [];

    if (showZones && zones) {
      L.push(
        new GeoJsonLayer<VulnerabilityZoneProps>({
          id: "zones",
          data: zones as never,
          stroked: true,
          filled: true,
          pickable: true,
          getFillColor: [255, 255, 255, 8],
          getLineColor: [255, 255, 255, 110],
          lineWidthUnits: "pixels",
          getLineWidth: 1.2,
          autoHighlight: true,
          highlightColor: [76, 155, 255, 40],
          onClick: (info) => {
            const f = info.object as unknown as { properties: VulnerabilityZoneProps; geometry: { type: string; coordinates: unknown } };
            if (!f) return false;
            const [lon, lat] = zoneCentroid(f.geometry);
            useDashboard.getState().setTarget({ kind: "point", lon, lat, label: f.properties.name });
            runAnalysis();
            return true;
          },
        }),
      );
    }

    if (image) {
      L.push(
        new BitmapLayer({
          id: "imagery",
          image,
          bounds: [bbox.min_lon, bbox.min_lat, bbox.max_lon, bbox.max_lat],
          opacity: imageryOpacity,
        }),
      );
    }

    if (showHazard && features) {
      L.push(
        new PolygonLayer<HazardFeature>({
          id: "hazard",
          data: features,
          // Inset each cell ~8% toward its centre so columns read as distinct marks.
          getPolygon: (f) => {
            const { center_lon: cx, center_lat: cy } = f.properties;
            return f.geometry.coordinates[0].map(([x, y]) => [cx + (x - cx) * 0.92, cy + (y - cy) * 0.92]) as [number, number][];
          },
          extruded: extrusion > 0,
          wireframe: false,
          filled: true,
          stroked: false,
          pickable: true,
          getElevation: (f) => (f.properties.is_water ? 0 : f.properties.hazard_index * 2600 * extrusion),
          getFillColor: (f) => {
            if (f.properties.is_water) return [60, 120, 200, 40];
            const [r, g, b] = hazardColor(f.properties.hazard_index);
            const sel = selected && selected.center_lon === f.properties.center_lon && selected.center_lat === f.properties.center_lat;
            return [r, g, b, sel ? 255 : image ? 120 : 205];
          },
          material: { ambient: 0.55, diffuse: 0.55, shininess: 24, specularColor: [80, 80, 80] },
          transitions: { getElevation: { duration: 900, easing: (t: number) => 1 - Math.pow(1 - t, 3) } },
          updateTriggers: { getElevation: [extrusion], getFillColor: [selected, !!image] },
          autoHighlight: true,
          highlightColor: [255, 255, 255, 70],
          onHover: (info: PickingInfo<HazardFeature>) => {
            const o = info.object;
            useDashboard.setState({ hovered: o ? { ...o.properties, x: info.x, y: info.y } : null });
          },
          onClick: (info: PickingInfo<HazardFeature>) => {
            if (!info.object) return false;
            useDashboard.setState({ selected: info.object.properties, tab: "overview" });
            return true;
          },
        }),
      );
    }

    L.push(
      new PathLayer({
        id: "bbox",
        data: [{ path: ring(bbox) }],
        getPath: (d: { path: [number, number][] }) => d.path,
        getColor: [76, 155, 255, 220],
        getWidth: 1.5,
        widthUnits: "pixels",
      }),
    );
    return L;
  }, [zones, showZones, image, imageryOpacity, bbox, showHazard, features, extrusion, selected]);

  useEffect(() => {
    overlayRef.current?.setProps({
      layers,
      getCursor: ({ isHovering }) => (isHovering ? "pointer" : "crosshair"),
      onClick: (info) => {
        // Empty-map click: analyse that location. Layer clicks return true and stop here.
        if (info.object || !info.coordinate) return;
        const [lon, lat] = info.coordinate;
        useDashboard.getState().setTarget({ kind: "point", lon, lat, label: "Custom location" });
        runAnalysis();
      },
    });
  }, [layers]);

  return (
    <div className="absolute inset-0">
      {/* maplibre forces position:relative on its container, so size it explicitly */}
      <div ref={container} className="h-full w-full" onMouseLeave={() => useDashboard.setState({ hovered: null })} />
      <MapControls mapRef={mapRef} />
      <HoverCard />
    </div>
  );
}

function HoverCard() {
  const h = useDashboard((s) => s.hovered);
  if (!h) return null;
  const meta = riskMeta(h.risk_level);
  return (
    <div
      className="pointer-events-none absolute z-20 w-52 rounded-xl bg-ink-850/95 p-3 text-[12px] shadow-2xl ring-1 ring-white/10 backdrop-blur"
      style={{ left: h.x + 14, top: h.y + 14 }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold" style={{ color: meta.color }}>
          {h.risk_level}
        </span>
        <span className="tnum font-mono text-fg">{h.hazard_index.toFixed(3)}</span>
      </div>
      <dl className="grid grid-cols-2 gap-y-1 text-fg-3">
        <dt>Slope</dt>
        <dd className="tnum text-right text-fg-2">{h.slope_deg.toFixed(1)}°</dd>
        <dt>Elevation</dt>
        <dd className="tnum text-right text-fg-2">{h.elevation_m.toFixed(0)} m</dd>
        <dt>Saturation</dt>
        <dd className="tnum text-right text-fg-2">{h.soil_saturation_pct.toFixed(0)}%</dd>
      </dl>
    </div>
  );
}
