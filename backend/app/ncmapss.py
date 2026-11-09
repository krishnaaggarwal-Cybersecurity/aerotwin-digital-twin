"""Optional adapter for the original N-CMAPSS DS03-012 Keras artifacts."""
from __future__ import annotations

import csv
import io
import json
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


@lru_cache(maxsize=1)
def _h5py_module():
    try:
        import h5py
        return h5py
    except Exception:
        return None


def _asset(name: str) -> Path | None:
    for root in ASSET_DIRS:
        path = root / name
        if path.is_file():
            return path
    return None


def status() -> dict[str, Any]:
    models = {name: _asset(f"models/{name}") is not None for name in MODEL_NAMES}
    scaler = _asset("models/DS03-012_scaler.gz") is not None
    hdf5_reader = _h5py_module() is not None
    return {
        "dataset": "N-CMAPSS DS03-012",
        "models_present": all(models.values()),
        "scaler_present": scaler,
        "hdf5_reader_available": hdf5_reader,
        "ready": all(models.values()) and scaler and hdf5_reader,
        "sequence_length": 10,
        "feature_count": len(FEATURES),
        "features": list(FEATURES),
        "message": "Ready for a 10-row feature CSV." if all(models.values()) and scaler and hdf5_reader else "Install the optional HDF5 reader with Python 3.10 to enable local model inference.",
    }


@lru_cache(maxsize=1)
def _load_runtime():
    h5py = _h5py_module()
    if h5py is None:
        raise RuntimeError("The HDF5 reader could not load. Use Python 3.10 and install backend/requirements-ncmapss.txt.")
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
    return scaler, _load_h5_network(h5py, state_path), _load_h5_network(h5py, rul_path)


def _load_h5_network(h5py: Any, path: Path) -> list[dict[str, Any]]:
    """Read the source Keras LSTM weights and evaluate them with NumPy at inference time."""
    network: list[dict[str, Any]] = []
    with h5py.File(path, "r") as handle:
        config = json.loads(handle.attrs["model_config"])
        for layer in config["config"]["layers"]:
            kind, layer_config = layer["class_name"], layer["config"]
            if kind == "Bidirectional":
                name = layer_config["name"]
                weights: dict[str, dict[str, np.ndarray]] = {}
                group = handle["model_weights"][name]
                def collect(path_name: str, value: Any) -> None:
                    if not isinstance(value, h5py.Dataset):
                        return
                    for direction in ("forward_lstm", "backward_lstm"):
                        if direction not in path_name:
                            continue
                        for weight in ("kernel:0", "recurrent_kernel:0", "bias:0"):
                            if path_name.rsplit("/", 1)[-1] == weight:
                                key = {"kernel:0": "kernel", "recurrent_kernel:0": "recurrent", "bias:0": "bias"}[weight]
                                weights.setdefault(direction, {})[key] = np.asarray(value, dtype=np.float32)
                group.visititems(collect)
                if any(set(weights.get(direction, {})) != {"kernel", "recurrent", "bias"} for direction in ("forward_lstm", "backward_lstm")):
                    raise RuntimeError(f"Could not read both LSTM directions from {path.name}.")
                network.append({"type": "bilstm", "weights": weights, "sequences": bool(layer_config["layer"]["config"]["return_sequences"])})
            elif kind == "Dense":
                group = handle["model_weights"][layer_config["name"]]
                tensors: dict[str, np.ndarray] = {}
                def collect_dense(path_name: str, value: Any) -> None:
                    if isinstance(value, h5py.Dataset) and path_name.rsplit("/", 1)[-1] in ("kernel:0", "bias:0"):
                        tensors["kernel" if path_name.rsplit("/", 1)[-1] == "kernel:0" else "bias"] = np.asarray(value, dtype=np.float32)
                group.visititems(collect_dense)
                if set(tensors) != {"kernel", "bias"}:
                    raise RuntimeError(f"Could not read dense weights from {path.name}.")
                network.append({"type": "dense", "weights": tensors, "activation": layer_config.get("activation", "linear")})
    return network


def _lstm(sequence: np.ndarray, weights: dict[str, np.ndarray], backwards: bool, return_sequences: bool) -> np.ndarray:
    kernel, recurrent, bias = weights["kernel"], weights["recurrent"], weights["bias"]
    units = recurrent.shape[0]
    h = np.zeros(units, dtype=np.float32)
    c = np.zeros(units, dtype=np.float32)
    outputs: list[np.ndarray] = []
    indexes = range(len(sequence) - 1, -1, -1) if backwards else range(len(sequence))
    for index in indexes:
        gates = sequence[index] @ kernel + h @ recurrent + bias
        gi, gf, gc, go = np.split(gates, 4)
        sigmoid = lambda x: 1.0 / (1.0 + np.exp(-np.clip(x, -40, 40)))
        i, f, candidate, o = sigmoid(gi), sigmoid(gf), np.tanh(gc), sigmoid(go)
        c = f * c + i * candidate
        h = o * np.tanh(c)
        outputs.append(h)
    if return_sequences:
        if backwards:
            outputs.reverse()
        return np.stack(outputs)
    return h


def _predict(network: list[dict[str, Any]], sequence: np.ndarray) -> np.ndarray:
    values = sequence
    for layer in network:
        weights = layer["weights"]
        if layer["type"] == "bilstm":
            forward = _lstm(values, weights["forward_lstm"], False, layer["sequences"])
            backward = _lstm(values, weights["backward_lstm"], True, layer["sequences"])
            values = np.concatenate((forward, backward), axis=-1)
        else:
            values = values @ weights["kernel"] + weights["bias"]
            if layer["activation"] == "relu":
                values = np.maximum(values, 0)
            elif layer["activation"] == "softmax":
                shifted = values - np.max(values, axis=-1, keepdims=True)
                exps = np.exp(shifted)
                values = exps / np.sum(exps, axis=-1, keepdims=True)
            elif layer["activation"] == "tanh":
                values = np.tanh(values)
    return np.asarray(values, dtype=np.float32)


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
    state_prob = _predict(state_model, scaled[:, -14:])
    rul_prob = _predict(rul_model, scaled)
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
