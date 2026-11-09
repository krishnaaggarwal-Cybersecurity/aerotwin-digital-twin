from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, suppress
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .assistant import answer as answer_assistant, assistant_status
from .config import ENGINE_ID, FLEET_ENGINE_IDS, ROOT, TELEMETRY_INTERVAL
from .database import Database
from .digital_twin import DigitalTwin
from .ml import InferenceService, train_models
from .schemas import AssistantRequest, CSVAnalysisRequest, FaultRequest, FleetControl, FleetSelection, SimulationSettings, UAVControl
from .telemetry_analysis import analyze_csv
from .virtual_uav import VirtualUAV


class Runtime:
    def __init__(self) -> None:
        self.db = Database()
        self.twins: dict[str, DigitalTwin] = {}
        self.uavs: dict[str, VirtualUAV] = {}
        self.selected_engine_id = ENGINE_ID
        self.tasks: list[asyncio.Task] = []

    async def startup(self) -> None:
        self.selected_engine_id = ENGINE_ID
        for engine_id in FLEET_ENGINE_IDS:
            self.db.initialize(engine_id)
        inference = InferenceService()
        self.twins = {}
        for index, engine_id in enumerate(FLEET_ENGINE_IDS):
            twin = DigitalTwin(self.db, inference, engine_id, seed=26054 + index * 17)
            if index:
                twin.simulator.update_settings({
                    "throttle": 62 + index * 8,
                    "load": 58 + index * 8,
                    "altitude": 1800 + index * 1000,
                })
                twin.step()
            self.twins[engine_id] = twin
        self.uavs = {engine_id: VirtualUAV(engine_id) for engine_id in FLEET_ENGINE_IDS}
        for engine_id, twin in self.twins.items():
            state = twin.snapshot()
            self.uavs[engine_id].step(
                {**state["telemetry"], "health_index": state["health"]["overall"]},
                0,
            )
        self.tasks = [
            asyncio.create_task(self._telemetry_loop(engine_id, twin))
            for engine_id, twin in self.twins.items()
        ]

    async def shutdown(self) -> None:
        for task in self.tasks:
            task.cancel()
        for task in self.tasks:
            with suppress(asyncio.CancelledError):
                await task

    async def _telemetry_loop(self, engine_id: str, twin: DigitalTwin) -> None:
        while True:
            if twin.running:
                state = twin.step()
                self.uavs[engine_id].step(
                    {**state["telemetry"], "health_index": state["health"]["overall"]},
                    TELEMETRY_INTERVAL,
                )
            await asyncio.sleep(max(.2, TELEMETRY_INTERVAL / twin.simulator.speed))

    def get(self, engine_id: str | None = None) -> DigitalTwin:
        selected = engine_id or self.selected_engine_id
        if selected not in self.twins:
            raise RuntimeError("Digital twin has not initialized")
        return self.twins[selected]

    def fleet(self) -> list[dict[str, Any]]:
        vehicles = []
        for engine_id, twin in self.twins.items():
            state = twin.snapshot()
            vehicles.append({
                "engine_id": engine_id,
                "selected": engine_id == self.selected_engine_id,
                "operating_state": state["operating_state"],
                "health": state["health"],
                "prediction": state["prediction"],
                "telemetry": state["telemetry"],
                "settings": state["settings"],
                "updated_at": state["updated_at"],
            })
        return vehicles


runtime = Runtime()


@asynccontextmanager
async def lifespan(_: FastAPI):
    await runtime.startup()
    yield
    await runtime.shutdown()


app = FastAPI(
    title="AeroTwin Digital Twin API",
    version="1.0.0",
    description="Synthetic, local-only generic aero piston engine health-monitoring demonstrator.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = ROOT / "frontend" / "dist"


@app.get("/", response_model=None)
def root() -> Any:
    index = FRONTEND_DIR / "index.html"
    if index.is_file():
        return FileResponse(index)
    return {"service": "AeroTwin Digital Twin API", "mode": "synthetic demo", "docs": "/docs"}


@app.get("/api/status")
def status() -> dict[str, Any]:
    twin = runtime.get()
    return {"live": twin.running, "mode": "DEMO MODE", "engine_id": twin.engine_id, "simulated": True, "settings": twin.settings()}


@app.get("/api/fleet")
def fleet() -> list[dict[str, Any]]:
    return runtime.fleet()


@app.post("/api/fleet/select")
def select_fleet_vehicle(request: FleetSelection) -> dict[str, Any]:
    if request.engine_id not in runtime.twins:
        raise HTTPException(404, "UAV not found in the simulated fleet")
    runtime.selected_engine_id = request.engine_id
    return runtime.get().snapshot()


@app.post("/api/fleet/{engine_id}/control")
def control_fleet_vehicle(engine_id: str, request: FleetControl) -> dict[str, Any]:
    try:
        twin = runtime.get(engine_id)
    except RuntimeError as exc:
        raise HTTPException(404, "UAV not found in the simulated fleet") from exc
    if request.action == "start":
        twin.running = True
        return twin.step()
    if request.action == "pause":
        twin.running = False
        return twin.snapshot()
    twin.reset()
    return twin.snapshot()


@app.post("/api/fleet/{engine_id}/fault")
def inject_fleet_fault(engine_id: str, request: FaultRequest) -> dict[str, Any]:
    try:
        return runtime.get(engine_id).set_fault(request.fault)
    except RuntimeError as exc:
        raise HTTPException(404, "UAV not found in the simulated fleet") from exc


@app.get("/api/health")
def health() -> dict[str, Any]:
    return runtime.get().snapshot()["health"]


@app.get("/api/engine")
def engine() -> dict[str, Any]:
    snapshot = runtime.get().snapshot()
    return {key: snapshot[key] for key in ("engine_id", "operating_state", "simulated", "updated_at", "settings", "component_health")}


@app.get("/api/telemetry/latest")
def telemetry_latest() -> dict[str, Any]:
    return runtime.get().snapshot()["telemetry"]


@app.get("/api/telemetry/history")
def telemetry_history(limit: int = 300) -> list[dict[str, Any]]:
    if not 1 <= limit <= 900:
        raise HTTPException(422, "limit must be between 1 and 900")
    return [entry["telemetry"] for entry in runtime.get().history_data(limit)]


@app.get("/api/history")
def history(limit: int = 300) -> list[dict[str, Any]]:
    return runtime.get().history_data(max(1, min(limit, 900)))


@app.get("/api/faults")
def faults() -> dict[str, Any]:
    snapshot = runtime.get().snapshot()
    return {"active_scenario": snapshot["settings"]["active_fault"], "fault_progress": snapshot["settings"]["fault_progress"], "prediction": snapshot["prediction"]}


@app.get("/api/prediction")
def prediction() -> dict[str, Any]:
    return runtime.get().snapshot()["prediction"]


@app.get("/api/mission")
def mission() -> dict[str, Any]:
    return runtime.get().snapshot()["mission"]


@app.get("/api/maintenance")
def maintenance() -> dict[str, Any]:
    return runtime.get().snapshot()["maintenance"]


@app.get("/api/alerts")
def alerts() -> dict[str, Any]:
    return {"live": runtime.get().snapshot()["alerts"], "persisted": runtime.db.alerts()}


@app.post("/api/alerts/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: str) -> dict[str, Any]:
    twin = runtime.get()
    for alert in twin.alerts:
        if alert["id"] == alert_id:
            alert["acknowledged"] = True
            return {"acknowledged": True, "id": alert_id}
    if alert_id.isdigit() and runtime.db.acknowledge_alert(int(alert_id)):
        return {"acknowledged": True, "id": alert_id}
    raise HTTPException(404, "Alert not found")


@app.post("/api/simulation/start")
def start_simulation() -> dict[str, Any]:
    runtime.get().running = True
    return runtime.get().snapshot()


@app.post("/api/simulation/pause")
def pause_simulation() -> dict[str, Any]:
    runtime.get().running = False
    return runtime.get().snapshot()


@app.post("/api/simulation/reset")
def reset_simulation() -> dict[str, Any]:
    runtime.get().reset()
    return runtime.get().snapshot()


@app.post("/api/simulation/fault")
def inject_fault(request: FaultRequest) -> dict[str, Any]:
    twin = runtime.get()
    return twin.set_fault(request.fault)


@app.post("/api/simulation/settings")
def set_simulation_settings(settings: SimulationSettings) -> dict[str, Any]:
    twin = runtime.get()
    return twin.update_settings(settings.model_dump())


@app.post("/api/models/retrain")
def retrain() -> dict[str, Any]:
    # Safe local convenience endpoint for the synthetic-data pipeline.
    metrics = train_models(force=True)
    inference = InferenceService()
    for twin in runtime.twins.values():
        twin.inference = inference
        twin.step()
    return {"message": "Models retrained using synthetic data", "metrics": metrics}


@app.get("/api/uav")
def virtual_uav() -> dict[str, Any]:
    return runtime.uavs[runtime.selected_engine_id].snapshot()


@app.post("/api/uav/control")
def control_virtual_uav(request: UAVControl) -> dict[str, Any]:
    return runtime.uavs[runtime.selected_engine_id].control(request.action)


@app.post("/api/telemetry/analyze-csv")
def analyze_telemetry(request: CSVAnalysisRequest) -> dict[str, Any]:
    try:
        return analyze_csv(request.csv_text, request.filename)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/api/assistant/status")
def assistant_configuration() -> dict[str, Any]:
    return assistant_status()


@app.post("/api/assistant/chat")
async def chat_with_twin(request: AssistantRequest) -> dict[str, Any]:
    twin = runtime.get().snapshot()
    try:
        result = await answer_assistant(request.message, twin)
    except RuntimeError as exc:
        raise HTTPException(502, str(exc)) from exc
    return {**result, "engine_id": twin["engine_id"], "data_timestamp": twin["updated_at"]}


@app.websocket("/ws/telemetry")
async def telemetry_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            await websocket.send_json(runtime.get().snapshot())
            await asyncio.sleep(max(.25, TELEMETRY_INTERVAL / runtime.get().simulator.speed))
    except WebSocketDisconnect:
        return


@app.get("/{path:path}", include_in_schema=False)
def frontend(path: str) -> FileResponse:
    """Serve the compiled React app and preserve client-side navigation."""
    requested = FRONTEND_DIR / path
    if path and requested.is_file():
        return FileResponse(requested)
    return FileResponse(FRONTEND_DIR / "index.html")
