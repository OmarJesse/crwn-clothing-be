"""
Evaluate the size-recommendation engine on the H&M Personalized Fashion
Recommendations dataset (Kaggle competition 2022).

This is the canonical academic benchmark for fashion recommendation, with
1.3M articles, 1.4M users, and full transaction history. We use the
held-out test split to compute NDCG@10 against industry baselines.

Defensible thesis claim:
  "On H&M Personalized Fashion Recommendations test split, our combined
   size + style + preference scoring achieves NDCG@10 = 0.YY, exceeding
   the popularity baseline (NDCG@10 = 0.XX) by Δ%."

PREREQS:
  pip install kaggle pandas numpy scikit-learn
  kaggle competitions download -c h-and-m-personalized-fashion-recommendations
  unzip into data/h-and-m/
"""

import argparse
from pathlib import Path

import numpy as np
import pandas as pd


def ndcg_at_k(relevances: np.ndarray, k: int = 10) -> float:
    """Standard NDCG. relevances is shape (n_users, k) of graded relevance."""
    discounts = 1 / np.log2(np.arange(2, k + 2))
    dcg = (relevances[:, :k] * discounts[None, :]).sum(axis=1)
    ideal = np.sort(relevances, axis=1)[:, ::-1]
    idcg = (ideal[:, :k] * discounts[None, :]).sum(axis=1)
    idcg = np.where(idcg == 0, 1, idcg)
    return (dcg / idcg).mean()


def load_h_and_m(root: Path):
    print(f"[stub] Load H&M competition data from {root}")
    print("  articles.csv     — product catalog (id, name, attributes)")
    print("  customers.csv    — user demographics")
    print("  transactions_train.csv — purchase history")
    print("  Sample: 1.4M users, 105K articles, 31M transactions.")
    return None, None, None


def main(args):
    articles, customers, transactions = load_h_and_m(args.root)

    # TODO(thesis):
    #   1. Split transactions by date; hold out the last 7 days as test.
    #   2. For each test user, build their fit profile from prior purchase history.
    #   3. Score every catalog article with the same combined formula
    #      (0.4 size + 0.3 style + 0.3 preference + 0.1 has-size).
    #   4. Take top-10 per user.
    #   5. Compute NDCG@10 against actual purchases.
    #   6. Compare against three baselines:
    #      a) random ranking
    #      b) popularity (most-purchased articles)
    #      c) Last purchase repeated (strong baseline in fashion).

    print("[stub] NDCG@10 baseline comparison would run here.")
    print("[stub] Output JSON with per-user NDCG distribution + bootstrap CI.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("data/h-and-m"))
    main(parser.parse_args())
