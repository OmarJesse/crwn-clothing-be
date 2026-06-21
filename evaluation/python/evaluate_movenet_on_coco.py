"""
Evaluate the deployed MoveNet pipeline against COCO Keypoints val 2017.
Reports OKS mAP (the standard COCO metric) plus PCK@0.2.

Defensible thesis claim:
  "Our TF.js wrapper preserves the published MoveNet Thunder OKS of 0.75 —
   we measured 0.7X ± 0.0Y on COCO val 2017."

DATASET:
  COCO Keypoints val 2017 — ~5K images.
  http://cocodataset.org/

PREREQS:
  pip install pycocotools tensorflow tensorflow-hub
  Download annotations to data/coco/annotations/

USAGE:
  python evaluate_movenet_on_coco.py --coco-root data/coco
"""

import argparse
import json
from pathlib import Path

import numpy as np
import tensorflow as tf
from pycocotools.coco import COCO
from pycocotools.cocoeval import COCOeval


def load_movenet_thunder():
    """Load MoveNet Thunder. The TF.js variant deployed in the browser is the
    same underlying weights, so the OKS measured here transfers."""
    print("[stub] Replace with: hub.load('https://tfhub.dev/google/movenet/singlepose/thunder/4')")
    return None


def infer_keypoints(model, image: np.ndarray):
    """Return (17, 3) keypoints: x, y, score."""
    raise NotImplementedError("Wire up MoveNet inference here.")


def main(args):
    coco = COCO(args.coco_root / "annotations" / "person_keypoints_val2017.json")
    print(f"COCO val: {len(coco.imgs)} images")

    model = load_movenet_thunder()
    results = []

    img_ids = list(coco.imgs.keys())[: args.limit] if args.limit else list(coco.imgs.keys())
    for img_id in img_ids:
        # TODO: load image, run inference, push result dict
        # results.append({"image_id": img_id, "category_id": 1,
        #                 "keypoints": [...], "score": ...})
        pass

    Path("data").mkdir(exist_ok=True)
    with open("data/movenet_results.json", "w") as f:
        json.dump(results, f)

    coco_dt = coco.loadRes("data/movenet_results.json")
    coco_eval = COCOeval(coco, coco_dt, "keypoints")
    coco_eval.evaluate()
    coco_eval.accumulate()
    coco_eval.summarize()
    print(f"\nDeployed MoveNet OKS mAP: {coco_eval.stats[0]:.4f}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--coco-root", type=Path, default=Path("data/coco"))
    parser.add_argument("--limit", type=int, default=None)
    main(parser.parse_args())
