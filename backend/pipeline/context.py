"""Shared run context and event emission. Owned by Claude Code (lead). Do not change signatures without a CONTRACT note."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable, Literal

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent
RUNS_DIR = BACKEND_DIR / "runs"

Stage = Literal["pitch", "boardroom", "build", "lab", "swarm", "verdict", "reality", "room"]


@dataclass
class RunContext:
    """Everything a stage needs. Stages read inputs from here and write their outputs back here."""

    run_id: str
    run_dir: Path                      # backend/runs/<run_id>/
    pitch_video: Path | None = None    # uploaded webcam clip
    pitch: dict[str, Any] | None = None          # output of pitch stage (contract: pitch_parsed.data)
    boardroom: list[dict[str, Any]] = field(default_factory=list)  # boardroom_turn.data items
    spec: dict[str, Any] | None = None           # spec_ready.data
    mvp_dir: Path | None = None                  # dir containing index.html
    mvp_url: str | None = None                   # URL the persona browsers + phones use
    screenshot_path: Path | None = None          # PNG of the MVP
    hero_image_path: Path | None = None
    competitors: list[dict[str, Any]] = field(default_factory=list)  # competitors.data.items
    lab_results: list[dict[str, Any]] = field(default_factory=list)  # persona_finished.data + "actions" list
    quit_markers: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    swarm: dict[str, Any] | None = None          # swarm_result.data (+ "per_persona" list)
    verdict: dict[str, Any] | None = None

    def artifact_url(self, path: Path) -> str:
        """Public URL (relative to API base) for a file inside run_dir."""
        rel = path.resolve().relative_to(self.run_dir.resolve())
        return f"/api/runs/{self.run_id}/artifacts/{rel.as_posix()}"


Emit = Callable[[str, "Stage", dict[str, Any]], Awaitable[None]]


class EventLog:
    """Append-only event log per run. Persists to events.jsonl and fans out to WebSocket subscribers."""

    def __init__(self, run_dir: Path):
        self.path = run_dir / "events.jsonl"
        self.events: list[dict[str, Any]] = []
        self.subscribers: set[asyncio.Queue] = set()
        if self.path.exists():
            self.events = [json.loads(l) for l in self.path.read_text().splitlines() if l.strip()]

    async def emit(self, type_: str, stage: Stage, data: dict[str, Any]) -> None:
        event = {
            "type": type_,
            "seq": len(self.events),
            "ts": datetime.now(timezone.utc).isoformat(),
            "stage": stage,
            "data": data,
        }
        self.events.append(event)
        with self.path.open("a") as f:
            f.write(json.dumps(event) + "\n")
        for q in list(self.subscribers):
            q.put_nowait(event)
