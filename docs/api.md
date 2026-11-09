# API reference

The interactive source of truth is the FastAPI OpenAPI UI at `http://localhost:8000/docs`.
When the production frontend build exists, `GET /` serves the React app; without a build, it returns the API service description.

## Read endpoints

- `GET /api/status` — Demo Mode state and settings.
- `GET /api/fleet` — status, health, fault risk and telemetry for each simulated aircraft.
- `GET /api/uav` — virtual flight state linked to the selected engine twin.
- `GET /api/assistant/status` — assistant provider readiness (never returns a key).
- `GET /api/health` — overall health, state and configured interpretation thresholds.
- `GET /api/engine` — engine identity, operating state, settings and component health.
- `GET /api/telemetry/latest` — latest raw synthetic telemetry.
- `GET /api/telemetry/history?limit=300` — bounded telemetry series (1–900).
- `GET /api/history?limit=300` — full in-memory Digital Twin snapshots.
- `GET /api/faults`, `/api/prediction`, `/api/mission`, `/api/maintenance`, `/api/alerts` — named dashboard domains.

## Control endpoints

- `POST /api/simulation/start`, `/api/simulation/pause`, `/api/simulation/reset`
- `POST /api/simulation/fault` with `{ "fault": "cooling_degradation" }`
- `POST /api/simulation/settings` with all validated settings: `speed` (1–10), `throttle` (15–100), `load` (10–100), `altitude` (0–10000), `ambient_temperature` (-30–55).
- `POST /api/fleet/select` with `{ "engine_id": "APT-MALE-SIM-02" }` to select the vehicle used by the main dashboard.
- `POST /api/fleet/{engine_id}/control` with `{ "action": "pause" }` (`start`, `pause`, or `reset`); `/api/fleet/{engine_id}/fault` accepts the same synthetic fault names as the single-twin control.
- `POST /api/uav/control` with `{ "action": "pause" }`, `start`, `reset`, or one of `coastal-survey`, `mountain-patrol`, `training-circuit`. These controls affect only the virtual visualization.
- `POST /api/telemetry/analyze-csv` with `{ "filename": "run.csv", "csv_text": "timestamp,cylinder_temperature,...\\n..." }` to analyze up to 5,000 measured rows. At least 8 rows and one supported sensor column are required.
- `POST /api/assistant/chat` with `{ "message": "Summarize engine health" }`. The backend attaches the selected twin's latest full snapshot on every request.
- `POST /api/alerts/{alert_id}/acknowledge`
- `POST /api/models/retrain` regenerates only local synthetic model artifacts.

## Uploaded telemetry analysis

The CSV path checks configured sensor envelopes and persistent deviation from a robust baseline computed from the uploaded file. It reports the first sample where a configured failure signature is detected. It intentionally does not apply the synthetic-trained Random Forest to uploaded field data. Supported headers: `cylinder_temperature`, `exhaust_temperature`, `oil_pressure`, `oil_temperature`, `vibration`, `fuel_flow`, `fuel_pressure`, and `rpm`; timestamp is optional.

## Assistant privacy and configuration

Without `OPENAI_API_KEY`, chat uses a local evidence summary. With a key, the backend sends the prompt and selected twin snapshot to OpenAI using `OPENAI_MODEL`; configure the key only in the backend environment. No key is sent to the browser. Review your provider's data policy before sending telemetry.

## WebSocket

Connect to `ws://localhost:8000/ws/telemetry`. Each JSON message is a complete current Digital Twin snapshot including telemetry, health, components, prediction, RUL, mission, maintenance, settings and current live alerts. Clients should replace their current state rather than assume unbounded history.
