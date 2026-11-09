# AeroTwin

> AI-enabled real-time Digital Twin for health monitoring, fault prediction, and simulated mission reliability of a **generic aero piston engine** in a MALE UAV simulation.

**Smart India Hackathon · Problem Statement 26054**

AeroTwin is a local-first software research demonstrator. It generates correlated synthetic engine telemetry, evolves a virtual engine state continuously, detects anomalies, predicts fault classes with local ML models, estimates a simulated RUL indicator, and shows the resulting simulated mission reliability and high-level maintenance guidance.

**Live browser-only demo:** [Open AeroTwin on GitHub Pages](https://krishnaaggarwal-cybersecurity.github.io/aerotwin-digital-twin/). This static demo runs a clearly labeled synthetic simulation in the browser; it does not connect to a backend, real engine, or UAV. Run the full local stack for the FastAPI and optional AI-backed features.

> Safety boundary: this project has no physical engine/UAV interface and no weapons, targeting, engagement, flight-control, or autonomous decision functionality. Values, evaluations, and reliability outputs are synthetic and are not certified aerospace data.

## What it demonstrates

- Real-time synthetic telemetry via FastAPI WebSockets: RPM, throttle, load, thermal, lubrication, fuel, vibration, ambient, altitude, airspeed, and operating hours.
- A continuously evolving Digital Twin rather than a static record.
- Eight progressive fault-injection scenarios: normal, overheating, low oil pressure, excessive vibration, abnormal fuel flow, cooling degradation, sensor anomaly, and progressive degradation.
- Isolation Forest anomaly detection trained against synthetic normal operation.
- Random Forest fault classification trained using the project’s reproducible synthetic data generator.
- Explainable AI signal cards: current values, expected ranges, deviation level, and model-importance-weighted contribution.
- Multi-component health index, estimated remaining useful life (simulated), dynamic alerts, SQLite event history, and mission-phase reliability calculation.
- A responsive, mission-control-style interface with an engine dashboard, an isolated multi-UAV fleet, a linked virtual flight visualization, a CSV telemetry data lab, and a twin-aware AI assistant.
- An opt-in sound-alert toggle for newly raised warning and critical demo events, plus a crash-response drill that previews a simulated SOS brief without sending it.
- An optional server-side OpenAI-compatible assistant that receives the selected twin snapshot with each prompt, plus a local evidence summary when no API key is configured.
- First-detection reporting for uploaded CSV telemetry using configured sensor envelopes and a robust upload-derived baseline; uploaded data is not sent through the synthetic-trained classifier.

## Quick start

Prerequisites: Python **3.10+** and Node.js **18+** are recommended. The project was developed and verified with current Python and local dependencies; Node 18+ provides the smoothest Vite experience.

macOS / Linux:

```bash
chmod +x start.sh
./start.sh
```

Windows:

```bat
start.bat
```

Then open [http://localhost:5173](http://localhost:5173). The API documentation is at [http://localhost:8000/docs](http://localhost:8000/docs).

The backend automatically creates the SQLite schema and trains the local models if the saved model files are absent. Demo Mode starts with a healthy engine simulation; no external hardware or cloud account is needed.

## Manual setup

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
PYTHONPATH=backend .venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

In a second terminal:

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

On Windows, use `.venv\Scripts\python` and `.venv\Scripts\pip` in place of `.venv/bin/...`.

## Demo walkthrough

1. Open **Dashboard**; confirm the `LIVE` indicator and healthy baseline (~97 health).
2. Review live correlated telemetry and component health.
3. Open **Fleet** and inspect or select one of the isolated virtual engines.
4. Open **Virtual UAV** to see a separate route visualization linked to that engine's health and telemetry.
5. Open **Simulation** and select **Cooling degradation**.
6. Let the fault ramp progressively, or set simulation speed to 5× / 10×.
7. Observe cylinder/oil temperatures increase and cooling effectiveness fall.
8. Open **Fault Prediction** to show anomaly detection, the predicted cooling fault, probability distribution, and explainable signals.
9. Open **Health** and **Mission Reliability** to show health, simulated RUL and mission score decline.
10. Ask the **AI Assistant** to summarize the current evidence, or use **Data Lab** to analyze a CSV and find the first detection point.
11. Open **Maintenance** to show the high-level condition recommendation.
12. Use **Reset** to return to healthy operation, then inject **Low oil pressure** for a second narrative.

See [docs/demo-script.md](docs/demo-script.md) for a presentation-ready 5–10 minute script.

## Architecture

```text
Synthetic engine simulator
          ↓ WebSocket / REST telemetry
FastAPI ingestion + continuously updated Digital Twin
          ↓
Feature vector → Isolation Forest anomaly detector
               → Random Forest fault classifier
          ↓
Health index + component health + simulated RUL
          ↓
Mission reliability + alerts + maintenance recommendation
          ↓
React fleet + engineer dashboard + SQLite history
```

More detail: [docs/architecture.md](docs/architecture.md), [docs/ml.md](docs/ml.md).

## Project structure

```text
backend/app/           FastAPI API, simulation, Digital Twin, ML, SQLite layer
backend/data/          Generated dataset and local SQLite database
backend/models/        Saved joblib models and synthetic-data metrics
backend/tests/         Backend API, simulator, prediction and mission tests
frontend/src/          React fleet, virtual UAV, data lab, assistant and engine views
frontend/public/demo/  Drop project-demo.mp4 here to enable video playback
scripts/               Dataset generation and model training entry points
docs/                  Architecture, API, ML and SIH demo documentation
simulation/            Domain-oriented simulation folders for extension
```

## ML pipeline

Run these manually if you want to regenerate artifacts:

```bash
PYTHONPATH=backend .venv/bin/python scripts/generate_dataset.py
PYTHONPATH=backend .venv/bin/python scripts/train_models.py
```

The synthetic dataset includes varied operating conditions for normal operation, overheating, lubrication fault, vibration/mechanical fault, fuel-system fault, cooling degradation, sensor anomaly and progressive degradation. `train_models.py` performs a stratified train/test split, trains an Isolation Forest on normal data and a Random Forest classifier on all classes, saves both models under `backend/models/`, and prints **actual synthetic-data evaluation** accuracy. It also saves a full classification report and confusion matrix in `backend/models/training_metrics.json`.

## Health, RUL and mission methods

The health index is constructed from virtual cooling, lubrication, fuel, combustion, mechanical and sensor subsystem health. It penalizes measured deviations, anomaly evidence, classifier fault confidence, age in operating hours and degradation trend. The `Estimated RUL` calculation uses the current health index and operating hours. It is deliberately labeled simulated and is not a certified life prediction.

Mission reliability evaluates Takeoff, Climb, Cruise, Surveillance, Loiter, Return and Landing. Each phase uses the same twin health plus a load factor and anomaly adjustment; a duration-weighted mean produces the mission score. The formula is shown in the Mission view to make the demonstrator’s logic transparent.

## API and data

Key API endpoints:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health index and thresholds |
| `GET` | `/api/engine` | Twin identity and component state |
| `GET` | `/api/telemetry/latest` | Latest sensor record |
| `GET` | `/api/telemetry/history` | Bounded in-memory telemetry history |
| `GET` | `/api/prediction` | ML prediction, probabilities and explanations |
| `GET` | `/api/mission` | Mission score and phase breakdown |
| `GET` | `/api/alerts` | Live and persisted alerts |
| `POST` | `/api/simulation/start`, `/pause`, `/reset` | Simulation controls |
| `POST` | `/api/simulation/fault` | Inject a validated synthetic fault |
| `POST` | `/api/simulation/settings` | Update speed / environment controls |
| `GET` | `/api/fleet` | Live status for each simulated aircraft twin |
| `POST` | `/api/fleet/select` | Select the active twin used by the main dashboard |
| `POST` | `/api/fleet/{engine_id}/control`, `/fault` | Control one isolated synthetic vehicle |
| `GET`, `POST` | `/api/uav`, `/api/uav/control` | Read or control the selected virtual route visualization |
| `POST` | `/api/telemetry/analyze-csv` | Analyze uploaded CSV data and report first detection |
| `GET`, `POST` | `/api/assistant/status`, `/api/assistant/chat` | Check assistant setup and ask a twin-context question |
| `WS` | `/ws/telemetry` | Live full Digital Twin snapshots |

FastAPI supplies interactive OpenAPI docs at `/docs`. SQLite tables are `engines`, `telemetry`, `fault_events`, `predictions`, `missions`, `alerts`, and `maintenance_events`. Data stays on the local machine in `backend/data/aerotwin.db`.

## AI assistant and CSV data

The assistant works without a cloud account in question-aware local evidence mode, using the current selected-engine snapshot on each prompt. To enable generated OpenAI responses, copy `.env.example` to `.env` and set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` on the **backend**; restart the server. The key stays server-side, but the selected twin snapshot and your question are sent to OpenAI when enabled—review your data-handling requirements before using it with private telemetry. The GitHub Pages demo has no backend or hosted language-model connection, so it uses its browser-only evidence assistant instead.

The **Data Lab** accepts CSV files up to 2 MB / 5,000 rows, requires at least eight rows, and supports `cylinder_temperature`, `exhaust_temperature`, `oil_pressure`, `oil_temperature`, `vibration`, `fuel_flow`, `fuel_pressure`, and `rpm`. It reports the first configured range breach or persistent three-sample deviation from the upload's initial robust baseline. These thresholds are prototype settings, not validated real-engine limits. No real engine dataset is bundled; the shipped Random Forest classifier and Isolation Forest detector are trained on generated synthetic telemetry and are deliberately not applied to uploaded data. The assistant is not a separately trained language model; OpenAI generation is optional and requires a backend API key.

The **N-CMAPSS Research** page also exposes the original DS03-012 BiLSTM state and RUL models through the local FastAPI backend. On Windows, use Python 3.10, install the optional runtime using `python -m pip install -r backend/requirements.txt -r backend/requirements-ncmapss.txt`, then run `start-ncmapss.bat` and open `/ncmapss`. Upload a chronological CSV with the 18 feature columns listed by the page and at least 10 rows; the original scaler and both trained HDF5 models process its most recent 10 rows using NumPy. This path is separate from the generic piston-engine twin and is unavailable on the browser-only GitHub Pages demo. The full N-CMAPSS dataset is not included. Original model results are experimental and are not maintenance or airworthiness decisions.

## Video integration

The Project Video page opens on a narrated, captioned walkthrough covering the synthetic telemetry, digital twin, ML evidence, virtual fleet and aircraft, assistant, CSV analysis, and safety boundaries. The two shorter supplied clips are illustrative emergency-response and flight-HUD concepts; they are not connected prototype footage or evidence of real crash detection or SOS dispatch. The English narration captions can be toggled in the player.

The walkthrough uses screenshots captured from the current browser prototype, not illustrative replacement screens. To refresh it on Windows, start the static demo with `$env:VITE_STATIC_DEMO='true'; npm run dev -- --host 127.0.0.1 --port 5193`, then run `node scripts/capture_aerotwin_screens.mjs`, `powershell -ExecutionPolicy Bypass -File scripts/generate_aerotwin_narration.ps1`, and `python scripts/render_aerotwin_walkthrough.py`. The local capture requires Microsoft Edge; narration uses Microsoft David with paced SSML emphasis. Python packages `opencv-python`, `Pillow`, `numpy`, and `imageio-ffmpeg` are required. Temporary captures and narration stay under `scripts/walkthrough-work/`; the renderer writes only the MP4, English WebVTT captions, and poster under `frontend/public/demo/`.

## Tests and verification

```bash
PYTHONPATH=backend .venv/bin/pytest backend/tests -q
npm --prefix frontend test
npm --prefix frontend run build
```

Backend tests cover correlated telemetry, fault injection, health decline, mission reliability impact and API controls. The frontend test verifies basic landing-page rendering; the production build checks TypeScript and Vite integration.

## Docker (optional)

```bash
docker compose up --build
```

Open [http://localhost:8000](http://localhost:8000). Docker is optional; the local `start.sh` / `start.bat` path is the intended SIH demo path. The root Dockerfile builds the frontend and serves it from the FastAPI app; Docker Compose maps it to port 8000.

## Configuration and troubleshooting

Copy `.env.example` to `.env` for optional backend configuration; `OPENAI_API_KEY` and `OPENAI_MODEL` configure the assistant. The current implementation reads `TELEMETRY_INTERVAL` and `ENGINE_ID`; ports are supplied through the startup command. If the dashboard says disconnected, verify the backend at `http://localhost:8000/docs`. If a model artifact is corrupted or you want a fresh data split, remove `backend/models/*.joblib` and rerun the training script. If port 5173 or 8000 is occupied, stop the process or pass another Vite port and set `VITE_API_URL` for the frontend.

## Limitations and future work

The simulator is deliberately simplified and gives coherent synthetic behavior rather than certified engine physics. ML performance is synthetic-data evaluation, not a claim about operational accuracy. The virtual UAV routes are illustrations, not navigation or flight-control interfaces. CSV analysis is limited to configured prototype thresholds and robust baseline changes; it does not establish a real failure probability or airworthiness. The dashboard's crash-response drill is a UI-only preview: there is no real crash detection, GNSS position, verified rescue-center directory, or SOS dispatch integration, and the preview never contacts responders. A real emergency-response system would require validated crash-detection inputs, secure location and aircraft identity, an authoritative regional responder directory, an approved dispatch provider, operator confirmation/escalation, offline communications, and formal testing and regulatory review. The next research stage would use validated test-cell data, formal uncertainty quantification, physics-informed models, sensor fusion, traceable configuration management and an approved safety/airworthiness process.
