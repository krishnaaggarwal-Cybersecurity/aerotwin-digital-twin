from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import ENGINE_ID
from app.database import Database
from app.digital_twin import DigitalTwin
from app.ml import InferenceService
from app.simulation import EngineSimulator
from app.telemetry_analysis import analyze_csv
from app.virtual_uav import VirtualUAV


def test_correlated_synthetic_telemetry_has_required_fields():
    sample = EngineSimulator().step()
    required = {"rpm", "oil_pressure", "cylinder_temperature", "fuel_flow", "vibration", "engine_hours", "timestamp"}
    assert required <= sample.keys()
    assert sample["rpm"] > 1000
    assert 0 < sample["oil_pressure"] < 6


def test_fault_injection_changes_relevant_signal():
    normal = EngineSimulator(seed=4)
    normal_sample = normal.step()
    faulty = EngineSimulator(seed=4)
    faulty.set_fault("low_oil_pressure")
    for _ in range(20):
        fault_sample = faulty.step()
    assert fault_sample["oil_pressure"] < normal_sample["oil_pressure"]


def test_twin_health_and_mission_decline_under_progressive_fault(tmp_path: Path):
    database = Database(tmp_path / "test.db")
    database.initialize(ENGINE_ID)
    twin = DigitalTwin(database, InferenceService())
    starting = twin.snapshot()
    twin.set_fault("cooling_degradation")
    for _ in range(28):
        degraded = twin.step()
    assert degraded["health"]["overall"] < starting["health"]["overall"]
    assert degraded["mission"]["reliability_score"] < starting["mission"]["reliability_score"]
    assert degraded["prediction"]["predicted_fault"] == "cooling_degradation"


def test_fault_control_immediately_updates_twin_conditions(tmp_path: Path):
    database = Database(tmp_path / "test.db")
    database.initialize(ENGINE_ID)
    twin = DigitalTwin(database, InferenceService())
    healthy = twin.snapshot()
    faulty = twin.set_fault("cooling_degradation")
    assert faulty["settings"]["fault_progress"] >= 42
    assert faulty["telemetry"]["cylinder_temperature"] > healthy["telemetry"]["cylinder_temperature"]
    assert faulty["health"]["overall"] < healthy["health"]["overall"]
    assert faulty["mission"]["reliability_score"] < healthy["mission"]["reliability_score"]


def test_settings_control_immediately_creates_new_telemetry(tmp_path: Path):
    database = Database(tmp_path / "test.db")
    database.initialize(ENGINE_ID)
    twin = DigitalTwin(database, InferenceService())
    before = twin.snapshot()
    updated = twin.update_settings({"throttle": 90, "load": 90, "altitude": 5000, "ambient_temperature": 35, "speed": 5})
    assert updated["settings"]["speed"] == 5
    assert updated["telemetry"]["throttle"] == 90
    assert updated["telemetry"]["load"] == 90
    assert updated["telemetry"]["timestamp"] != before["telemetry"]["timestamp"]


def test_csv_analysis_reports_first_limit_breach_and_source():
    rows = ["timestamp,cylinder_temperature,oil_pressure,vibration"]
    for index in range(8):
        rows.append(f"2026-01-01T10:{index:02}:00Z,145,4.2,2.1")
    rows.extend([
        "2026-01-01T10:08:00Z,173,3.8,2.3",
        "2026-01-01T10:09:00Z,178,3.7,2.4",
        "2026-01-01T10:10:00Z,181,3.6,2.5",
    ])
    result = analyze_csv("\n".join(rows), "engine-run.csv")
    assert result["source"] == "uploaded telemetry"
    assert result["sample_count"] == 11
    assert result["first_detection"]["sample_index"] == 9
    assert result["first_detection"]["fault"] == "Thermal excursion"
    assert "synthetic-trained classifier is not applied" in result["scope_note"]


def test_csv_analysis_requires_enough_samples():
    with pytest.raises(ValueError, match="At least 8"):
        analyze_csv("rpm\n2200\n2250\n2300\n", "short.csv")


def test_csv_analysis_confirms_persistent_baseline_shift():
    rows = ["\ufefftimestamp,cylinder_temperature"]
    rows.extend(f"2026-01-01T10:{index:02}:00Z,145" for index in range(8))
    rows.extend(f"2026-01-01T10:{index:02}:00Z,151" for index in range(8, 11))
    result = analyze_csv("\n".join(rows), "trend.csv")
    assert result["first_detection"]["sample_index"] == 11
    assert result["first_detection"]["severity"] == "WARNING"
    assert "3 consecutive samples" in result["first_detection"]["reason"]


def test_virtual_uav_controls_are_isolated_and_engine_linked():
    uav = VirtualUAV("APT-MALE-SIM-02")
    uav.step({"altitude": 2500, "airspeed": 120, "rpm": 2200, "health_index": 84}, 60)
    state = uav.snapshot()
    assert state["engine_id"] == "APT-MALE-SIM-02"
    assert state["altitude_m"] == 2500
    assert state["engine_health"] == 84
    assert state["progress_pct"] > 0
    assert uav.control("pause")["flight_state"] == "PAUSED"


def test_api_health_and_simulation_controls(monkeypatch):
    from app.main import app
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with TestClient(app) as client:
        root_response = client.get("/")
        if (Path(__file__).parents[2] / "frontend" / "dist" / "index.html").is_file():
            assert "<div id=\"root\"></div>" in root_response.text
        else:
            assert root_response.json()["service"] == "AeroTwin Digital Twin API"
        response = client.get("/api/health")
        assert response.status_code == 200
        assert 0 <= response.json()["overall"] <= 100
        vehicles = client.get("/api/fleet").json()
        assert len(vehicles) == 3
        assert len({round(vehicle["telemetry"]["rpm"]) for vehicle in vehicles}) == 3
        selected = client.post("/api/fleet/select", json={"engine_id": vehicles[1]["engine_id"]})
        assert selected.status_code == 200
        assert client.get("/api/engine").json()["engine_id"] == vehicles[1]["engine_id"]
        assert client.post(f"/api/fleet/{vehicles[2]['engine_id']}/control", json={"action": "pause"}).status_code == 200
        assert client.get("/api/uav").json()["engine_id"] == vehicles[1]["engine_id"]
        assert client.post("/api/uav/control", json={"action": "pause"}).json()["flight_state"] == "PAUSED"
        csv_response = client.post("/api/telemetry/analyze-csv", json={
            "filename": "sample.csv",
            "csv_text": "timestamp,rpm\n" + "".join(f"2026-01-01T10:{index:02}:00Z,{2200 + index}\n" for index in range(10)),
        })
        assert csv_response.status_code == 200
        assert csv_response.json()["sample_count"] == 10
        assistant = client.post("/api/assistant/chat", json={"message": "Summarize engine health"})
        assert assistant.status_code == 200
        assert assistant.json()["engine_id"] == vehicles[1]["engine_id"]
        response = client.post("/api/simulation/fault", json={"fault": "excessive_vibration"})
        assert response.status_code == 200
        response = client.post("/api/simulation/settings", json={"speed": 5, "throttle": 72, "load": 70, "altitude": 2200, "ambient_temperature": 26})
        assert response.status_code == 200
        assert response.json()["settings"]["speed"] == 5
        assert client.get("/api/telemetry/latest").status_code == 200
