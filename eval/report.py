"""Compute test metrics, calibration, bootstrap CIs, charts, and RESULTS.md.

Run from repo root:
    uv run --project backend python eval/report.py
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

EVAL_DIR = REPO_ROOT / "eval"
DATA_DIR = EVAL_DIR / "data"
RESULTS_DIR = EVAL_DIR / "results"

SAMPLE_JSONL_PATH = DATA_DIR / "sample.jsonl"
RESULTS_JSON_PATH = EVAL_DIR / "results.json"
RESULTS_MD_PATH = EVAL_DIR / "RESULTS.md"
RELIABILITY_PNG_PATH = EVAL_DIR / "reliability.png"
SCORES_PNG_PATH = EVAL_DIR / "scores.png"
CALIBRATION_JSON_PATH = BACKEND_DIR / "calibration.json"

ARM_ORDER = ("base", "single", "swarm")
BOOTSTRAP_RESAMPLES = 1000
BOOTSTRAP_SEED = 0


def _clip_p(p: np.ndarray) -> np.ndarray:
    return np.clip(p, 0.01, 0.99)


def _logit(p: np.ndarray) -> np.ndarray:
    pc = _clip_p(p)
    return np.log(pc / (1.0 - pc))


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(x, -60.0, 60.0)))


def _load_sample(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"Missing {path}. Run eval/sample_dataset.py first.")
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _load_arm_predictions(arm: str) -> dict[str, dict[str, Any]]:
    path = RESULTS_DIR / f"{arm}.jsonl"
    preds: dict[str, dict[str, Any]] = {}
    if not path.exists():
        return preds
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict) and "id" in obj and "p" in obj:
            preds[str(obj["id"])] = obj
    return preds


def _safe_auc(y_true: np.ndarray, p: np.ndarray) -> float | None:
    if len(np.unique(y_true)) < 2:
        return None
    return float(roc_auc_score(y_true, p))


def _bootstrap_ci(
    y_true: np.ndarray,
    p: np.ndarray,
    n_resamples: int = BOOTSTRAP_RESAMPLES,
    seed: int = BOOTSTRAP_SEED,
) -> tuple[list[float], list[float] | None]:
    rng = np.random.default_rng(seed)
    n = len(y_true)
    briers = np.empty(n_resamples, dtype=float)
    aucs: list[float] = []

    for i in range(n_resamples):
        idx = rng.integers(0, n, size=n)
        yb = y_true[idx]
        pb = p[idx]
        briers[i] = float(brier_score_loss(yb, pb))
        if len(np.unique(yb)) >= 2:
            aucs.append(float(roc_auc_score(yb, pb)))

    brier_ci = [float(np.percentile(briers, 2.5)), float(np.percentile(briers, 97.5))]
    auc_ci = (
        [float(np.percentile(aucs, 2.5)), float(np.percentile(aucs, 97.5))]
        if aucs
        else None
    )
    return brier_ci, auc_ci


def _compute_metrics(y_true: np.ndarray, p: np.ndarray) -> dict[str, Any]:
    brier = float(brier_score_loss(y_true, p))
    auc = _safe_auc(y_true, p)
    brier_ci, auc_ci = _bootstrap_ci(y_true, p)
    return {
        "n": int(len(y_true)),
        "brier": round(brier, 4),
        "brier_ci": [round(brier_ci[0], 4), round(brier_ci[1], 4)],
        "auc": round(auc, 4) if auc is not None else None,
        "auc_ci": [round(auc_ci[0], 4), round(auc_ci[1], 4)] if auc_ci is not None else None,
        "mean_pred": round(float(np.mean(p)), 4),
        "actual_rate": round(float(np.mean(y_true)), 4),
        "share_gt_0_5": round(float(np.mean(p > 0.5)), 4),
    }


def _fit_calibration(y_calib: np.ndarray, p_calib: np.ndarray) -> tuple[float, float]:
    if len(y_calib) == 0:
        return 0.0, 1.0
    if len(np.unique(y_calib)) < 2:
        rate = float(np.clip(np.mean(y_calib), 0.01, 0.99))
        return float(math.log(rate / (1.0 - rate))), 0.0

    x_calib = _logit(p_calib).reshape(-1, 1)
    clf = LogisticRegression(solver="lbfgs", C=1.0)
    clf.fit(x_calib, y_calib)
    alpha = float(clf.intercept_[0])
    beta = float(clf.coef_[0, 0])
    return alpha, beta


def _apply_calibration(p: np.ndarray, alpha: float, beta: float) -> np.ndarray:
    return _sigmoid(alpha + beta * _logit(p))


def _plot_reliability(
    raw_series: dict[str, tuple[np.ndarray, np.ndarray, dict[str, Any]]],
    out_path: Path,
) -> None:
    fig, ax = plt.subplots(figsize=(6.8, 5.6))
    ax.plot([0.0, 1.0], [0.0, 1.0], linestyle="--", color="#78716c", linewidth=1.2, label="Perfect calibration")

    styles = {
        "base": ("#64748b", "s"),
        "single": ("#d97706", "^"),
        "swarm": ("#0f766e", "o"),
    }

    for arm in ARM_ORDER:
        if arm not in raw_series:
            continue
        y_true, p_raw, metrics = raw_series[arm]
        bin_ids = np.minimum((p_raw * 10.0).astype(int), 9)
        xs: list[float] = []
        ys: list[float] = []
        sizes: list[float] = []
        for b in range(10):
            mask = bin_ids == b
            count = int(np.sum(mask))
            if count == 0:
                continue
            xs.append(float(np.mean(p_raw[mask])))
            ys.append(float(np.mean(y_true[mask])))
            sizes.append(25.0 + 4.5 * count)

        color, marker = styles.get(arm, ("#1d4ed8", "o"))
        label = f"{arm} (raw, Brier={metrics['brier']:.3f})"
        ax.plot(xs, ys, color=color, linewidth=1.8, alpha=0.85)
        ax.scatter(xs, ys, s=sizes, color=color, marker=marker, edgecolors="white", linewidths=0.8, label=label, zorder=3)

    ax.set_xlim(-0.02, 1.02)
    ax.set_ylim(-0.02, 1.02)
    ax.set_xlabel("Mean predicted probability (10 bins)")
    ax.set_ylabel("Observed success rate")
    ax.set_title("Reliability Diagram (Test Split, Raw Predictions)")
    ax.grid(True, linestyle=":", alpha=0.5)
    ax.legend(loc="upper left", frameon=True)
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


def _plot_scores(arm_reports: dict[str, dict[str, Any]], out_path: Path) -> None:
    entries: list[tuple[str, dict[str, Any], str]] = []
    colors = {
        ("base", "raw"): "#64748b",
        ("single", "raw"): "#f59e0b",
        ("single", "calibrated"): "#b45309",
        ("swarm", "raw"): "#14b8a6",
        ("swarm", "calibrated"): "#0f766e",
    }

    for arm in ARM_ORDER:
        rep = arm_reports.get(arm)
        if not rep:
            continue
        entries.append((f"{arm}\n(raw)", rep["raw"], colors[(arm, "raw")]))
        if rep.get("calibrated"):
            entries.append((f"{arm}\n(cal)", rep["calibrated"], colors[(arm, "calibrated")]))

    labels = [e[0] for e in entries]
    bar_colors = [e[2] for e in entries]
    x = np.arange(len(entries))

    brier_vals = [e[1]["brier"] for e in entries]
    brier_err_lo = [max(0.0, e[1]["brier"] - e[1]["brier_ci"][0]) for e in entries]
    brier_err_hi = [max(0.0, e[1]["brier_ci"][1] - e[1]["brier"]) for e in entries]

    auc_vals = [e[1]["auc"] if e[1]["auc"] is not None else 0.0 for e in entries]
    auc_err_lo = [
        max(0.0, e[1]["auc"] - e[1]["auc_ci"][0])
        if e[1]["auc"] is not None and e[1]["auc_ci"] is not None
        else 0.0
        for e in entries
    ]
    auc_err_hi = [
        max(0.0, e[1]["auc_ci"][1] - e[1]["auc"])
        if e[1]["auc"] is not None and e[1]["auc_ci"] is not None
        else 0.0
        for e in entries
    ]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11.2, 4.8))

    bars1 = ax1.bar(
        x,
        brier_vals,
        yerr=[brier_err_lo, brier_err_hi],
        capsize=4,
        color=bar_colors,
        edgecolor="#1c1917",
        linewidth=0.6,
    )
    ax1.set_xticks(x)
    ax1.set_xticklabels(labels, fontsize=9)
    ax1.set_ylabel("Brier Score (lower is better)")
    ax1.set_title("Test Brier Score (95% Bootstrap CI)")
    ax1.set_ylim(0.0, max(0.35, max(v + h for v, h in zip(brier_vals, brier_err_hi)) * 1.15))
    ax1.grid(True, axis="y", linestyle=":", alpha=0.5)
    for bar, val, hi in zip(bars1, brier_vals, brier_err_hi):
        ax1.text(
            bar.get_x() + bar.get_width() / 2.0,
            val + hi + 0.008,
            f"{val:.3f}",
            ha="center",
            va="bottom",
            fontsize=8.5,
        )

    bars2 = ax2.bar(
        x,
        auc_vals,
        yerr=[auc_err_lo, auc_err_hi],
        capsize=4,
        color=bar_colors,
        edgecolor="#1c1917",
        linewidth=0.6,
    )
    ax2.axhline(0.5, linestyle="--", color="#78716c", linewidth=1.0, label="Random (0.50)")
    ax2.set_xticks(x)
    ax2.set_xticklabels(labels, fontsize=9)
    ax2.set_ylabel("ROC-AUC (higher is better)")
    ax2.set_title("Test ROC-AUC (95% Bootstrap CI)")
    ax2.set_ylim(0.0, 1.05)
    ax2.grid(True, axis="y", linestyle=":", alpha=0.5)
    ax2.legend(loc="lower right", frameon=True)
    for bar, val, hi in zip(bars2, auc_vals, auc_err_hi):
        ax2.text(
            bar.get_x() + bar.get_width() / 2.0,
            min(1.01, val + hi + 0.015),
            f"{val:.3f}",
            ha="center",
            va="bottom",
            fontsize=8.5,
        )

    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


def _ci_overlaps(ci_a: list[float] | None, ci_b: list[float] | None) -> bool | None:
    if ci_a is None or ci_b is None:
        return None
    return max(ci_a[0], ci_b[0]) <= min(ci_a[1], ci_b[1])


def _write_honest_reading(arm_reports: dict[str, dict[str, Any]], test_rate: float) -> str:
    # Compare best available (calibrated for single/swarm, raw for base) across arms.
    primary: list[tuple[str, str, dict[str, Any]]] = []
    for arm in ARM_ORDER:
        rep = arm_reports.get(arm)
        if not rep:
            continue
        if rep.get("calibrated"):
            primary.append((arm, "calibrated", rep["calibrated"]))
        else:
            primary.append((arm, "raw", rep["raw"]))

    if not primary:
        return "No completed arms were available on the test split to evaluate."

    by_brier = sorted(primary, key=lambda item: item[2]["brier"])
    brier_win_arm, brier_win_mode, brier_win_m = by_brier[0]

    auc_candidates = [item for item in primary if item[2]["auc"] is not None]
    by_auc = sorted(auc_candidates, key=lambda item: item[2]["auc"], reverse=True)

    if len(by_brier) >= 2:
        brier_2_arm, brier_2_mode, brier_2_m = by_brier[1]
        brier_delta = brier_2_m["brier"] - brier_win_m["brier"]
        s1_brier = (
            f"On the test split, **{brier_win_arm} ({brier_win_mode})** achieves the lowest Brier score "
            f"at {brier_win_m['brier']:.4f}, beating runner-up **{brier_2_arm} ({brier_2_mode})** "
            f"({brier_2_m['brier']:.4f}) by {brier_delta:.4f}"
        )
    else:
        brier_2_arm, brier_2_m = None, None
        s1_brier = (
            f"On the test split, **{brier_win_arm} ({brier_win_mode})** achieves a Brier score "
            f"of {brier_win_m['brier']:.4f}"
        )

    if len(by_auc) >= 2:
        auc_win_arm, auc_win_mode, auc_win_m = by_auc[0]
        auc_2_arm, auc_2_mode, auc_2_m = by_auc[1]
        auc_delta = auc_win_m["auc"] - auc_2_m["auc"]
        s1 = (
            f"{s1_brier}; on discrimination, **{auc_win_arm} ({auc_win_mode})** leads with "
            f"ROC-AUC {auc_win_m['auc']:.4f} (+{auc_delta:.4f} over {auc_2_arm} at {auc_2_m['auc']:.4f})."
        )
    elif len(by_auc) == 1:
        auc_win_arm, auc_win_mode, auc_win_m = by_auc[0]
        s1 = f"{s1_brier} with ROC-AUC {auc_win_m['auc']:.4f}."
    else:
        s1 = f"{s1_brier}."

    # Sentence 2: CI overlap honesty
    overlap_notes: list[str] = []
    if brier_2_m is not None:
        ov_b = _ci_overlaps(brier_win_m["brier_ci"], brier_2_m["brier_ci"])
        overlap_notes.append(
            f"Brier 95% CIs between {brier_win_arm} ({brier_win_m['brier_ci'][0]:.3f}–{brier_win_m['brier_ci'][1]:.3f}) "
            f"and {brier_2_arm} ({brier_2_m['brier_ci'][0]:.3f}–{brier_2_m['brier_ci'][1]:.3f}) "
            f"{'overlap' if ov_b else 'do not overlap'}"
        )
    if len(by_auc) >= 2:
        auc_win_arm, _, auc_win_m = by_auc[0]
        auc_2_arm, _, auc_2_m = by_auc[1]
        ov_a = _ci_overlaps(auc_win_m["auc_ci"], auc_2_m["auc_ci"])
        overlap_notes.append(
            f"AUC 95% CIs between {auc_win_arm} ({auc_win_m['auc_ci'][0]:.3f}–{auc_win_m['auc_ci'][1]:.3f}) "
            f"and {auc_2_arm} ({auc_2_m['auc_ci'][0]:.3f}–{auc_2_m['auc_ci'][1]:.3f}) "
            f"{'overlap' if ov_a else 'do not overlap'}"
        )
    if overlap_notes:
        s2 = "Statistical uncertainty: " + "; and ".join(overlap_notes) + "."
    else:
        s2 = "Only one arm is present, so cross-arm CI overlap cannot be assessed yet."

    # Sentence 3: Calibration / sycophancy reading
    cal_parts: list[str] = []
    for arm in ("single", "swarm"):
        rep = arm_reports.get(arm)
        if not rep:
            continue
        raw_m = rep["raw"]
        cal_m = rep.get("calibrated")
        bias = raw_m["mean_pred"] - test_rate
        part = (
            f"{arm} raw mean={raw_m['mean_pred']:.3f} (bias {bias:+.3f}, "
            f"{raw_m['share_gt_0_5'] * 100:.0f}% > 0.5)"
        )
        if cal_m:
            brier_chg = cal_m["brier"] - raw_m["brier"]
            part += f" -> calibrated Brier {cal_m['brier']:.4f} ({brier_chg:+.4f})"
        cal_parts.append(part)
    if cal_parts:
        s3 = (
            f"Against the {test_rate:.3f} actual test success rate, "
            + "; ".join(cal_parts)
            + "."
        )
    else:
        s3 = f"The actual test success rate is {test_rate:.3f}."

    return f"{s1} {s2} {s3}"


def _format_ci(val: float | None, ci: list[float] | None) -> str:
    if val is None:
        return "N/A"
    if ci is None:
        return f"{val:.4f}"
    return f"{val:.4f} [{ci[0]:.4f}, {ci[1]:.4f}]"


def _render_markdown(
    dataset_summary: dict[str, Any],
    arm_reports: dict[str, dict[str, Any]],
    worst_swarm: list[dict[str, Any]],
    honest_reading: str,
) -> str:
    lines: list[str] = [
        "# 5-Sigma Backtest Results (2026 Kickstarter Launches)",
        "",
        f"- **Calibration split:** n={dataset_summary['n_calib']} "
        f"(actual success rate: {dataset_summary['calib_success_rate']:.3f})",
        f"- **Test split:** n={dataset_summary['n_test']} "
        f"(actual success rate: {dataset_summary['test_success_rate']:.3f})",
        "- **Bootstrap:** 1,000 resamples (seed 0), 95% percentile CIs. Logistic calibration fit on `calib` only.",
        "",
        "## Test Set Metrics",
        "",
        "| Arm | Variant | N | Brier [95% CI] | ROC-AUC [95% CI] | Mean Pred | Actual Rate | Share > 0.5 |",
        "|---|---|---:|---|---|---:|---:|---:|",
    ]

    for arm in ARM_ORDER:
        rep = arm_reports.get(arm)
        if not rep:
            continue
        raw = rep["raw"]
        lines.append(
            f"| {arm} | raw | {raw['n']} | {_format_ci(raw['brier'], raw['brier_ci'])} | "
            f"{_format_ci(raw['auc'], raw['auc_ci'])} | {raw['mean_pred']:.4f} | "
            f"{raw['actual_rate']:.4f} | {raw['share_gt_0_5'] * 100:.1f}% |"
        )
        cal = rep.get("calibrated")
        if cal:
            lines.append(
                f"| {arm} | calibrated | {cal['n']} | {_format_ci(cal['brier'], cal['brier_ci'])} | "
                f"{_format_ci(cal['auc'], cal['auc_ci'])} | {cal['mean_pred']:.4f} | "
                f"{cal['actual_rate']:.4f} | {cal['share_gt_0_5'] * 100:.1f}% |"
            )

    lines.extend(
        [
            "",
            "## Reading",
            "",
            honest_reading,
            "",
            "## Charts",
            "",
            "![Reliability diagram](reliability.png)",
            "",
            "![Test Brier and ROC-AUC](scores.png)",
            "",
            "## Top 5 Most Confidently Wrong Swarm Campaigns (Test Split)",
            "",
        ]
    )

    if worst_swarm:
        lines.extend(
            [
                "| ID | Name | Swarm p (raw) | Swarm p (cal) | Label | |p - label| |",
                "|---|---|---:|---:|---:|---:|",
            ]
        )
        for item in worst_swarm:
            p_cal_str = f"{item['p_cal']:.4f}" if item.get("p_cal") is not None else "N/A"
            safe_name = str(item["name"]).replace("|", "\\|")
            lines.append(
                f"| {item['id']} | {safe_name} | {item['p']:.4f} | {p_cal_str} | "
                f"{item['label']} | {item['abs_error']:.4f} |"
            )
    else:
        lines.append("No swarm test predictions available.")

    lines.append("")
    return "\n".join(lines)


def main() -> int:
    sample = _load_sample(SAMPLE_JSONL_PATH)
    calib_rows = [r for r in sample if r["split"] == "calib"]
    test_rows = [r for r in sample if r["split"] == "test"]
    if not test_rows:
        raise RuntimeError("No test rows found in sample.jsonl")

    dataset_summary = {
        "n_total": len(sample),
        "n_calib": len(calib_rows),
        "n_test": len(test_rows),
        "calib_success_rate": round(sum(r["label"] for r in calib_rows) / len(calib_rows), 4)
        if calib_rows
        else 0.0,
        "test_success_rate": round(sum(r["label"] for r in test_rows) / len(test_rows), 4),
    }

    arm_reports: dict[str, dict[str, Any]] = {}
    raw_series: dict[str, tuple[np.ndarray, np.ndarray, dict[str, Any]]] = {}
    worst_swarm: list[dict[str, Any]] = []
    swarm_cal_params: dict[str, float] | None = None

    for arm in ARM_ORDER:
        preds = _load_arm_predictions(arm)
        if not preds:
            continue

        matched_test = [r for r in test_rows if str(r["id"]) in preds]
        if not matched_test:
            continue

        y_test = np.array([int(r["label"]) for r in matched_test], dtype=int)
        p_test_raw = np.array([float(preds[str(r["id"])]["p"]) for r in matched_test], dtype=float)
        p_test_raw = np.clip(p_test_raw, 0.0, 1.0)

        raw_metrics = _compute_metrics(y_test, p_test_raw)
        raw_series[arm] = (y_test, p_test_raw, raw_metrics)

        arm_entry: dict[str, Any] = {
            "n_test": len(matched_test),
            "raw": raw_metrics,
        }

        if arm in ("single", "swarm"):
            matched_calib = [r for r in calib_rows if str(r["id"]) in preds]
            y_calib = np.array([int(r["label"]) for r in matched_calib], dtype=int)
            p_calib_raw = np.array([float(preds[str(r["id"])]["p"]) for r in matched_calib], dtype=float)
            p_calib_raw = np.clip(p_calib_raw, 0.0, 1.0)

            alpha, beta_coef = _fit_calibration(y_calib, p_calib_raw)
            p_test_cal = _apply_calibration(p_test_raw, alpha, beta_coef)

            arm_entry["n_calib"] = len(matched_calib)
            arm_entry["calibration"] = {
                "alpha": round(alpha, 6),
                "beta": round(beta_coef, 6),
            }
            arm_entry["calibrated"] = _compute_metrics(y_test, p_test_cal)

            if arm == "swarm":
                swarm_cal_params = {
                    "alpha": round(alpha, 6),
                    "beta": round(beta_coef, 6),
                }
                scored_rows: list[dict[str, Any]] = []
                for row, p_r, p_c in zip(matched_test, p_test_raw, p_test_cal):
                    err = abs(float(p_r) - int(row["label"]))
                    scored_rows.append(
                        {
                            "id": row["id"],
                            "name": row["name"],
                            "category": row["category"],
                            "goal": row["goal"],
                            "p": round(float(p_r), 4),
                            "p_cal": round(float(p_c), 4),
                            "label": int(row["label"]),
                            "abs_error": round(err, 4),
                        }
                    )
                scored_rows.sort(key=lambda item: (-item["abs_error"], str(item["id"])))
                worst_swarm = scored_rows[:5]
        else:
            arm_entry["note"] = "already calibrated on calib split"

        arm_reports[arm] = arm_entry

    if not arm_reports:
        raise RuntimeError(
            f"No arm results found in {RESULTS_DIR}. Run eval/run_eval.py first."
        )

    honest_reading = _write_honest_reading(arm_reports, dataset_summary["test_success_rate"])

    _plot_reliability(raw_series, RELIABILITY_PNG_PATH)
    _plot_scores(arm_reports, SCORES_PNG_PATH)

    results_payload = {
        "dataset": dataset_summary,
        "arms": arm_reports,
        "worst_swarm_campaigns": worst_swarm,
        "reading": honest_reading,
    }
    RESULTS_JSON_PATH.write_text(
        json.dumps(results_payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    md = _render_markdown(dataset_summary, arm_reports, worst_swarm, honest_reading)
    RESULTS_MD_PATH.write_text(md, encoding="utf-8")

    if swarm_cal_params is not None:
        CALIBRATION_JSON_PATH.write_text(
            json.dumps(swarm_cal_params, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"Wrote {CALIBRATION_JSON_PATH}: {swarm_cal_params}")

    print(f"Wrote {RESULTS_JSON_PATH}, {RESULTS_MD_PATH}, {RELIABILITY_PNG_PATH}, {SCORES_PNG_PATH}")
    print("\n" + honest_reading)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
