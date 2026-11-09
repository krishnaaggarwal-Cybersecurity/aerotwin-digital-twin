"""Correlated, explicitly synthetic telemetry for a generic aero piston engine."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import math
import random
from typing import Any

from .config import ENGINE_ID


FAULT_LABELS = {
    "normal": "Normal",
    "overheating": "Overheating",
    "low_oil_pressure": "Lubrication Fault",
    "excessive_vibration": "Vibration / Mechanical Fault",
    "abnormal_fuel_flow": "Fuel-System Fault",
    "cooling_degradation": "Cooling System Degradation",
    "sensor_anomaly": "Sensor Anomaly",
    "progressive_degradation": "Progressive Engine Degradation",
}

# Synthetic seconds until a fault reaches maximum severity. Kept in one place so
# the simulator can start a visibly meaningful—but still progressive—scenario.
FAULT_RAMP_SECONDS = {
    "overheating": 22,
    "low_oil_pressure": 19,
    "excessive_vibration": 18,
    "abnormal_fuel_flow": 24,
    "cooling_degradation": 32,
    "sensor_anomaly": 8,
    "progressive_degradation": 44,
}


@dataclass
class EngineSimulator:
    """A responsive demonstrator, not a certified or physically exact engine model."""

    seed: int = 26054
    engine_id: str = ENGINE_ID
    throttle: float = 62.0
    load: float = 58.0
    altitude: float = 1800.0
    ambient_temperature: float = 21.0
    speed: int = 1
    active_fault: str = "normal"
    fault_age: float = 0.0
    elapsed_seconds: float = 0.0
    engine_hours: float = 312.4
    _rng: random.Random = field(init=False, repr=False)
    _phase: float = 0.0

    def __post_init__(self) -> None:
        self._rng = random.Random(self.seed)

    def reset(self) -> None:
        self.__init__(seed=self.seed, engine_id=self.engine_id)

    def set_fault(self, fault: str, initial_progress: float = 0.0) -> None:
        if fault not in FAULT_LABELS:
            raise ValueError(f"Unknown synthetic fault scenario: {fault}")
        self.active_fault = fault
        if fault == "normal":
            self.fault_age = 0.0
            return
        # Begin at a modest, already observable condition and continue ramping.
        self.fault_age = max(0.0, min(1.0, initial_progress)) * FAULT_RAMP_SECONDS[fault]

    def update_settings(self, settings: dict[str, Any]) -> None:
        for key in ("throttle", "load", "altitude", "ambient_temperature", "speed"):
            if key in settings:
                setattr(self, key, float(settings[key]) if key != "speed" else int(settings[key]))

    @property
    def severity(self) -> float:
        if self.active_fault == "normal":
            return 0.0
        # Synthetic seconds of engine time to near-maximum impact.
        return min(1.0, self.fault_age / FAULT_RAMP_SECONDS[self.active_fault])

    def step(self, real_seconds: float = 1.0) -> dict[str, float | str]:
        dt = real_seconds * self.speed
        self.elapsed_seconds += dt
        self.engine_hours += dt / 3600
        self.fault_age += dt if self.active_fault != "normal" else 0
        self._phase += dt * 0.13
        s = self.severity
        noise = lambda sigma: self._rng.gauss(0, sigma)
        cycle = math.sin(self._phase)
        altitude_factor = self.altitude / 1000
        thermal_load = self.load * 0.74 + self.throttle * 0.26

        rpm = 950 + self.throttle * 20.8 - altitude_factor * 18 + cycle * 25 + noise(12)
        manifold = 31 + self.throttle * 0.48 - altitude_factor * 0.62 + noise(0.28)
        celsius_base = self.ambient_temperature + 83 + thermal_load * 0.70 + altitude_factor * 0.8
        exhaust = self.ambient_temperature + 333 + thermal_load * 1.35 + cycle * 4 + noise(2.2)
        oil_temp = self.ambient_temperature + 49 + thermal_load * 0.47 + cycle * 1.2 + noise(0.7)
        oil_pressure = 4.85 - thermal_load * 0.010 - oil_temp * 0.007 + noise(0.07)
        fuel_flow = 10.0 + thermal_load * 0.115 + altitude_factor * 0.05 + noise(0.16)
        fuel_pressure = 4.3 - thermal_load * 0.004 + noise(0.05)
        vibration = 1.55 + thermal_load * 0.020 + abs(cycle) * 0.16 + noise(0.09)
        cooling_effectiveness = 100 - max(0, celsius_base - 144) * 0.9

        if self.active_fault == "overheating":
            celsius_base += 58 * s
            exhaust += 66 * s
            oil_temp += 22 * s
            cooling_effectiveness -= 35 * s
        elif self.active_fault == "low_oil_pressure":
            oil_pressure -= 2.15 * s
            oil_temp += 13 * s
            vibration += 1.55 * s
        elif self.active_fault == "excessive_vibration":
            vibration += 6.8 * s
            rpm += 55 * math.sin(self._phase * 2.6) * s
        elif self.active_fault == "abnormal_fuel_flow":
            fuel_flow += 5.0 * s
            fuel_pressure -= 1.12 * s
            exhaust += 32 * s
        elif self.active_fault == "cooling_degradation":
            celsius_base += 47 * s
            exhaust += 31 * s
            oil_temp += 17 * s
            cooling_effectiveness -= 48 * s
            fuel_flow += 1.05 * s
        elif self.active_fault == "sensor_anomaly":
            # Fault is intentionally a sensor deviation; physical state stays near baseline.
            celsius_base += 42 * s * (1 if int(self.elapsed_seconds) % 3 else -0.35)
        elif self.active_fault == "progressive_degradation":
            celsius_base += 35 * s
            oil_temp += 14 * s
            oil_pressure -= 1.15 * s
            vibration += 3.0 * s
            fuel_flow += 2.2 * s
            cooling_effectiveness -= 30 * s

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "engine_id": self.engine_id,
            "rpm": round(max(600, rpm), 1),
            "throttle": round(self.throttle, 1),
            "load": round(self.load, 1),
            "oil_pressure": round(max(0.2, oil_pressure), 2),
            "oil_temperature": round(oil_temp, 1),
            "cylinder_temperature": round(celsius_base, 1),
            "exhaust_temperature": round(exhaust, 1),
            "manifold_pressure": round(max(10, manifold), 2),
            "fuel_flow": round(max(0.2, fuel_flow), 2),
            "fuel_pressure": round(max(0.2, fuel_pressure), 2),
            "vibration": round(max(0.1, vibration), 2),
            "ambient_temperature": round(self.ambient_temperature, 1),
            "altitude": round(self.altitude, 1),
            "airspeed": round(82 + self.throttle * 0.72 - altitude_factor * 0.8 + noise(1.2), 1),
            "engine_hours": round(self.engine_hours, 2),
            "cooling_effectiveness": round(max(0, cooling_effectiveness), 1),
            "synthetic_fault_scenario": self.active_fault,
            "fault_progress": round(s * 100, 1),
        }
