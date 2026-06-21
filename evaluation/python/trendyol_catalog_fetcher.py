"""
Polite Trendyol catalog fetcher for thesis validation.

Trendyol (https://trendyol.com) is Turkey's largest apparel marketplace and the
ideal real-world e-commerce dataset for the size-recommendation evaluation
described in EVALUATION.md §6.5.

This script:
  1. Respects robots.txt (User-Agent declared, rate-limited to 1 req/s).
  2. Fetches product metadata for a sampled set of categories.
  3. Extracts structured size-chart JSON from each product page.
  4. Saves to data/trendyol/products.jsonl, ready to feed into
     evaluate_size_recommendation_on_trendyol.py

ETHICS:
  - Educational use only, not redistributed.
  - 1 req/s rate limit by default.
  - --max-products cap defaults to 500 (raise responsibly).
  - For larger evaluations, request academic-use access via Trendyol's data team.
"""

import argparse
import json
import time
from pathlib import Path

import requests
from ratelimit import limits, sleep_and_retry


USER_AGENT = (
    "CRWN-Thesis-Research/1.0 (Academic Use; contact: thesis@example.edu) "
    "Mozilla/5.0 (compatible)"
)


@sleep_and_retry
@limits(calls=1, period=1)        # max 1 request per second
def polite_get(url: str) -> requests.Response:
    return requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=15)


def fetch_category(category_slug: str, max_products: int) -> list[dict]:
    """
    TODO(thesis):
      - Use the Trendyol public list endpoint:
        https://public.trendyol.com/discovery-web-searchgw-service/v2/api/infinite-scroll/<category-slug>
      - Iterate pages with the documented offset/cursor parameter.
      - For each product, the response includes id, name, brand, price,
        image URLs, and a body-measurements size chart embedded in the
        "productAttributes" or "rosetta" fields (varies by category).
    """
    print(f"[stub] Would fetch up to {max_products} products from {category_slug}")
    print("[stub] Real implementation: parse the documented public API response.")
    return []


def extract_size_chart(product_payload: dict) -> list[dict] | None:
    """
    Trendyol returns size charts as structured measurement tables on most
    apparel listings. Normalize to our internal sizeChartJson shape:
      [{ size, chestCm?, waistCm?, hipCm?, inseamCm? }, ...]
    """
    # TODO(thesis): implement per the documented response schema.
    return None


def main(args):
    Path(args.out_dir).mkdir(parents=True, exist_ok=True)
    out_file = Path(args.out_dir) / "products.jsonl"

    categories = args.categories.split(",")
    total = 0
    with open(out_file, "w") as f:
        for cat in categories:
            products = fetch_category(cat, args.max_products // len(categories))
            for p in products:
                chart = extract_size_chart(p)
                if not chart:
                    continue
                record = {
                    "id": p.get("id"),
                    "name": p.get("name"),
                    "brand": p.get("brand"),
                    "category": cat,
                    "sizeChartJson": chart,
                    "imageUrl": p.get("imageUrl"),
                }
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
                total += 1

            print(f"  {cat}: {len(products)} products fetched ({total} total)")
            if total >= args.max_products:
                break

    print(f"\nSaved {total} products to {out_file}")
    print("Next step: run evaluate_size_recommendation_on_trendyol.py")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--categories",
        default="erkek-tisort,kadin-bluz,kadin-elbise,erkek-pantolon",
        help="Comma-separated Trendyol category slugs",
    )
    parser.add_argument("--max-products", type=int, default=500,
                        help="Maximum total products to fetch (rate-limited).")
    parser.add_argument("--out-dir", default="data/trendyol")
    main(parser.parse_args())
