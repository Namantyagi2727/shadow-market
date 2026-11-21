"""Pipeline orchestrator: runs all stages in order and logs elapsed time."""

from __future__ import annotations

import asyncio
import os
import time
from typing import Awaitable, Callable

from pipeline import analyst, boardroom, build, competitors, iterate, lab, pitch, quit_analysis, swarm, verdict
from pipeline.context import Emit, EventLog, RunContext, Stage

StageFn = Callable[[RunContext, Emit], Awaitable[None]]


def _sanitize(text: str) -> str:
    for env_name in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
        secret = os.environ.get(env_name)
        if secret and len(secret) >= 8:
            text = text.replace(secret, "[REDACTED]")
    return text


async def _run_stage(
    name: str,
    fn: StageFn,
    stage: Stage,
    ctx: RunContext,
    log: EventLog,
    *,
    recoverable: bool,
) -> bool:
    t0 = time.perf_counter()
    try:
        await fn(ctx, log.emit)
    except Exception as exc:  # noqa: BLE001
        elapsed = time.perf_counter() - t0
        msg = _sanitize(f"{name} failed: {type(exc).__name__}: {exc}")
        print(f"[{ctx.run_id}] stage {name} failed in {elapsed:.2f}s ({type(exc).__name__})", flush=True)
        await log.emit("error", stage, {"message": msg, "recoverable": recoverable})
        return False
    elapsed = time.perf_counter() - t0
    print(f"[{ctx.run_id}] stage {name} finished in {elapsed:.2f}s", flush=True)
    return True


async def run_pipeline(ctx: RunContext, log: EventLog) -> None:
    """Execute the full Shadow Market pipeline for a run."""
    run_start = time.perf_counter()

    # 1. Pitch extraction (fatal on failure)
    await log.emit("stage_changed", "pitch", {"stage": "pitch"})
    if not await _run_stage("pitch", pitch.run, "pitch", ctx, log, recoverable=False):
        return

    # Start the 200 swarm personas now; they only need the pitch and overlap boardroom + build.
    swarm.prefetch_personas(ctx)
    analyst.prefetch(ctx)

    # 2. Boardroom debate + Shopify competitors concurrently
    await log.emit("stage_changed", "boardroom", {"stage": "boardroom"})
    await asyncio.gather(
        _run_stage("boardroom", boardroom.run, "boardroom", ctx, log, recoverable=True),
        _run_stage("competitors", competitors.run, "boardroom", ctx, log, recoverable=True),
    )

    # 3. MVP build (fatal on failure)
    await log.emit("stage_changed", "build", {"stage": "build"})
    if not await _run_stage("build", build.run, "build", ctx, log, recoverable=False):
        return

    # 4 & 5. Usability lab + quit analysis (both under stage "lab")
    await log.emit("stage_changed", "lab", {"stage": "lab"})
    await _run_stage("lab", lab.run, "lab", ctx, log, recoverable=True)
    await _run_stage("quit_analysis", quit_analysis.run, "lab", ctx, log, recoverable=True)

    # 6. Market swarm (Decisions API)
    await log.emit("stage_changed", "swarm", {"stage": "swarm"})
    await _run_stage("swarm", swarm.run, "swarm", ctx, log, recoverable=True)

    # 7. Final calibrated verdict
    await log.emit("stage_changed", "verdict", {"stage": "verdict"})
    await _run_stage("verdict", verdict.run, "verdict", ctx, log, recoverable=True)

    # 8. V2 fix-and-prove loop (runs after verdict unless disabled)
    if os.environ.get("ENABLE_V2") != "0":
        await log.emit("stage_changed", "iterate", {"stage": "iterate"})
        await _run_stage("iterate", iterate.run, "iterate", ctx, log, recoverable=True)

    total_elapsed = time.perf_counter() - run_start
    print(f"[{ctx.run_id}] pipeline finished in {total_elapsed:.2f}s", flush=True)
