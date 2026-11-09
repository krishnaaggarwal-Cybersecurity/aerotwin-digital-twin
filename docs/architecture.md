# Technical architecture

## Design principles

AeroTwin is local-first, laptop runnable, synthetic by design, and auditable. The system chooses a 2D engineering schematic rather than a dependency-heavy 3D CAD representation so live monitoring and fault demonstrations remain dependable on normal SIH demo hardware.

## Runtime flow

1. Each `EngineSimulator` creates correlated synthetic telemetry for an isolated virtual aircraft from throttle, load, altitude, ambient temperature, engine time and an optional fault ramp.
2. `DigitalTwin` accepts each telemetry point and updates its virtual engine identity, state, component health, overall health, simulated RUL, maintenance recommendation and mission result.
3. `InferenceService` builds the ML feature vector, invokes the Isolation Forest and Random Forest, and derives explainable signal deviations.
4. `DigitalTwin` emits dynamic alerts and persists bounded telemetry/event records to SQLite.
5. A separate `VirtualUAV` view derives a schematic route state from the selected engine telemetry; its controls never address hardware.
6. FastAPI exposes fleet, CSV evidence analysis and assistant endpoints, REST snapshots, and full snapshots over `/ws/telemetry`.
7. React retains a bounded visual history and refreshes cards, charts and gauges without a browser refresh.

## Components

| Component | Responsibility |
| --- | --- |
| `backend/app/simulation.py` | Generic correlated engine / fault telemetry simulation |
| `backend/app/digital_twin.py` | Evolving virtual asset state and engineering metrics |
| `backend/app/ml.py` | Synthetic data, training, local inference and explanations |
| `backend/app/database.py` | SQLite schema and persistence layer |
| `backend/app/telemetry_analysis.py` | Uploaded CSV validation, robust baselines and first-detection report |
| `backend/app/virtual_uav.py` | Non-operational route visualization linked to an engine telemetry stream |
| `backend/app/assistant.py` | Server-side optional model API and local evidence-only fallback |
| `backend/app/main.py` | FastAPI REST API, lifecycle and WebSocket stream |
| `frontend/src/App.tsx` | Fleet dashboard, UAV simulation, data lab, assistant and engine views |

## Data lifecycle and bounds

The backend constrains its in-memory telemetry to `MAX_HISTORY` (default 900). The frontend keeps the last 180 live snapshots. SQLite is written at a controlled cadence rather than on every WebSocket send. This prevents indefinite memory growth while leaving enough data to demonstrate history and charts.

## Security and safety

Inputs use Pydantic bounds and fault names are a fixed allow-list. No external command is derived from dashboard input. There are no credentials or cloud dependencies. The fleet, route visualization and engine telemetry are synthetic. Uploaded CSV analysis uses explicit thresholds and an upload-derived baseline, not a validated engine model. An optional AI provider receives the current snapshot when configured. The platform has no interface to hardware, flight control or weapons systems.
