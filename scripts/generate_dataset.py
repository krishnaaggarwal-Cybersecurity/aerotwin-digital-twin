#!/usr/bin/env python3
"""Generate reproducible, correlated synthetic telemetry for local model training."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.ml import generate_dataset, save_dataset, DATASET_FILE

if __name__ == "__main__":
    X, y = generate_dataset()
    save_dataset(X, y)
    print(f"Saved {len(X)} synthetic observations to {DATASET_FILE}")
