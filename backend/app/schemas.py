from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field

FaultName = Literal[
    "normal", "overheating", "low_oil_pressure", "excessive_vibration",
    "abnormal_fuel_flow", "cooling_degradation", "sensor_anomaly",
    "progressive_degradation",
]


class SimulationSettings(BaseModel):
    speed: int = Field(default=1, ge=1, le=10)
    throttle: float = Field(default=62, ge=15, le=100)
    load: float = Field(default=58, ge=10, le=100)
    altitude: float = Field(default=1800, ge=0, le=10000)
    ambient_temperature: float = Field(default=21, ge=-30, le=55)


class FaultRequest(BaseModel):
    fault: FaultName


class FleetSelection(BaseModel):
    engine_id: str = Field(min_length=1, max_length=80)


class FleetControl(BaseModel):
    action: Literal["start", "pause", "reset"]


class UAVControl(BaseModel):
    action: Literal["start", "pause", "reset", "coastal-survey", "mountain-patrol", "training-circuit"]


class AssistantRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class CSVAnalysisRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=128)
    csv_text: str = Field(min_length=30, max_length=2_000_000)


class AlertAction(BaseModel):
    acknowledged: bool = True
