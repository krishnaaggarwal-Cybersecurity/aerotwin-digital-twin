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
    findings = [
        f"Engine {twin.get('engine_id', 'unknown')} is in {twin.get('operating_state', 'unknown')} state.",
        f"Health is {health.get('overall', '—')}% ({health.get('state', 'unknown')}); the synthetic model predicts {prediction.get('predicted_fault_label', 'no classification')} with {prediction.get('confidence', '—')}% confidence and anomaly score {prediction.get('anomaly_score', '—')}/100.",
        f"Current telemetry: {telemetry.get('cylinder_temperature', '—')} °C cylinder temperature, {telemetry.get('oil_pressure', '—')} bar oil pressure, {telemetry.get('vibration', '—')} mm/s vibration, and {telemetry.get('rpm', '—')} RPM.",
        f"Simulated mission reliability is {mission.get('reliability_score', '—')}%.",
    ]
    explanations = prediction.get("explanations", [])
    if explanations:
        leading = explanations[0]
        findings.append(f"The strongest model signal shown is {leading.get('parameter', 'unknown')} at {leading.get('current_value', '—')} {leading.get('unit', '')} (expected {leading.get('expected_range', 'range unavailable')}).")
    findings.append("This offline response summarizes current evidence only; the engine model uses synthetic training data and is not validated for operational use.")
    if not question.strip():
        return "Ask a question about the current twin data."
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
