from __future__ import annotations

import csv
import io
import math
import statistics
from typing import Any


PARAMETERS = {
    "cylinder_temperature": {"label": "Cylinder temperature", "unit": "°C", "range": (118, 168), "fault": "Thermal excursion"},
    "exhaust_temperature": {"label": "Exhaust temperature", "unit": "°C", "range": (390, 475), "fault": "Thermal excursion"},
    "oil_pressure": {"label": "Oil pressure", "unit": "bar", "range": (3.5, 5.0), "fault": "Lubrication pressure loss"},
    "oil_temperature": {"label": "Oil temperature", "unit": "°C", "range": (68, 103), "fault": "Lubrication / cooling excursion"},
    "vibration": {"label": "Vibration", "unit": "mm/s", "range": (0, 4.5), "fault": "Mechanical vibration"},
    "fuel_flow": {"label": "Fuel flow", "unit": "L/h", "range": (12, 21), "fault": "Fuel-system excursion"},
    "fuel_pressure": {"label": "Fuel pressure", "unit": "bar", "range": (3.5, 4.8), "fault": "Fuel-system excursion"},
    "rpm": {"label": "RPM", "unit": "rpm", "range": (1500, 2900), "fault": "Engine-speed excursion"},
}
ALIASES = {
    "cylinder_temp": "cylinder_temperature",
    "cyl_temp": "cylinder_temperature",
    "exhaust_temp": "exhaust_temperature",
    "oil_temp": "oil_temperature",
    "oilpressure": "oil_pressure",
    "fuelpressure": "fuel_pressure",
    "fuelrate": "fuel_flow",
    "timestamp": "timestamp",
    "time": "timestamp",
    "datetime": "timestamp",
}


def _normalized_header(value: str) -> str:
    key = value.strip().lstrip("\ufeff").lower().replace("-", "_").replace(" ", "_")
    return ALIASES.get(key, key)


def analyze_csv(csv_text: str, filename: str) -> dict[str, Any]:
    try:
        reader = csv.DictReader(io.StringIO(csv_text, newline=""), strict=True)
        if not reader.fieldnames:
            raise ValueError("CSV needs a header row.")
        headers = {_normalized_header(name): name for name in reader.fieldnames if name}
        columns = [key for key in PARAMETERS if key in headers]
        if not columns:
            raise ValueError("CSV needs at least one supported sensor column (for example cylinder_temperature, oil_pressure, or vibration).")

        rows: list[dict[str, Any]] = []
        for line_number, raw in enumerate(reader, start=2):
            if not raw or not any(value and value.strip() for value in raw.values()):
                continue
            row: dict[str, Any] = {"timestamp": (raw.get(headers.get("timestamp", "")) or "").strip() or f"row {line_number}"}
            for key in columns:
                raw_value = raw.get(headers[key])
                if raw_value is None or not raw_value.strip():
                    continue
                try:
                    value = float(raw_value)
                except ValueError as exc:
                    raise ValueError(f"Row {line_number}: {headers[key]} must be numeric.") from exc
                if not math.isfinite(value):
                    raise ValueError(f"Row {line_number}: {headers[key]} must be a finite number.")
                row[key] = value
            if any(key in row for key in columns):
                rows.append(row)
            if len(rows) > 5000:
                raise ValueError("CSV is limited to 5,000 telemetry rows per analysis.")
    except csv.Error as exc:
        raise ValueError("CSV could not be parsed. Check quoting and delimiter formatting.") from exc

    if len(rows) < 8:
        raise ValueError("At least 8 telemetry rows are required to compare a baseline with later measurements.")

    baseline_count = max(5, min(50, len(rows) // 4))
    baseline = rows[:baseline_count]
    limits = {
        key: (statistics.median(values), max(statistics.median([abs(value - statistics.median(values)) for value in values]) * 1.4826, (PARAMETERS[key]["range"][1] - PARAMETERS[key]["range"][0]) * .02, .05))
        for key in columns
        if (values := [row[key] for row in baseline if key in row])
    }

    events: dict[str, dict[str, Any]] = {}
    consecutive: dict[str, int] = {}
    for index, row in enumerate(rows):
        for key in columns:
            if key not in row:
                continue
            value = row[key]
            config = PARAMETERS[key]
            low, high = config["range"]
            violation = value < low or value > high
            baseline_limit = limits.get(key)
            drifting = baseline_limit is not None and index >= baseline_count and abs(value - baseline_limit[0]) >= 3.5 * baseline_limit[1]
            consecutive[key] = consecutive.get(key, 0) + 1 if drifting else 0
            if violation:
                reason = f"{config['label']} {value:g} {config['unit']} is outside the configured monitoring range ({low:g}–{high:g} {config['unit']})."
                severity = "HIGH"
            elif consecutive[key] >= 3:
                reason = f"{config['label']} stayed more than 3.5 robust baseline deviations from its uploaded-data baseline for 3 consecutive samples."
                severity = "WARNING"
            else:
                continue
            event_key = config["fault"]
            if event_key not in events:
                events[event_key] = {
                    "fault": event_key,
                    "parameter": config["label"],
                    "timestamp": row["timestamp"],
                    "sample_index": index + 1,
                    "value": round(value, 3),
                    "unit": config["unit"],
                    "severity": severity,
                    "reason": reason,
                }

    ordered_events = sorted(events.values(), key=lambda event: event["sample_index"])
    return {
        "filename": filename,
        "source": "uploaded telemetry",
        "sample_count": len(rows),
        "baseline_samples": baseline_count,
        "parameters": [{"key": key, "label": PARAMETERS[key]["label"], "unit": PARAMETERS[key]["unit"]} for key in columns],
        "first_detection": ordered_events[0] if ordered_events else None,
        "detected_events": ordered_events,
        "detection_method": "Configured monitoring envelopes plus a 3-sample persistent deviation from the upload's robust median/MAD baseline.",
        "scope_note": "This report analyzes the uploaded measurements directly; the synthetic-trained classifier is not applied. Thresholds and baseline selection are demonstrator settings, not validated engine limits or flight-clearance criteria.",
    }
