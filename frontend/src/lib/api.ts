import type {
  ModelStatus,
  PredictionRequest,
  PredictionResponse,
  RiskLevel,
  TimeSeriesResponse,
  VulnerabilityZones,
} from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
const API_KEY = process.env.NEXT_PUBLIC_API_KEY;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
        ...init?.headers,
      },
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(`Backend unreachable at ${API_URL}`, 0);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {}
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

export const api = {
  status: () => request<ModelStatus>("/status"),
  zones: () => request<VulnerabilityZones>("/layers/kerala-zones"),
  timeseries: (zone: string) => request<TimeSeriesResponse>(`/predict/timeseries?zone=${encodeURIComponent(zone)}`),
  predict: (body: PredictionRequest, signal?: AbortSignal) =>
    request<PredictionResponse>("/predict/landslide", { method: "POST", body: JSON.stringify(body), signal }),

  async advisoryPdf(body: {
    zone: string;
    risk_level: RiskLevel;
    mean_hazard_index: number;
    estimated_affected_population: number;
  }): Promise<Blob> {
    const res = await fetch(`${API_URL}/api/v1/predict/advisory-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(API_KEY ? { "X-API-Key": API_KEY } : {}) },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new ApiError((await res.text()) || res.statusText, res.status);
    return res.blob();
  },
};
