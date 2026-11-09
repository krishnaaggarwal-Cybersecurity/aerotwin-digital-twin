# ML pipeline and interpretability

## Synthetic training data

`scripts/generate_dataset.py` calls `app.ml.generate_dataset()`. It produces reproducible, non-identical correlated observations across load, throttle, ambient condition and altitude. Fault classes modify related signals together: for example, cooling degradation raises cylinder/exhaust/oil temperature and fuel flow rather than perturbing an unrelated random column.

## Models

- **Isolation Forest:** fitted only on normal-class data; its score is normalized to the UI’s 0–100 anomaly scale.
- **Random Forest classifier:** trained with a stratified split across eight classes; returns the active class probabilities and highest-probability fault.

Models and the feature order are saved as joblib payloads in `backend/models/`. At backend startup, `InferenceService` checks artifacts and automatically trains them when absent.

## Uploaded telemetry analysis

The Data Lab accepts user-provided CSV rows and reports the first configured range breach or a persistent deviation from the file's initial robust median/MAD baseline. This path does not call `InferenceService` and does not apply the synthetic-trained classifier to real measurements. Thresholds, baseline length, and persistence rules are prototype settings requiring validation against representative test-cell data before any engineering interpretation.

## Evaluation

`scripts/train_models.py` writes and prints real metrics calculated against the synthetic holdout: accuracy, per-class precision/recall/F1 and a confusion matrix. Results are explicitly marked `synthetic_data_evaluation: true` because they do not measure field performance.

## Explainable result

The dashboard displays the highest-risk expected-range deviations. Risk contribution combines deviation magnitude with the learned Random Forest feature importance. This is a practical transparent explanation for the demo; it is not a substitute for a formal feature-attribution study or safety case.

## RUL scope

Estimated RUL is a simulated condition indicator derived from the health score and synthetic operating hours. It is intentionally not presented as certified aerospace life or maintenance authorization.
