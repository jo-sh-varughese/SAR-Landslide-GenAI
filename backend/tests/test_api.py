from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root():
    resp = client.get("/")
    assert resp.status_code == 200
    assert resp.json()["status"] == "online"


def test_healthz():
    assert client.get("/healthz").json() == {"status": "ok"}


def test_status_endpoint():
    resp = client.get("/api/v1/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "Operational"
    assert "monsoon_level" in body


def test_kerala_zones_geojson():
    resp = client.get("/api/v1/layers/kerala-zones")
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) >= 1


def test_predict_landslide_wayanad():
    payload = {
        "zone": "wayanad",
        "start_date": "2026-07-01",
        "end_date": "2026-07-15",
        "polarization": "VV+VH",
        "diffusion_steps": 10,
    }
    resp = client.post("/api/v1/predict/landslide", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert 0 <= body["mean_hazard_index"] <= 1
    assert body["risk_level"] in {"Safe", "Watch", "Warning", "Critical", "Severe"}
    assert body["is_water_dominant"] is False
    assert body["hazard_geojson"]["type"] == "FeatureCollection"
    assert len(body["hazard_heatmap"]) > 0
    assert body["data_sources"]["elevation"]
    assert body["data_sources"]["rainfall"]


def test_predict_landslide_open_ocean_is_not_applicable():
    """A point over open water must never be scored as a landslide hazard."""
    payload = {
        "bbox": {"min_lon": 67.9, "min_lat": 11.9, "max_lon": 68.1, "max_lat": 12.1},
        "start_date": "2026-07-01",
        "end_date": "2026-07-15",
        "polarization": "VV+VH",
        "diffusion_steps": 10,
    }
    resp = client.post("/api/v1/predict/landslide", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_water_dominant"] is True
    assert body["risk_level"] == "Not Applicable"
    assert body["mean_hazard_index"] == 0
    assert body["estimated_affected_population"] == 0
    assert all(cell["is_water"] for cell in body["hazard_heatmap"])


def test_predict_timeseries():
    resp = client.get("/api/v1/predict/timeseries", params={"zone": "idukki"})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["points"]) > 10


def test_datasets_listing():
    resp = client.get("/api/v1/datasets")
    assert resp.status_code == 200
    assert "sources" in resp.json()
