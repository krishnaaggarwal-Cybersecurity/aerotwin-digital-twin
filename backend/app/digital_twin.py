"""Continuously evolving virtual representation of the synthetic engine."""
from __future__ import annotations

from collections import deque
from copy import deepcopy
import json
import time
from typing import Any

from .config import ENGINE_ID, MAX_HISTORY
from .database import Database
from .ml import InferenceService
from .simulation import EngineSimulator, FAULT_LABELS


PHASES = [
    ("Takeoff", 84, 8), ("Climb", 78, 12), ("Cruise", 62, 75),
    ("Surveillance", 55, 95), ("Loiter", 48, 55), ("Return", 64, 50), ("Landing", 52, 8),
]


class DigitalTwin:
    def __init__(self, database: Database, inference: InferenceService, engine_id: str = ENGINE_ID, seed: int = 26054) -> None:
        self.database = database
        self.inference = inference
        self.engine_id = engine_id
        self.simulator = EngineSimulator(seed=seed, engine_id=engine_id)
        self.running = True
        self.history: deque[dict[str, Any]] = deque(maxlen=MAX_HISTORY)
        self.alerts: deque[dict[str, Any]] = deque(maxlen=60)
        self.last_alert_at: dict[str, float] = {}
        self.current: dict[str, Any] = {}
        self._last_persist = 0.0
        self._last_prediction_persist = 0.0
        self.step()

    def reset(self) -> None:
        self.simulator.reset()
        self.history.clear()
        self.alerts.clear()
        self.last_alert_at.clear()
        self.current = {}
        self.running = True
        self.step()
        self._alert("INFO", "Simulation reset to healthy synthetic baseline.", "reset", "The generic engine twin is now running in Demo Mode.")

    def step(self) -> dict[str, Any]:
        if not self.running and self.current:
            return self.snapshot()
        telemetry = self.simulator.step()
        prediction = self.inference.predict(telemetry)
        components, health = self._calculate_health(telemetry, prediction)
        rul = self._calculate_rul(health, telemetry["engine_hours"])
        mission = self._mission(health, prediction["anomaly_score"])
        maintenance = self._maintenance(prediction, components, health)
        twin = {
            "engine_id": self.engine_id,
            "operating_state": "RUNNING" if self.running else "PAUSED",
            "simulated": True,
            "telemetry": telemetry,
            "health": health,
            "component_health": components,
            "prediction": prediction,
            "estimated_rul_hours": rul,
            "mission": mission,
            "maintenance": maintenance,
            "settings": self.settings(),
            "updated_at": telemetry["timestamp"],
        }
        self.history.append(twin)
        self.current = twin
        self._generate_alerts(twin)
        now = time.monotonic()
        if now - self._last_persist > 2:
            self.database.save_telemetry({**telemetry, "health_index": health["overall"], "anomaly_score": prediction["anomaly_score"]})
            self._last_persist = now
        if now - self._last_prediction_persist > 8:
            self.database.event("predictions", {
                "timestamp": telemetry["timestamp"], "engine_id": self.engine_id, "predicted_fault": prediction["predicted_fault"],
                "confidence": prediction["confidence"], "probabilities": json.dumps(prediction["probabilities"]),
            })
            self.database.event("missions", {
                "timestamp": telemetry["timestamp"], "engine_id": self.engine_id,
                "reliability": mission["reliability_score"], "payload": json.dumps(mission),
            })
            self._last_prediction_persist = now
        return self.snapshot()

    def settings(self) -> dict[str, Any]:
        return {
            "speed": self.simulator.speed, "throttle": self.simulator.throttle, "load": self.simulator.load,
            "altitude": self.simulator.altitude, "ambient_temperature": self.simulator.ambient_temperature,
            "active_fault": self.simulator.active_fault, "fault_label": FAULT_LABELS[self.simulator.active_fault],
            "fault_progress": round(self.simulator.severity * 100, 1), "running": self.running,
        }

    def update_settings(self, values: dict[str, Any]) -> dict[str, Any]:
        self.simulator.update_settings(values)
        # Emit a new correlated point immediately so controls update every view.
        return self.step()

    def set_fault(self, fault: str) -> dict[str, Any]:
        # A 42% starting point makes every fault visibly affect the dashboard
        # immediately, while preserving the remaining progressive ramp.
        self.simulator.set_fault(fault, initial_progress=.42 if fault != "normal" else 0.0)
        snapshot = self.step()
        severity = "INFO" if fault == "normal" else "WARNING"
        message = "Returned to normal synthetic operation." if fault == "normal" else f"Synthetic scenario activated: {FAULT_LABELS[fault]}."
        self._alert(severity, message, f"fault-{fault}", "Fault injection only: no physical engine or operational system is affected.")
        self.database.event("fault_events", {
            "timestamp": snapshot["updated_at"], "engine_id": self.engine_id, "fault": fault,
            "severity": severity, "details": "Synthetic fault injection scenario",
        })
        return self.snapshot()

    def snapshot(self) -> dict[str, Any]:
        output = deepcopy(self.current)
        # Settings are authoritative simulator state and should be visible immediately after a control command.
        output["settings"] = self.settings()
        output["operating_state"] = "RUNNING" if self.running else "PAUSED"
        output["alerts"] = list(self.alerts)
        output["history_size"] = len(self.history)
        return output

    def history_data(self, limit: int = 300) -> list[dict[str, Any]]:
        return list(self.history)[-limit:]

    @staticmethod
    def _ratio(value: float, lower: float, upper: float) -> float:
        return max(0.0, lower - value, value - upper) / max(.1, upper - lower)

    def _calculate_health(self, telemetry: dict[str, Any], prediction: dict[str, Any]) -> tuple[dict[str, float], dict[str, Any]]:
        temp = self._ratio(telemetry["cylinder_temperature"], 118, 168)
        exhaust = self._ratio(telemetry["exhaust_temperature"], 390, 475)
        oil_pressure = max(0, 3.5 - telemetry["oil_pressure"]) / 2.5
        oil_temp = self._ratio(telemetry["oil_temperature"], 68, 103)
        vibration = max(0, telemetry["vibration"] - 4.5) / 4.5
        fuel = self._ratio(telemetry["fuel_flow"], 12, 21) + self._ratio(telemetry["fuel_pressure"], 3.5, 4.8)
        anomaly = prediction["anomaly_score"] / 100
        components = {
            "cooling_system": 100 - min(88, temp*72 + oil_temp*26),
            "lubrication_system": 100 - min(92, oil_pressure*92 + oil_temp*26),
            "fuel_system": 100 - min(85, fuel*58),
            "combustion_system": 100 - min(80, temp*42 + exhaust*40),
            "mechanical_integrity": 100 - min(92, vibration*78 + oil_pressure*20),
            "sensor_subsystem": 100 - min(80, anomaly*26 + (40 if self.simulator.active_fault == "sensor_anomaly" else 0)),
        }
        components = {key: round(max(4, value), 1) for key, value in components.items()}
        mean_components = sum(components.values()) / len(components)
        model_penalty = 0 if prediction["predicted_fault"] == "normal" else prediction["confidence"] * .085
        base_age_penalty = min(8, telemetry["engine_hours"] / 100)
        overall = max(3, min(100, mean_components - base_age_penalty - anomaly*7 - model_penalty))
        overall = round(overall, 1)
        if overall >= 90: state = "HEALTHY"
        elif overall >= 75: state = "WATCH"
        elif overall >= 50: state = "DEGRADED"
        elif overall >= 25: state = "CRITICAL"
        else: state = "SEVERE"
        degradation_rate = round(max(0, 100 - overall) / max(1, self.simulator.elapsed_seconds / 60 + 1), 2)
        return components, {"overall": overall, "state": state, "degradation_rate": degradation_rate, "thresholds": {"healthy": 90, "watch": 75, "degraded": 50, "critical": 25}}

    @staticmethod
    def _calculate_rul(health: dict[str, Any], engine_hours: float) -> int:
        # An explicit simulated indicator: health trajectory and accumulated hours are the inputs.
        return max(24, int(1000 * (health["overall"] / 100) ** 1.8 - engine_hours * .5))

    @staticmethod
    def _mission(health: dict[str, Any], anomaly_score: float) -> dict[str, Any]:
        h = health["overall"] / 100
        anomaly = anomaly_score / 100
        phase_rows = []
        for name, load, duration in PHASES:
            risk = min(.97, (1-h) * (.48 + load/180) + anomaly * .055)
            contribution = round(100 * (1-risk), 1)
            phase_rows.append({"phase": name, "engine_load": load, "expected_duration_min": duration, "engine_health": health["overall"], "risk": "HIGH" if risk>.42 else "MODERATE" if risk>.18 else "LOW", "reliability_contribution": contribution})
        reliability = round(sum(row["reliability_contribution"] * row["expected_duration_min"] for row in phase_rows) / sum(row["expected_duration_min"] for row in phase_rows), 1)
        return {"reliability_score": reliability, "mission_risk": "HIGH" if reliability < 55 else "MODERATE" if reliability < 78 else "LOW", "engine_failure_risk": round(100-reliability, 1), "mission_completion_probability": reliability, "phases": phase_rows, "method": "Load-weighted health-risk model (synthetic demonstrator)."}

    @staticmethod
    def _maintenance(prediction: dict[str, Any], components: dict[str, float], health: dict[str, Any]) -> dict[str, Any]:
        fault = prediction["predicted_fault"]
        if health["overall"] < 50:
            priority = "HIGH"; action = "Schedule condition review before the next simulated mission."
        elif fault != "normal" or prediction["anomaly_score"] >= 35:
            priority = "MEDIUM"; action = "Inspect the indicated subsystem before the next simulated mission."
        else:
            priority = "ROUTINE"; action = "Continue health monitoring under the configured simulated mission profile."
        mapping = {
            "cooling_degradation": ("Inspect cooling-system condition", "Cylinder and oil temperature trend above expected synthetic range."),
            "overheating": ("Review thermal-management condition", "Elevated cylinder/exhaust temperature detected."),
            "low_oil_pressure": ("Review lubrication-system condition", "Oil pressure is below the expected monitoring range."),
            "excessive_vibration": ("Review mechanical-condition indicators", "Vibration trend exceeds the monitoring threshold."),
            "abnormal_fuel_flow": ("Review fuel-system condition", "Fuel-flow and pressure deviation detected."),
            "sensor_anomaly": ("Validate sensor data quality", "Telemetry is inconsistent with the learned normal baseline."),
            "progressive_degradation": ("Perform integrated condition review", "Multiple component-health indicators are degrading."),
            "normal": ("No immediate action required", "All tracked synthetic health indicators remain within expected ranges."),
        }
        title, reason = mapping[fault]
        weakest = min(components, key=components.get).replace("_", " ").title()
        return {"priority": priority, "title": title, "reason": reason, "recommended_action": action, "weakest_subsystem": weakest, "scope_note": "High-level monitoring guidance only; not an operational maintenance procedure."}

    def _generate_alerts(self, twin: dict[str, Any]) -> None:
        tel, pred, health, mission = twin["telemetry"], twin["prediction"], twin["health"], twin["mission"]
        if tel["cylinder_temperature"] > 168:
            self._alert("WARNING" if tel["cylinder_temperature"] < 185 else "HIGH", "Cylinder temperature trending above normal operating range.", "temperature", f"Current synthetic value: {tel['cylinder_temperature']} °C")
        if tel["oil_pressure"] < 3.5:
            self._alert("HIGH", "Oil pressure below expected monitoring range.", "oil", f"Current synthetic value: {tel['oil_pressure']} bar")
        if tel["vibration"] > 4.5:
            self._alert("HIGH", "Abnormal vibration detected.", "vibration", f"Current synthetic value: {tel['vibration']} mm/s")
        if pred["anomaly_score"] >= 35:
            self._alert("WARNING", "Anomaly detector identified deviation from the learned baseline.", "anomaly", f"Anomaly score: {pred['anomaly_score']}/100")
        if pred["predicted_fault"] != "normal" and pred["confidence"] >= 55:
            self._alert("HIGH" if pred["confidence"] >= 75 else "WARNING", f"Possible {pred['predicted_fault_label']} detected.", "prediction", f"Model confidence: {pred['confidence']}%")
        if mission["reliability_score"] < 78:
            self._alert("HIGH" if mission["reliability_score"] < 55 else "WARNING", "Mission reliability reduced due to engine health degradation.", "mission", f"Mission reliability: {mission['reliability_score']}%")

    def _alert(self, severity: str, message: str, key: str, details: str) -> None:
        now = time.monotonic()
        if now - self.last_alert_at.get(key, -100) < 8:
            return
        self.last_alert_at[key] = now
        item = {"id": f"live-{int(now * 1000)}", "timestamp": self.current.get("updated_at", ""), "severity": severity, "message": message, "details": details, "acknowledged": False}
        self.alerts.appendleft(item)
        self.database.event("alerts", {"timestamp": item["timestamp"], "engine_id": self.engine_id, "severity": severity, "message": message, "details": details, "acknowledged": 0})
