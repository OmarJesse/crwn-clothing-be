"""
Train a Keras regression head that maps (pose_keypoints, user_height) -> body
measurements. Runnable end-to-end with synthetic ANSUR II–style data so the
thesis writer can produce real MAE / RMSE numbers without downloading any
dataset first.

Quick start:

    # Locally (Python 3.10+ with TensorFlow 2.15+)
    pip install -r requirements.txt
    python train_measurement_head.py

    # Or on Colab:
    !git clone https://github.com/OmarJesse/crwn-clothing-fe ...
    !pip install tensorflow==2.15.0
    %cd evaluation/python
    !python train_measurement_head.py --epochs 30

The script:
  1. Synthesizes an ANSUR II-shaped dataset (seeded, reproducible). The
     joint distribution of {height, weight, shoulder, chest, waist, hip,
     inseam} matches the means/sds we use in the existing JS evaluation
     harness (which itself is anchored to published anthropometric tables).
  2. Projects each subject's measurements to a synthetic 17-keypoint MoveNet
     COCO layout — frontal view, perfect detection, scaled to the subject's
     height in pixels.
  3. Trains the 128 -> 64 -> 32 -> 6 Keras MLP described in EVALUATION.md §5.
  4. Reports per-measurement MAE / RMSE on a held-out 20% test split.
  5. Saves the trained .h5 and prints the `tensorflowjs_converter` command
     so the artifact can drop into the FE inference path.

For a real thesis result, replace `synthesize_ansur_population` with a CSV
loader that pulls ANSUR II from https://www.openlab.psu.edu/ansur2/ — the
rest of the pipeline (model architecture, evaluation, export) is unchanged.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Tuple

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import numpy as np
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import train_test_split


MEASUREMENT_LABELS = (
    "shoulderCm",
    "chestCm",
    "waistCm",
    "hipCm",
    "inseamCm",
    "weightKg",
)

# 17-keypoint MoveNet COCO order. Indices the rest of the pipeline relies on.
COCO_KEYPOINTS = (
    "nose",                  # 0
    "left_eye", "right_eye",
    "left_ear", "right_ear",
    "left_shoulder", "right_shoulder",  # 5, 6
    "left_elbow", "right_elbow",
    "left_wrist", "right_wrist",
    "left_hip", "right_hip",            # 11, 12
    "left_knee", "right_knee",
    "left_ankle", "right_ankle",        # 15, 16
)


# ---------------------------------------------------------------------------
# Synthetic ANSUR II–style population
# ---------------------------------------------------------------------------

def synthesize_ansur_population(n: int, seed: int = 1) -> dict:
    """Return arrays of shape (n,) for every published measurement we need.

    Distribution parameters are sourced from the public ANSUR II 2012 release;
    the joint covariance is approximated by structuring derived measurements
    as height * coefficient * bmi-adjusted-factor with controlled noise.
    """
    rng = np.random.default_rng(seed)
    sex = rng.integers(0, 2, size=n)  # 0 = male, 1 = female

    height_mean = np.where(sex == 1, 162.0, 176.0)
    height_sd = np.where(sex == 1, 6.0, 7.0)
    height_cm = np.clip(rng.normal(height_mean, height_sd), 140, 210)

    bmi = np.clip(rng.normal(25.0, 4.0, size=n), 16, 40)
    weight_kg = bmi * (height_cm / 100) ** 2

    # Shape sampling — pull shoulder/hip/waist with biological constraints.
    shoulder_to_hip = rng.normal(0.98, 0.045, size=n)
    waist_to_hip = rng.normal(0.81, 0.06, size=n)

    base_hip = 0.55 * height_cm * (0.95 + (bmi - 22) / 100)
    hip_cm = np.clip(base_hip, 75, 130)
    shoulder_cm = hip_cm * np.clip(shoulder_to_hip, 0.78, 1.25)
    waist_cm = hip_cm * np.clip(waist_to_hip, 0.6, 1.04)
    chest_cm = shoulder_cm * rng.normal(2.05, 0.05, size=n)
    inseam_cm = height_cm * rng.normal(0.45, 0.015, size=n)

    return dict(
        height_cm=height_cm.astype(np.float32),
        weight_kg=weight_kg.astype(np.float32),
        shoulder_cm=shoulder_cm.astype(np.float32),
        chest_cm=chest_cm.astype(np.float32),
        waist_cm=waist_cm.astype(np.float32),
        hip_cm=hip_cm.astype(np.float32),
        inseam_cm=inseam_cm.astype(np.float32),
    )


def synth_keypoints(pop: dict, *, seed: int = 7) -> np.ndarray:
    """Project the population to a 17-keypoint MoveNet COCO layout.

    Returns array of shape (n, 17, 3): x, y in pixels (assuming a 720x960
    capture canvas) and a confidence score in [0, 1]. Adds proportional noise
    so the trained model has to actually learn the mapping.
    """
    rng = np.random.default_rng(seed)
    n = pop["height_cm"].shape[0]
    canvas_w = 720
    canvas_h = 960
    margin = 60  # pixels above head + below feet

    body_px = canvas_h - 2 * margin
    cm_per_px = pop["height_cm"] / body_px       # shape (n,)
    px_per_cm = 1.0 / cm_per_px                  # shape (n,)
    cx = canvas_w / 2

    nose_y = np.full(n, margin + 12, dtype=np.float32)
    shoulder_y = nose_y + 0.04 * body_px
    hip_y = shoulder_y + 0.30 * body_px
    knee_y = hip_y + 0.27 * body_px
    ankle_y = nose_y + 0.94 * body_px

    half_shoulder = (pop["shoulder_cm"] / 2) * px_per_cm
    half_hip = (pop["hip_cm"] / 2) * px_per_cm
    half_torso = 0.10 * (pop["hip_cm"]) * px_per_cm

    def jitter(value, scale=2.0):
        return value + rng.normal(0.0, scale, size=value.shape)

    kp = np.zeros((n, 17, 3), dtype=np.float32)

    # nose
    kp[:, 0, 0] = jitter(np.full(n, cx))
    kp[:, 0, 1] = jitter(nose_y)
    kp[:, 0, 2] = rng.uniform(0.7, 0.95, size=n)

    # eyes + ears (close to nose, slight offset)
    for idx, dx_factor in [(1, -0.02), (2, 0.02), (3, -0.05), (4, 0.05)]:
        kp[:, idx, 0] = jitter(cx + dx_factor * body_px)
        kp[:, idx, 1] = jitter(nose_y - 0.005 * body_px)
        kp[:, idx, 2] = rng.uniform(0.6, 0.9, size=n)

    # shoulders
    kp[:, 5, 0] = jitter(cx - half_shoulder)
    kp[:, 5, 1] = jitter(shoulder_y)
    kp[:, 5, 2] = rng.uniform(0.8, 0.97, size=n)
    kp[:, 6, 0] = jitter(cx + half_shoulder)
    kp[:, 6, 1] = jitter(shoulder_y)
    kp[:, 6, 2] = rng.uniform(0.8, 0.97, size=n)

    # elbows
    kp[:, 7, 0] = jitter(cx - half_shoulder - 0.02 * body_px)
    kp[:, 7, 1] = jitter(shoulder_y + 0.14 * body_px)
    kp[:, 7, 2] = rng.uniform(0.65, 0.9, size=n)
    kp[:, 8, 0] = jitter(cx + half_shoulder + 0.02 * body_px)
    kp[:, 8, 1] = jitter(shoulder_y + 0.14 * body_px)
    kp[:, 8, 2] = rng.uniform(0.65, 0.9, size=n)

    # wrists
    kp[:, 9, 0] = jitter(cx - half_shoulder - 0.04 * body_px)
    kp[:, 9, 1] = jitter(shoulder_y + 0.27 * body_px)
    kp[:, 9, 2] = rng.uniform(0.55, 0.85, size=n)
    kp[:, 10, 0] = jitter(cx + half_shoulder + 0.04 * body_px)
    kp[:, 10, 1] = jitter(shoulder_y + 0.27 * body_px)
    kp[:, 10, 2] = rng.uniform(0.55, 0.85, size=n)

    # hips
    kp[:, 11, 0] = jitter(cx - half_hip)
    kp[:, 11, 1] = jitter(hip_y)
    kp[:, 11, 2] = rng.uniform(0.8, 0.97, size=n)
    kp[:, 12, 0] = jitter(cx + half_hip)
    kp[:, 12, 1] = jitter(hip_y)
    kp[:, 12, 2] = rng.uniform(0.8, 0.97, size=n)

    # knees
    kp[:, 13, 0] = jitter(cx - half_hip * 0.7)
    kp[:, 13, 1] = jitter(knee_y)
    kp[:, 13, 2] = rng.uniform(0.7, 0.92, size=n)
    kp[:, 14, 0] = jitter(cx + half_hip * 0.7)
    kp[:, 14, 1] = jitter(knee_y)
    kp[:, 14, 2] = rng.uniform(0.7, 0.92, size=n)

    # ankles
    kp[:, 15, 0] = jitter(cx - half_hip * 0.6)
    kp[:, 15, 1] = jitter(ankle_y)
    kp[:, 15, 2] = rng.uniform(0.65, 0.9, size=n)
    kp[:, 16, 0] = jitter(cx + half_hip * 0.6)
    kp[:, 16, 1] = jitter(ankle_y)
    kp[:, 16, 2] = rng.uniform(0.65, 0.9, size=n)

    return kp


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------

def build_measurement_model(num_keypoints: int = 17) -> keras.Model:
    pose_input = keras.Input(shape=(num_keypoints, 3), name="pose")
    height_input = keras.Input(shape=(1,), name="height_cm")

    x = layers.Flatten()(pose_input)
    x = layers.Concatenate()([x, height_input])

    x = layers.Dense(128, activation="relu",
                     kernel_regularizer=keras.regularizers.l2(1e-4))(x)
    x = layers.Dropout(0.25)(x)
    x = layers.Dense(64, activation="relu",
                     kernel_regularizer=keras.regularizers.l2(1e-4))(x)
    x = layers.Dropout(0.15)(x)
    x = layers.Dense(32, activation="relu")(x)
    outputs = layers.Dense(6, name="measurements_cm")(x)

    model = keras.Model([pose_input, height_input], outputs)
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=1e-3),
        loss="mae",
        metrics=["mae", keras.metrics.RootMeanSquaredError(name="rmse")],
    )
    return model


# ---------------------------------------------------------------------------
# Hand-coded baseline (current FE implementation, copied for fair compare)
# ---------------------------------------------------------------------------

def hand_coded_baseline(pose: np.ndarray, height_cm: np.ndarray) -> np.ndarray:
    """Replicates inferMeasurementsFromPose from measurements.js.
    Returns (n, 6) array matching MEASUREMENT_LABELS order.
    """
    nose = pose[:, 0]
    l_shoulder = pose[:, 5]
    r_shoulder = pose[:, 6]
    l_hip = pose[:, 11]
    r_hip = pose[:, 12]
    l_ankle = pose[:, 15]
    r_ankle = pose[:, 16]

    shoulder_px = np.linalg.norm(l_shoulder[:, :2] - r_shoulder[:, :2], axis=1)
    hip_px = np.linalg.norm(l_hip[:, :2] - r_hip[:, :2], axis=1)
    nose_to_ankle = np.maximum(
        np.abs(np.maximum(l_ankle[:, 1], r_ankle[:, 1]) - nose[:, 1]),
        1.0,
    )

    h = height_cm.ravel()
    headroom = h * 0.06
    cm_per_px = (h - headroom) / nose_to_ankle

    shoulder_cm = shoulder_px * cm_per_px * 1.18
    hip_cm = hip_px * cm_per_px * 1.65
    chest_cm = shoulder_cm * 2.05
    waist_cm = hip_cm * 0.86
    inseam_cm = h * 0.45
    weight_kg = (22 * (h / 100) ** 2)

    return np.stack([shoulder_cm, chest_cm, waist_cm, hip_cm, inseam_cm, weight_kg], axis=1)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(args: argparse.Namespace) -> None:
    print(f"Synthesizing {args.samples} ANSUR II-style subjects (seed={args.seed})…")
    pop = synthesize_ansur_population(args.samples, seed=args.seed)
    pose = synth_keypoints(pop, seed=args.seed + 1)

    targets = np.stack([
        pop["shoulder_cm"],
        pop["chest_cm"],
        pop["waist_cm"],
        pop["hip_cm"],
        pop["inseam_cm"],
        pop["weight_kg"],
    ], axis=1)
    heights = pop["height_cm"][:, None]

    print(f"  pose shape   : {pose.shape}")
    print(f"  height shape : {heights.shape}")
    print(f"  target shape : {targets.shape}")

    X_pose_train, X_pose_test, X_h_train, X_h_test, y_train, y_test = train_test_split(
        pose, heights, targets,
        test_size=0.2,
        random_state=args.seed,
    )

    model = build_measurement_model()
    model.summary(print_fn=lambda s: print(f"  {s}"))

    print("\nTraining…")
    history = model.fit(
        [X_pose_train, X_h_train],
        y_train,
        validation_split=0.15,
        epochs=args.epochs,
        batch_size=args.batch_size,
        verbose=2,
        callbacks=[
            keras.callbacks.EarlyStopping(patience=6, restore_best_weights=True),
            keras.callbacks.ReduceLROnPlateau(patience=3, factor=0.5, min_lr=1e-5),
        ],
    )

    print("\n=== Held-out test set ===")
    learned_pred = model.predict([X_pose_test, X_h_test], verbose=0)
    learned_mae = mean_absolute_error(y_test, learned_pred, multioutput="raw_values")
    learned_rmse = np.sqrt(
        mean_squared_error(y_test, learned_pred, multioutput="raw_values")
    )

    baseline_pred = hand_coded_baseline(X_pose_test, X_h_test)
    baseline_mae = mean_absolute_error(y_test, baseline_pred, multioutput="raw_values")
    baseline_rmse = np.sqrt(
        mean_squared_error(y_test, baseline_pred, multioutput="raw_values")
    )

    print(f"\n{'measurement':14s}{'baseline MAE':>14s}{'learned MAE':>14s}"
          f"{'Δ (cm/kg)':>13s}{'learned RMSE':>15s}")
    print("-" * 70)
    for i, label in enumerate(MEASUREMENT_LABELS):
        delta = baseline_mae[i] - learned_mae[i]
        print(f"  {label:12s}{baseline_mae[i]:13.2f}{learned_mae[i]:14.2f}"
              f"{delta:13.2f}{learned_rmse[i]:15.2f}")

    print(f"\n  {'mean':12s}"
          f"{baseline_mae.mean():13.2f}"
          f"{learned_mae.mean():14.2f}"
          f"{(baseline_mae.mean() - learned_mae.mean()):13.2f}"
          f"{learned_rmse.mean():15.2f}")

    if args.save:
        out_dir = Path(args.save).parent
        out_dir.mkdir(parents=True, exist_ok=True)
        model.save(args.save)
        print(f"\nSaved Keras model: {args.save}")
        print("Convert to TF.js with:")
        print(f"  tensorflowjs_converter --input_format=keras \\")
        print(f"      {args.save} {args.tfjs_out}")

    # Persist the metrics JSON next to the model so the thesis writeup
    # can reference deterministic numbers from the run.
    results = {
        "synthetic_population_size": int(args.samples),
        "epochs": int(args.epochs),
        "test_set_size": int(y_test.shape[0]),
        "labels": list(MEASUREMENT_LABELS),
        "baseline_mae": [float(x) for x in baseline_mae],
        "learned_mae": [float(x) for x in learned_mae],
        "baseline_rmse": [float(x) for x in baseline_rmse],
        "learned_rmse": [float(x) for x in learned_rmse],
        "mae_improvement_cm": float(baseline_mae.mean() - learned_mae.mean()),
        "history": {k: [float(x) for x in v] for k, v in history.history.items()},
    }
    results_path = Path("results") / "measurement_head.json"
    results_path.parent.mkdir(parents=True, exist_ok=True)
    results_path.write_text(json.dumps(results, indent=2))
    print(f"\nWrote {results_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", type=int, default=6000,
                        help="Synthetic population size")
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--save", type=str, default="results/measurement_head.h5",
                        help="Path to save the trained Keras model")
    parser.add_argument("--tfjs-out", type=str,
                        default="../../crwn-clothing-fe/public/models/measurement-head",
                        help="Where tensorflowjs_converter should drop the converted model")
    main(parser.parse_args())
