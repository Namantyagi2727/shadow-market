"""Download the 2026 Web Robots Kickstarter crawl and build a leak-free stratified sample.

Run from repo root:
    uv run --project backend python eval/sample_dataset.py
"""

from __future__ import annotations

import gzip
import json
import math
import random
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

EVAL_DIR = REPO_ROOT / "eval"
DATA_DIR = EVAL_DIR / "data"

DATASET_URL = (
    "https://s3.amazonaws.com/weruns/forfun/Kickstarter/"
    "Kickstarter_2026-11-16T07_32_37_797Z.json.gz"
)
RAW_GZ_PATH = DATA_DIR / "Kickstarter_2026-11-16T07_32_37_797Z.json.gz"
SAMPLE_JSONL_PATH = DATA_DIR / "sample.jsonl"
SAMPLE_IDS_PATH = EVAL_DIR / "sample_ids.json"

DEADLINE_START_TS = int(datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc).timestamp())
DEADLINE_END_TS = int(datetime(2026, 11, 15, 23, 59, 59, tzinfo=timezone.utc).timestamp())

SAMPLE_SIZE = 150
CALIB_SIZE = 30
SEED = 42


def download_dataset(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        size_mb = dest.stat().st_size / (1024 * 1024)
        print(f"Dataset already present: {dest} ({size_mb:.1f} MB)")
        return

    tmp_path = dest.with_suffix(dest.suffix + ".part")
    print(f"Downloading {url} -> {dest}")
    start = time.monotonic()
    downloaded = 0
    last_log = 0.0

    with httpx.Client(follow_redirects=True, timeout=httpx.Timeout(30.0, read=120.0)) as http:
        with http.stream("GET", url) as resp:
            resp.raise_for_status()
            total_header = resp.headers.get("content-length")
            total_bytes = int(total_header) if total_header and total_header.isdigit() else None

            with tmp_path.open("wb") as out:
                for chunk in resp.iter_bytes(chunk_size=1024 * 256):
                    if not chunk:
                        continue
                    out.write(chunk)
                    downloaded += len(chunk)
                    now = time.monotonic()
                    if now - last_log >= 2.0:
                        mb = downloaded / (1024 * 1024)
                        elapsed = now - start
                        if total_bytes:
                            pct = 100.0 * downloaded / total_bytes
                            tot_mb = total_bytes / (1024 * 1024)
                            print(
                                f"  downloaded {mb:.1f}/{tot_mb:.1f} MB ({pct:.1f}%) in {elapsed:.1f}s",
                                flush=True,
                            )
                        else:
                            print(f"  downloaded {mb:.1f} MB in {elapsed:.1f}s", flush=True)
                        last_log = now

    tmp_path.replace(dest)
    elapsed = time.monotonic() - start
    print(f"Download complete: {downloaded / (1024 * 1024):.1f} MB in {elapsed:.1f}s")


def _parse_campaign(line: str) -> dict[str, Any] | None:
    """Extract only pre-outcome fields; never read pledged/backers/staff_pick/spotlight."""
    if not line.strip():
        return None
    try:
        outer = json.loads(line)
    except json.JSONDecodeError:
        return None
    if not isinstance(outer, dict):
        return None

    data = outer.get("data")
    if not isinstance(data, dict):
        return None

    state = data.get("state")
    if state not in {"successful", "failed"}:
        return None

    if data.get("currency") != "USD":
        return None

    raw_deadline = data.get("deadline")
    try:
        deadline = int(raw_deadline)
    except (TypeError, ValueError):
        return None
    if not (DEADLINE_START_TS <= deadline <= DEADLINE_END_TS):
        return None

    raw_id = data.get("id")
    if raw_id is None:
        return None
    try:
        campaign_id: int | str = int(raw_id)
    except (TypeError, ValueError):
        campaign_id = str(raw_id).strip()
        if not campaign_id:
            return None

    name = " ".join(str(data.get("name") or "").split())
    blurb = " ".join(str(data.get("blurb") or "").split())
    if not name or not blurb:
        return None

    raw_goal = data.get("goal")
    try:
        goal = float(raw_goal)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(goal) or goal <= 0:
        return None

    category_obj = data.get("category")
    if not isinstance(category_obj, dict):
        return None
    category_slug = str(category_obj.get("slug") or "").strip().lower()
    if not category_slug:
        return None
    top_category = category_slug.split("/", 1)[0].strip()
    if not top_category:
        return None

    photo_obj = data.get("photo")
    if not isinstance(photo_obj, dict):
        return None
    photo_full = str(photo_obj.get("full") or "").strip()
    if not photo_full:
        return None

    return {
        "id": campaign_id,
        "name": name,
        "blurb": blurb,
        "goal": goal,
        "currency": "USD",
        "category_slug": category_slug,
        "category": top_category,
        "photo_url": photo_full,
        "deadline": deadline,
        "state": state,
        "label": 1 if state == "successful" else 0,
    }


def load_eligible_pool(gz_path: Path) -> list[dict[str, Any]]:
    pool_by_id: dict[str, dict[str, Any]] = {}
    lines_read = 0
    with gzip.open(gz_path, "rt", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            lines_read += 1
            row = _parse_campaign(line)
            if row is None:
                continue
            key = str(row["id"])
            if key not in pool_by_id:
                pool_by_id[key] = row

    pool = sorted(pool_by_id.values(), key=lambda r: str(r["id"]))
    print(f"Scanned {lines_read:,} lines -> {len(pool):,} eligible unique 2026 USD campaigns")
    return pool


def stratified_category_sample(
    pool: list[dict[str, Any]],
    target_n: int,
    rng: random.Random,
) -> list[dict[str, Any]]:
    if not pool:
        raise RuntimeError("No eligible campaigns found in dataset.")
    n = min(target_n, len(pool))
    by_cat: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in pool:
        by_cat[row["category"]].append(row)

    total = len(pool)
    quotas: dict[str, int] = {}
    remainders: list[tuple[float, str]] = []
    for cat in sorted(by_cat):
        exact = n * len(by_cat[cat]) / total
        floor_q = min(len(by_cat[cat]), math.floor(exact))
        quotas[cat] = floor_q
        remainders.append((exact - floor_q, cat))

    remaining = n - sum(quotas.values())
    remainders.sort(key=lambda item: (-item[0], item[1]))
    while remaining > 0:
        allocated = False
        for _, cat in remainders:
            if remaining <= 0:
                break
            if quotas[cat] < len(by_cat[cat]):
                quotas[cat] += 1
                remaining -= 1
                allocated = True
        if not allocated:
            break

    sampled: list[dict[str, Any]] = []
    for cat in sorted(by_cat):
        items = list(by_cat[cat])
        rng.shuffle(items)
        sampled.extend(items[: quotas[cat]])

    return sampled


def stratified_label_split(
    sample: list[dict[str, Any]],
    calib_n: int,
    rng: random.Random,
) -> list[dict[str, Any]]:
    n_total = len(sample)
    n_calib = min(calib_n, n_total)

    pos = [dict(r) for r in sample if r["label"] == 1]
    neg = [dict(r) for r in sample if r["label"] == 0]
    rng.shuffle(pos)
    rng.shuffle(neg)

    target_pos = int(round(n_calib * len(pos) / n_total)) if n_total else 0
    target_pos = max(0, min(len(pos), target_pos))
    target_neg = n_calib - target_pos
    if target_neg > len(neg):
        target_neg = len(neg)
        target_pos = min(len(pos), n_calib - target_neg)

    calib_rows = pos[:target_pos] + neg[:target_neg]
    test_rows = pos[target_pos:] + neg[target_neg:]

    for r in calib_rows:
        r["split"] = "calib"
    for r in test_rows:
        r["split"] = "test"

    combined = sorted(
        calib_rows + test_rows,
        key=lambda r: (0 if r["split"] == "calib" else 1, str(r["id"])),
    )
    return combined


def main() -> int:
    download_dataset(DATASET_URL, RAW_GZ_PATH)
    pool = load_eligible_pool(RAW_GZ_PATH)

    rng = random.Random(SEED)
    # The crawl over-represents successes (~83% vs ~40% on Kickstarter overall: failed campaigns
    # drop out of listings). Balance labels 50/50 so "always say yes" can't look good; within
    # each label, keep category stratification.
    pos = [r for r in pool if r["label"] == 1]
    neg = [r for r in pool if r["label"] == 0]
    sampled = stratified_category_sample(pos, SAMPLE_SIZE // 2, rng) + stratified_category_sample(
        neg, SAMPLE_SIZE - SAMPLE_SIZE // 2, rng
    )
    rows = stratified_label_split(sampled, CALIB_SIZE, rng)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with SAMPLE_JSONL_PATH.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")

    sample_ids = [{"id": row["id"], "split": row["split"]} for row in rows]
    SAMPLE_IDS_PATH.write_text(json.dumps(sample_ids, indent=2) + "\n", encoding="utf-8")

    pool_rate = sum(r["label"] for r in pool) / len(pool)
    calib_rows = [r for r in rows if r["split"] == "calib"]
    test_rows = [r for r in rows if r["split"] == "test"]
    calib_rate = sum(r["label"] for r in calib_rows) / len(calib_rows) if calib_rows else 0.0
    test_rate = sum(r["label"] for r in test_rows) / len(test_rows) if test_rows else 0.0

    cat_counts = Counter(r["category"] for r in rows)
    print(f"Pool size:   {len(pool):,} (success rate: {pool_rate:.3f})")
    print(f"Sample size: {len(rows)} across {len(cat_counts)} top-level categories")
    print(f"  calib: n={len(calib_rows)}, success_rate={calib_rate:.3f}")
    print(f"  test:  n={len(test_rows)}, success_rate={test_rate:.3f}")
    print(f"Wrote {SAMPLE_JSONL_PATH} and {SAMPLE_IDS_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
