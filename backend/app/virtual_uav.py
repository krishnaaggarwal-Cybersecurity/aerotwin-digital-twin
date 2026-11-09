from __future__ import annotations

from typing import Any


class VirtualUAV:
    """Illustrative flight-state layer linked to an engine twin; never controls hardware."""

    ROUTES = {
        "coastal-survey": {"name": "Coastal survey", "duration_seconds": 540},
        "mountain-patrol": {"name": "Mountain patrol", "duration_seconds": 720},
        "training-circuit": {"name": "Training circuit", "duration_seconds": 360},
    }

    def __init__(self, engine_id: str) -> None:
        self.engine_id = engine_id
        self.route_id = "coastal-survey"
        self.elapsed_seconds = 0.0
        self.running = True
        self.telemetry: dict[str, Any] = {}

    def step(self, telemetry: dict[str, Any], elapsed_seconds: float) -> None:
        self.telemetry = telemetry
        if self.running:
            self.elapsed_seconds += elapsed_seconds

    def control(self, action: str) -> dict[str, Any]:
        if action == "start":
            self.running = True
        elif action == "pause":
            self.running = False
        elif action == "reset":
            self.elapsed_seconds = 0.0
            self.running = True
        elif action in self.ROUTES:
            self.route_id = action
            self.elapsed_seconds = 0.0
        else:
            raise ValueError("Unknown virtual UAV control.")
        return self.snapshot()

    def snapshot(self) -> dict[str, Any]:
        route = self.ROUTES[self.route_id]
        progress = (self.elapsed_seconds % route["duration_seconds"]) / route["duration_seconds"]
        return {
            "uav_id": f"VT-{self.engine_id}",
            "engine_id": self.engine_id,
            "route_id": self.route_id,
            "route_name": route["name"],
            "progress_pct": round(progress * 100, 1),
            "flight_state": "EN ROUTE" if self.running else "PAUSED",
            "altitude_m": round(float(self.telemetry.get("altitude", 1800))),
            "airspeed_kt": round(float(self.telemetry.get("airspeed", 120))),
            "heading_deg": round((progress * 360) % 360),
            "engine_rpm": round(float(self.telemetry.get("rpm", 0))),
            "engine_health": self.telemetry.get("health_index", 0),
            "simulated": True,
            "control_scope": "Virtual visualization only; no radio, autopilot, or physical vehicle interface.",
        }
