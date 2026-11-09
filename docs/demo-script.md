# SIH judge demonstration script (7–9 minutes)

## 1. Problem and solution — 0:00–0:40

**Show:** Landing page.

**Say:** “AeroTwin addresses the engine-health visibility gap for a generic aero piston engine used in a MALE UAV simulation. Instead of isolated telemetry dashboards, it connects real-time monitoring, a continuously updating Digital Twin, AI fault prediction, simulated RUL, predictive maintenance and mission reliability in one local software platform. All values today are synthetic; this is a research and monitoring demonstrator, not a real aircraft system.”

Point to the three hero statements: live telemetry, AI fault classification and RUL condition indicator.

## 2. Healthy Digital Twin — 0:40–1:40

**Show:** Dashboard, then Digital Twin.

**Say:** “We begin in Demo Mode with a healthy simulated engine. The status is live, and the virtual engine has an initial health near 97 percent. Notice that RPM, temperature, pressure, fuel flow and vibration are all generated as related variables; they are not unrelated random values. The Digital Twin page shows the evolving virtual identity, flight/environment state, operating hours and virtual component health.”

Hover through the engine visualization indicators and component bars.

## 3. Telemetry and mission baseline — 1:40–2:25

**Show:** Telemetry, then Mission Reliability.

**Say:** “The telemetry console receives the WebSocket stream without a page refresh. At normal operation, thermal and lubrication values stay inside their expected synthetic envelopes. The mission view translates the current engine condition into a transparent, load-weighted simulated reliability calculation across takeoff, climb, cruise, surveillance, loiter, return and landing. This is reliability simulation only; it is not a flight or combat planner.”

## 4. Progressive cooling degradation — 2:25–4:25

**Show:** Simulation. Set simulation speed to 5× or 10×, apply settings, click **Cooling degradation**.

**Say:** “For the key scenario, I inject progressive cooling degradation. The fault does not instantly collapse the engine health; it has a controlled ramp. As it develops, cylinder temperature, exhaust temperature and oil temperature rise together; cooling effectiveness declines; the health model and mission model react to the actual emitted telemetry.”

Return to **Dashboard**. Wait for live alerts and health trend.

**Say:** “The anomaly detector moves away from its normal-operation baseline. The health index begins declining, estimated simulated RUL falls, and alerts emerge with severity and timestamps.”

## 5. Explainable AI — 4:25–5:20

**Show:** Fault Prediction.

**Say:** “The classification is a saved local Random Forest trained by this project using a generated synthetic dataset. The anomaly score is independently calculated by Isolation Forest. The key differentiator is explainability: instead of merely displaying a label, AeroTwin shows the current cylinder temperature or other contributing signal, its expected range, deviation tier and risk contribution. The metrics are clearly labeled synthetic-data evaluation; we are not claiming field certification.”

## 6. Reliability and recommendation — 5:20–6:15

**Show:** Health, Mission Reliability, then Maintenance.

**Say:** “The same fault impacts component-level cooling health and the overall condition index. The mission score drops because each mission phase has an explicit load factor. AeroTwin then generates high-level condition guidance: inspect the cooling-system condition before the next *simulated* mission. It does not give unapproved mechanical procedures or autonomous actions.”

## 7. Second fault narrative — 6:15–7:15

**Show:** Simulation, click **Reset**, then **Low oil pressure**. Set 10× speed if useful.

**Say:** “After reset, we can immediately demonstrate a different risk pathway. Low oil pressure now changes lubrication and mechanical condition, produces a different signal explanation and pushes the classifier toward a lubrication-related fault. This validates that the narrative is data and model driven, not a fixed cooling demo.”

## 8. Engineering credibility and close — 7:15–8:15

**Show:** History, Architecture, Video.

**Say:** “Telemetry and events persist in local SQLite for historical analysis. Our architecture is local-first: telemetry simulator, digital twin, feature engineering, anomaly detection, fault classifier, health/RUL, mission reliability and engineer dashboard. FastAPI provides OpenAPI documentation and WebSockets; React provides the real-time UI. The video page is ready for our recorded demonstration simply by placing the project MP4 in the documented location.”

Close on the scope note: “AeroTwin is a safe, hardware-free Digital Twin research demonstrator that makes real-time condition intelligence tangible on a laptop.”

## Reset checklist before judges arrive

1. Run `./start.sh` (or `start.bat`) and wait for both local URLs.
2. Open `http://localhost:5173`, navigate to Dashboard and ensure `LIVE` is visible.
3. Press **Reset** on the Simulation page so the engine begins healthy.
4. Keep the dashboard in the browser and API docs in a spare tab.
5. If using a recording, place `project-demo.mp4` inside `frontend/public/demo/` before starting Vite.
