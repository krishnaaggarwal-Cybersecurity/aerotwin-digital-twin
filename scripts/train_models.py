#!/usr/bin/env python3
"""Train fault classification and anomaly-detection models, then print real synthetic-data metrics."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.ml import train_models

if __name__ == "__main__":
    metrics = train_models(force=True)
    macro = metrics["classification_report"]["macro avg"]
    print(json.dumps({
        "synthetic_data_evaluation": True,
        "samples": metrics["samples"],
        "accuracy": metrics["accuracy"],
        "precision_macro": round(macro["precision"], 4),
        "recall_macro": round(macro["recall"], 4),
        "f1_macro": round(macro["f1-score"], 4),
        "confusion_matrix": metrics["confusion_matrix"],
    }, indent=2))
