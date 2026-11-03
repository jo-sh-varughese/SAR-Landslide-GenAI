// Mirrors backend/app/schemas/hazard.py

export type Polarization = "VV" | "VH" | "VV+VH";

export type RiskLevel = "Safe" | "Watch" | "Warning" | "Critical" | "Severe" | "Not Applicable";

export interface BoundingBox {
  min_lon: number;
  min_lat: number;
  max_lon: number;
  max_lat: number;
}

export interface PredictionRequest {
  zone?: string | null;
  bbox?: BoundingBox | null;
  start_date: string;
  end_date: string;
  polarization: Polarization;
  diffusion_steps: number;
}

export interface HazardCellProps {
  hazard_index: number;
  risk_level: RiskLevel;
  is_water: boolean;
  slope_deg: number;
  soil_saturation_pct: number;
  elevation_m: number;
  center_lon: number;
  center_lat: number;
}

export interface HazardFeature {
  type: "Feature";
  properties: HazardCellProps;
  geometry: { type: "Polygon"; coordinates: number[][][] };
}

export interface DataSources {
  elevation: string;
  rainfall: string;
  water_mask: string;
  sar: string;
}

export interface PreviewImages {
  sar: string;
  optical_cloudy: string;
  optical_synthesized: string;
}

export interface PredictionResponse {
  request_id: string;
  zone: string;
  bbox: BoundingBox;
  start_date: string;
  end_date: string;
  polarization: Polarization;
  diffusion_steps: number;
  mean_hazard_index: number;
  max_hazard_index: number;
  risk_level: RiskLevel;
  is_water_dominant: boolean;
  estimated_affected_population: number;
  soil_moisture_index: number;
  rainfall_total_mm: number;
  data_sources: DataSources;
  synthesized_geotiff: {
    filename: string;
    width: number;
    height: number;
    band_count: number;
    crs: string;
    resolution_m: number;
    generated_at: string;
  };
  hazard_geojson: { type: "FeatureCollection"; features: HazardFeature[] };
  model_mode: string;
  inference_ms: number;
  preview_images?: PreviewImages | null;
}

export interface TimeSeriesPoint {
  date: string;
  risk_score: number;
  soil_moisture_pct: number;
  rainfall_mm: number;
}

export interface TimeSeriesResponse {
  zone: string;
  season: string;
  points: TimeSeriesPoint[];
}

export interface ModelStatus {
  status: string;
  model_loaded: boolean;
  device: string;
  torch_available: boolean;
  diffusers_available: boolean;
  rasterio_available: boolean;
  active_satellite_pass: string;
  monsoon_level: string;
  last_inference_ms: number | null;
}

export interface VulnerabilityZoneProps {
  id: string;
  name: string;
  district: string;
  taluk: string;
  risk_level: RiskLevel;
  baseline_hazard_index: number;
  historical_events: string[];
  population_estimate: number;
  avg_slope_deg: number;
}

export interface VulnerabilityZones {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    properties: VulnerabilityZoneProps;
    geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
  }[];
}
