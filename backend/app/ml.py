"""Synthetic-data ML pipeline used by the local digital-twin demonstrator."""
from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from .config import DATA_DIR, MODEL_DIR
from .simulation import FAULT_LABELS

FEATURES = [
    "rpm", "oil_pressure", "oil_temperature", "cylinder_temperature",
    "exhaust_temperature", "manifold_pressure", "fuel_flow", "fuel_pressure",
    "vibration", "load", "throttle", "ambient_temperature", "altitude",
]
CLASSIFIER_FILE = MODEL_DIR / "fault_classifier.joblib"
ANOMALY_FILE = MODEL_DIR / "anomaly_detector.joblib"
METRICS_FILE = MODEL_DIR / "training_metrics.json"
DATASET_FILE = DATA_DIR / "synthetic_engine_dataset.csv"


def _normal_sample(rng: np.random.Generator) -> dict[str, float]:
    throttle = rng.uniform(30, 88)
    load = np.clip(throttle + rng.normal(-2, 9), 15, 98)
    ambient = rng.uniform(-4, 38)
    altitude = rng.uniform(0, 6500)
    thermal = .74 * load + .26 * throttle
    oil_temp = ambient + 49 + thermal * .47 + rng.normal(0, 1.5)
    return {
        "rpm": 950 + throttle * 20.8 - altitude / 1000 * 18 + rng.normal(0, 24),
        "oil_pressure": 4.85 - thermal*.010 - oil_temp*.007 + rng.normal(0, .11),
        "oil_temperature": oil_temp,
        "cylinder_temperature": ambient + 83 + thermal*.70 + altitude/1000*.8 + rng.normal(0, 3.5),
        "exhaust_temperature": ambient + 333 + thermal*1.35 + rng.normal(0, 5),
        "manifold_pressure": 31 + throttle*.48 - altitude/1000*.62 + rng.normal(0, .45),
        "fuel_flow": 10 + thermal*.115 + altitude/1000*.05 + rng.normal(0, .26),
        "fuel_pressure": 4.3 - thermal*.004 + rng.normal(0, .09),
        "vibration": 1.55 + thermal*.020 + rng.normal(0, .16),
        "load": load,
        "throttle": throttle,
        "ambient_temperature": ambient,
        "altitude": altitude,
    }


def generate_dataset(samples_per_class: int = 340, seed: int = 26054) -> tuple[np.ndarray, np.ndarray]:
    """Produce varied but correlated synthetic operating data for every demonstrator class."""
    rng = np.random.default_rng(seed)
    rows: list[list[float]] = []
    labels: list[str] = []
    fault_keys = list(FAULT_LABELS)
    for fault in fault_keys:
        for _ in range(samples_per_class):
            row = _normal_sample(rng)
            severity = rng.uniform(.35, 1.0) if fault != "normal" else 0
            if fault == "overheating":
                row["cylinder_temperature"] += 58*severity; row["exhaust_temperature"] += 66*severity; row["oil_temperature"] += 22*severity
            elif fault == "low_oil_pressure":
                row["oil_pressure"] -= 2.15*severity; row["oil_temperature"] += 13*severity; row["vibration"] += 1.55*severity
            elif fault == "excessive_vibration":
                row["vibration"] += 6.8*severity; row["rpm"] += rng.normal(0, 65*severity)
            elif fault == "abnormal_fuel_flow":
                row["fuel_flow"] += 5*severity; row["fuel_pressure"] -= 1.12*severity; row["exhaust_temperature"] += 32*severity
            elif fault == "cooling_degradation":
                row["cylinder_temperature"] += 47*severity; row["exhaust_temperature"] += 31*severity; row["oil_temperature"] += 17*severity; row["fuel_flow"] += 1.05*severity
            elif fault == "sensor_anomaly":
                row["cylinder_temperature"] += rng.choice([-1, 1])*42*severity; row["manifold_pressure"] += rng.normal(0, 4*severity)
            elif fault == "progressive_degradation":
                row["cylinder_temperature"] += 35*severity; row["oil_temperature"] += 14*severity; row["oil_pressure"] -= 1.15*severity; row["vibration"] += 3*severity; row["fuel_flow"] += 2.2*severity
            rows.append([float(row[f]) for f in FEATURES])
            labels.append(fault)
    return np.array(rows, dtype=float), np.array(labels)


def save_dataset(X: np.ndarray, y: np.ndarray, path: Path = DATASET_FILE) -> None:
    with path.open("w", newline="") as file:
        writer = csv.writer(file)
        writer.writerow([*FEATURES, "fault"])
        writer.writerows([*row, label] for row, label in zip(X, y))


def train_models(force: bool = False) -> dict[str, Any]:
    if not force and CLASSIFIER_FILE.exists() and ANOMALY_FILE.exists() and METRICS_FILE.exists():
        return json.loads(METRICS_FILE.read_text())
    X, y = generate_dataset()
    save_dataset(X, y)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=.22, random_state=26054, stratify=y)
    classifier = Pipeline([
        ("scaler", StandardScaler()),
        ("model", RandomForestClassifier(n_estimators=180, max_depth=13, min_samples_leaf=2, class_weight="balanced", random_state=26054, n_jobs=-1)),
    ])
    classifier.fit(X_train, y_train)
    predicted = classifier.predict(X_test)
    normal_X = X[y == "normal"]
    anomaly = Pipeline([
        ("scaler", StandardScaler()),
        ("model", IsolationForest(n_estimators=160, contamination=.08, random_state=26054)),
    ])
    anomaly.fit(normal_X)
    metrics = {
        "synthetic_data_evaluation": True,
        "samples": int(len(X)),
        "accuracy": round(float(accuracy_score(y_test, predicted)), 4),
        "classification_report": classification_report(y_test, predicted, output_dict=True, zero_division=0),
        "confusion_matrix": confusion_matrix(y_test, predicted, labels=list(FAULT_LABELS)).tolist(),
        "labels": list(FAULT_LABELS),
    }
    joblib.dump({"pipeline": classifier, "features": FEATURES, "labels": FAULT_LABELS}, CLASSIFIER_FILE)
    joblib.dump({"pipeline": anomaly, "features": FEATURES}, ANOMALY_FILE)
    METRICS_FILE.write_text(json.dumps(metrics, indent=2))
    return metrics


class InferenceService:
    def __init__(self) -> None:
        train_models()
        self.classifier = joblib.load(CLASSIFIER_FILE)
        self.anomaly = joblib.load(ANOMALY_FILE)
        self.fault_labels = self.classifier["labels"]

    def predict(self, telemetry: dict[str, Any]) -> dict[str, Any]:
        values = np.array([[float(telemetry[f]) for f in FEATURES]])
        model = self.classifier["pipeline"]
        probabilities = model.predict_proba(values)[0]
        classes = model.named_steps["model"].classes_
        probabilities_by_key = {key: round(float(probabilities[list(classes).index(key)]), 4) for key in self.fault_labels}
        key = str(model.predict(values)[0])
        confidence = probabilities_by_key[key]
        raw_anomaly = float(self.anomaly["pipeline"].score_samples(values)[0])
        # IsolationForest values are normalized into an interpretable 0–100 risk scale.
        anomaly_score = float(np.clip((-.43 - raw_anomaly) * 280, 0, 100))
        if key != "normal":
            anomaly_score = max(anomaly_score, min(96, (1 - probabilities_by_key["normal"]) * 112))
        explanations = self._explain(telemetry, model.named_steps["model"].feature_importances_)
        return {
            "predicted_fault": key,
            "predicted_fault_label": self.fault_labels[key],
            "confidence": round(confidence * 100, 1),
            "risk": "CRITICAL" if confidence > .80 and key != "normal" else "HIGH" if confidence > .58 and key != "normal" else "WATCH" if anomaly_score > 25 else "LOW",
            "probabilities": {self.fault_labels[k]: round(v * 100, 1) for k, v in probabilities_by_key.items()},
            "anomaly_score": round(anomaly_score, 1),
            "anomaly_status": "ANOMALOUS" if anomaly_score >= 35 else "NORMAL",
            "affected_parameters": [item["parameter"] for item in explanations if item["deviation"] != "NORMAL"],
            "explanations": explanations,
        }

    def _explain(self, telemetry: dict[str, Any], importance: np.ndarray) -> list[dict[str, Any]]:
        expectations = {
            "cylinder_temperature": (118, 168, "°C"), "exhaust_temperature": (390, 475, "°C"),
            "oil_pressure": (3.5, 5.0, "bar"), "oil_temperature": (68, 103, "°C"),
            "vibration": (0, 4.5, "mm/s"), "fuel_flow": (12, 21, "L/h"),
            "fuel_pressure": (3.5, 4.8, "bar"), "rpm": (1500, 2900, "rpm"),
        }
        explainable = []
        for feature, weight in zip(FEATURES, importance):
            if feature not in expectations:
                continue
            low, high, unit = expectations[feature]
            value = float(telemetry[feature])
            deviation = max(0.0, low-value, value-high) / max(high-low, .1)
            score = deviation * (float(weight) + .06)
            explainable.append({
                "parameter": feature.replace("_", " ").title(), "current_value": round(value, 2), "unit": unit,
                "expected_range": f"{low}–{high} {unit}",
                "deviation": "HIGH" if deviation > .45 else "MODERATE" if deviation > .12 else "NORMAL",
                "contribution": round(min(100, score * 400), 1),
            })
        return sorted(explainable, key=lambda item: item["contribution"], reverse=True)[:5]
