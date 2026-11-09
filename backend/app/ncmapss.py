"""Optional adapter for the original N-CMAPSS DS03-012 Keras artifacts."""
from __future__ import annotations

import csv
import importlib.util
import io
import math
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from .config import ROOT

ASSET_DIRS = (ROOT / "frontend" / "dist" / "research" / "ncmapss", ROOT / "frontend" / "public" / "research" / "ncmapss")
FEATURES = ("Altitude", "Mach", "TRA", "T2", "T24", "T30", "T48", "T50", "P15", "P2", "P21", "P24", "Ps30", "P40", "P50", "Nf", "Nc", "Wf")
MODEL_NAMES = ("state_DS03-012_model_10.h5", "rul_DS03-012_model_10.h5")


def _asset(name: str) -> Path | None:
    for root in ASSET_DIRS:
        path = root / name
        if path.is_file():
            return path
    return None


def status() -> dict[str, Any]:
    models = {name: _asset(f"models/{name}") is not None for name in MODEL_NAMES}
    scaler = _asset("models/DS03-012_scaler.gz") is not None
    tensorflow = importlib.util.find_spec("tensorflow") is not None
    return {
        "dataset": "N-CMAPSS DS03-012",
        "models_present": all(models.values()),
        "scaler_present": scaler,
        "tensorflow_available": tensorflow,
        "ready": all(models.values()) and scaler and tensorflow,
        "sequence_length": 10,
        "feature_count": len(FEATURES),
        "features": list(FEATURES),
        "message": "Ready for a 10-row feature CSV." if all(models.values()) and scaler and tensorflow else "Install the optional N-CMAPSS runtime (TensorFlow) to enable local model inference.",
    }


@lru_cache(maxsize=1)
def _load_runtime():
    try:
        from tensorflow.keras.models import load_model
    except ImportError as exc:
        raise RuntimeError("TensorFlow is not installed. Install backend/requirements-ncmapss.txt with Python 3.10.") from exc
    scaler_path = _asset("models/DS03-012_scaler.gz")
    state_path = _asset(f"models/{MODEL_NAMES[0]}")
    rul_path = _asset(f"models/{MODEL_NAMES[1]}")
    if not scaler_path or not state_path or not rul_path:
        raise RuntimeError("The N-CMAPSS model artifacts or scaler are missing from the project.")
    scaler = joblib.load(scaler_path)
    expected = tuple(str(x) for x in getattr(scaler, "feature_names_in_", ()))
    if expected and expected != FEATURES:
        raise RuntimeError("The bundled scaler feature order does not match the inference adapter.")
    if int(scaler.n_features_in_) != len(FEATURES):
        raise RuntimeError("The bundled scaler does not match the 18-feature N-CMAPSS model.")
    return scaler, load_model(state_path, compile=False), load_model(rul_path, compile=False)


def predict_csv(csv_text: str) -> dict[str, Any]:
    reader = csv.DictReader(io.StringIO(csv_text, newline=""), strict=True)
    if not reader.fieldnames:
        raise ValueError("CSV needs a header row with the 18 N-CMAPSS feature names.")
    headers = {name.strip(): name for name in reader.fieldnames if name}
    missing = [name for name in FEATURES if name not in headers]
    if missing:
        raise ValueError("Missing required feature columns: " + ", ".join(missing))
    rows: list[list[float]] = []
    for line, raw in enumerate(reader, 2):
        if not raw or not any(value and value.strip() for value in raw.values()):
            continue
        try:
            values = [float(raw[headers[name]]) for name in FEATURES]
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Row {line} contains a missing or non-numeric model feature.") from exc
        if not all(math.isfinite(value) for value in values):
            raise ValueError(f"Row {line} contains a non-finite model feature.")
        rows.append(values)
        if len(rows) > 5000:
            raise ValueError("CSV exceeds the 5,000-row analysis limit.")
    if len(rows) < 10:
        raise ValueError("Provide at least 10 chronological rows for the model sequence.")
    sequence = np.asarray(rows[-10:], dtype=np.float32)
    scaler, state_model, rul_model = _load_runtime()
    scaled = scaler.transform(sequence).astype(np.float32)
    state_prob = np.asarray(state_model.predict(scaled[:, -14:][None, :, :], verbose=0))[0]
    rul_prob = np.asarray(rul_model.predict(scaled[None, :, :], verbose=0))[0]
    state_class = int(np.argmax(state_prob))
    rul_class = int(np.argmax(rul_prob))
    rul_band = {0: "under 15 cycles", 1: "15–29 cycles", 2: "30+ cycles"}.get(rul_class, "class unavailable")
    return {
        "dataset": "N-CMAPSS DS03-012",
        "model": "Original BiLSTM, sequence length 10",
        "rows_used": 10,
        "state": {"class": state_class, "confidence": round(float(np.max(state_prob)), 4), "probabilities": [round(float(x), 4) for x in state_prob]},
        "rul": {"class": rul_class, "band": rul_band, "confidence": round(float(np.max(rul_prob)), 4), "probabilities": [round(float(x), 4) for x in rul_prob]},
        "scope_note": "Predictions are outputs of the source research models. They are not validated maintenance or airworthiness decisions.",
    }
