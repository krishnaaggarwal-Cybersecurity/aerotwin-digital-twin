from __future__ import annotations

import json
import os
from typing import Any

import httpx

AI_ENDPOINT = "https://api.openai.com/v1/chat/completions"

SYSTEM_PROMPT = (
    "You are AeroTwin's engineering monitoring assistant for a synthetic, non-operational "
    "digital-twin demonstrator. Every answer must be grounded only in the current telemetry, "
    "health, fault prediction, alerts, and mission data included with the user's question. "
    "Cite the relevant observed values and distinguish model confidence from certainty. "
    "If asked about real-world airworthiness, flight decisions, repairs, or missing data, "
    "state that this prototype cannot make that determination. Never invent readings, "
    "claim that synthetic model results are validated on real engines, or issue flight commands. "
    "Keep responses concise and explain uncertainty."
)


def assistant_status() -> dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
    return {"configured": bool(api_key), "provider": "OpenAI" if api_key else "local evidence mode", "model": model if api_key else "local-evidence"}


def _local_response(question: str, twin: dict[str, Any]) -> str:
    telemetry = twin.get("telemetry", {})
    health = twin.get("health", {})
    prediction = twin.get("prediction", {})
    mission = twin.get("mission", {})
    normalized = question.casefold()

    def mentions(*terms: str) -> bool:
        return any(term in normalized for term in terms)

    engine_id = twin.get("engine_id", "unknown")
    fault = prediction.get("predicted_fault_label", "no classification")
    confidence = prediction.get("confidence", "—")
    anomaly = prediction.get("anomaly_score", "—")
    if mentions("maintenance", "recommend", "action", "what should", "what do"):
        return (
            f"The prototype guidance for engine {engine_id} is: "
            f"{maintenance.get('recommended_action', 'Continue monitoring the current twin evidence.')} "
            f"The classifier reports {fault} at {confidence}% confidence. "
            "This is not maintenance authorization or a real-engine instruction."
        )
    if mentions("temperature", "thermal", "overheat", "hot", "cooling") and not mentions("oil"):
        signal = next((item for item in prediction.get("explanations", []) if "temperature" in item.get("parameter", "").casefold()), None)
        expected = f" The listed prototype range is {signal['expected_range']}." if signal else ""
        return (
            f"Engine {engine_id} cylinder temperature is {telemetry.get('cylinder_temperature', '—')} °C "
            f"and exhaust temperature is {telemetry.get('exhaust_temperature', '—')} °C.{expected} "
            f"The classifier reports {fault} at {confidence}% confidence (anomaly score {anomaly}/100). "
            "These are synthetic prototype signals, not validated engine limits."
        )
    if mentions("oil", "lubricat") or (mentions("pressure") and not mentions("fuel", "manifold")):
        return (
            f"Engine {engine_id} oil pressure is {telemetry.get('oil_pressure', '—')} bar and oil temperature is "
            f"{telemetry.get('oil_temperature', '—')} °C. The classifier reports {fault} at {confidence}% confidence "
            f"(anomaly score {anomaly}/100). The prototype monitoring range for oil pressure is 3.5–5.0 bar; "
            "it is not a validated engine limit."
        )
    if mentions("vibration", "mechanical", "wear"):
        return (
            f"Engine {engine_id} vibration is {telemetry.get('vibration', '—')} mm/s at "
            f"{telemetry.get('rpm', '—')} RPM. The classifier reports {fault} at {confidence}% confidence "
            f"(anomaly score {anomaly}/100). This is synthetic evidence, not a maintenance diagnosis."
        )
    if mentions("fuel", "flow", "manifold"):
        return (
            f"Engine {engine_id} fuel flow is {telemetry.get('fuel_flow', '—')} L/h, fuel pressure is "
            f"{telemetry.get('fuel_pressure', '—')} bar, and manifold pressure is "
            f"{telemetry.get('manifold_pressure', '—')} kPa. The classifier reports {fault} at {confidence}% confidence."
        )
    if mentions("mission", "reliability", "flight", "risk"):
        return (
            f"The simulated mission reliability for engine {engine_id} is "
            f"{mission.get('reliability_score', '—')}% ({mission.get('mission_risk', 'unknown')} risk). "
            f"Current engine health is {health.get('overall', '—')}% and the classifier reports {fault} "
            f"at {confidence}% confidence. This is a simulation indicator, not a flight decision."
        )
    if mentions("rul", "remaining useful", "remaining life", "life left", "hours left"):
        return (
            f"The simulated remaining-life indicator for engine {engine_id} is "
            f"{twin.get('estimated_rul_hours', '—')} hours. This is derived from synthetic prototype data, "
            "not a certified service-life estimate."
        )
    if mentions("fault", "anomal", "predict", "classifier", "signal", "concern", "explain"):
        explanations = prediction.get("explanations", [])
        leading = max(explanations, key=lambda item: item.get("contribution", 0), default=None)
        evidence = (
            f" The highest-contribution listed signal is {leading.get('parameter')} at "
            f"{leading.get('current_value')} {leading.get('unit')} (expected {leading.get('expected_range')})."
            if leading else ""
        )
        return (
            f"Engine {engine_id} is classified as {fault} with {confidence}% model confidence; "
            f"anomaly score is {anomaly}/100.{evidence} Confidence is not certainty, and the classifier "
            "was trained on synthetic data."
        )
    if not question.strip():
        return "Ask a question about the current twin data."

    findings = [
        f"Engine {engine_id} is in {twin.get('operating_state', 'unknown')} state.",
        f"Health is {health.get('overall', '—')}% ({health.get('state', 'unknown')}); the synthetic model predicts {fault} with {confidence}% confidence and anomaly score {anomaly}/100.",
        f"Current telemetry: {telemetry.get('cylinder_temperature', '—')} °C cylinder temperature, {telemetry.get('oil_pressure', '—')} bar oil pressure, {telemetry.get('vibration', '—')} mm/s vibration, and {telemetry.get('rpm', '—')} RPM.",
        f"Simulated mission reliability is {mission.get('reliability_score', '—')}%.",
    ]
    explanations = prediction.get("explanations", [])
    if explanations:
        leading = max(explanations, key=lambda item: item.get("contribution", 0))
        findings.append(f"The highest-contribution listed signal is {leading.get('parameter', 'unknown')} at {leading.get('current_value', '—')} {leading.get('unit', '')} (expected {leading.get('expected_range', 'range unavailable')}).")
    findings.append("This evidence summary is based on synthetic training data and is not validated for operational use.")
    return " ".join(findings)


async def answer(question: str, twin: dict[str, Any]) -> dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    model_name = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
    if not api_key:
        return {"answer": _local_response(question, twin), "source": "local evidence", "model": "local-evidence"}

    evidence = {
        "question": question,
        "current_digital_twin": twin,
    }
    payload = {
        "model": model_name,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(evidence, ensure_ascii=True, default=str)},
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            response = await client.post(
                AI_ENDPOINT,
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
            )
            response.raise_for_status()
            result = response.json()
    except httpx.HTTPStatusError as exc:
        raise RuntimeError(f"AI provider returned HTTP {exc.response.status_code}.") from exc
    except httpx.HTTPError as exc:
        raise RuntimeError("AI provider request failed; check network connectivity and API configuration.") from exc

    try:
        content = result["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("AI provider response did not contain a chat message.") from exc
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("AI provider returned an empty response.")
    return {"answer": content.strip(), "source": "OpenAI", "model": model_name}
