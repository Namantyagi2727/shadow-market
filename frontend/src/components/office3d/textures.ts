"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type {
  CompetitorItem,
  FounderBriefData,
  MvpReadyData,
  PitchParsedData,
  RoomUtteranceData,
  SpecReadyData,
  SwarmProgressData,
  SwarmResultData,
  VerdictData,
} from "@/lib/contracts";
import type { BuildLogEntry, PersonaState } from "@/lib/run-store";

type DrawFn = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

export function createCanvasTexture(
  width: number,
  height: number,
  draw: DrawFn
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    draw(ctx, width, height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Manages a single CanvasTexture that redraws in-place whenever `deps` change
 * and disposes cleanly on unmount.
 */
export function useDynamicCanvasTexture(
  width: number,
  height: number,
  draw: DrawFn,
  deps: ReadonlyArray<unknown>
): THREE.CanvasTexture {
  const drawRef = useRef<DrawFn>(draw);
  drawRef.current = draw;

  const { canvas, texture } = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return { canvas: c, texture: t };
  }, [width, height]);

  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      drawRef.current(ctx, width, height);
      texture.needsUpdate = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, texture, width, height, ...deps]);

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  return texture;
}

/**
 * Loads an artifact image (e.g. MVP screenshot) via THREE.TextureLoader
 * so it can be drawn onto CanvasTextures or used as a map safely.
 */
export function useArtifactImage(url: string | null): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!url) {
      setImage(null);
      return;
    }
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    let loadedTex: THREE.Texture | null = null;

    loader.load(
      url,
      (tex) => {
        if (cancelled) {
          tex.dispose();
          return;
        }
        loadedTex = tex;
        const img = tex.image as HTMLImageElement | undefined;
        if (img && img.width > 0 && img.height > 0) {
          setImage(img);
        }
      },
      undefined,
      () => {
        if (!cancelled) {
          setImage(null);
        }
      }
    );

    return () => {
      cancelled = true;
      if (loadedTex) {
        loadedTex.dispose();
      }
    };
  }, [url]);

  return image;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return y;

  let line = "";
  let lineCount = 0;
  let curY = y;

  for (let i = 0; i < words.length; i += 1) {
    const candidate = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lineCount += 1;
      if (lineCount >= maxLines) {
        let trimmed = line;
        while (
          trimmed.length > 3 &&
          ctx.measureText(`${trimmed}…`).width > maxWidth
        ) {
          trimmed = trimmed.slice(0, -1);
        }
        ctx.fillText(`${trimmed}…`, x, curY);
        return curY + lineHeight;
      }
      ctx.fillText(line, x, curY);
      curY += lineHeight;
      line = words[i];
    } else {
      line = candidate;
    }
  }

  if (line) {
    ctx.fillText(line, x, curY);
    curY += lineHeight;
  }
  return curY;
}

function seededRand(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function createPlankTexture(): THREE.CanvasTexture {
  const tex = createCanvasTexture(512, 512, (g, w, h) => {
    const palette = ["#a47a52", "#9b7149", "#ad835a", "#946b45"];
    for (let i = 0; i < 16; i += 1) {
      g.fillStyle = palette[i % 4];
      g.fillRect(0, i * 32, w, 32);
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.fillRect(0, i * 32, w, 2);
      g.fillRect((i * 137) % w, i * 32, 2, 32);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4.5, 3.2);
  return tex;
}

export function createSkylineTexture(seed = 42): THREE.CanvasTexture {
  return createCanvasTexture(512, 256, (g, w, h) => {
    const rand = seededRand(seed);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "#1d2b53");
    gr.addColorStop(0.6, "#7a4b6e");
    gr.addColorStop(1, "#f0a868");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);

    for (let i = 0; i < 26; i += 1) {
      const bw = 14 + rand() * 26;
      const bh = 60 + rand() * 145;
      const x = i * 20;
      g.fillStyle = "#1a1d29";
      g.fillRect(x, h - bh, bw, bh);
      g.fillStyle = "#ffd27a";
      for (let y = h - bh + 8; y < h - 6; y += 12) {
        for (let xx = x + 4; xx < x + bw - 4; xx += 8) {
          if (rand() < 0.35) {
            g.fillRect(xx, y, 3, 5);
          }
        }
      }
    }
  });
}

export function createRugTexture(
  baseColor: string,
  borderColor: string
): THREE.CanvasTexture {
  return createCanvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = baseColor;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = borderColor;
    g.lineWidth = 10;
    g.strokeRect(14, 14, w - 28, h - 28);
  });
}

export function createWhiteboardTexture(): THREE.CanvasTexture {
  return createCanvasTexture(512, 300, (g, w, h) => {
    g.fillStyle = "#fbfbf8";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#378ADD";
    g.lineWidth = 5;
    g.strokeRect(30, 40, 120, 70);
    g.strokeRect(210, 40, 120, 70);
    g.strokeRect(120, 170, 120, 70);
    g.beginPath();
    g.moveTo(150, 75);
    g.lineTo(210, 75);
    g.moveTo(270, 110);
    g.lineTo(180, 170);
    g.stroke();
    g.fillStyle = "#D85A30";
    g.font = "bold 20px sans-serif";
    g.fillText("pitch → MVP → lab", 345, 86);
    const notes = ["#FAC775", "#97C459", "#F4C0D1"];
    notes.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(355 + i * 44, 145 + i * 20, 36, 36);
    });
  });
}

export function drawRoomSign(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  label: string,
  accentColor: string,
  active: boolean
) {
  ctx.clearRect(0, 0, w, h);
  drawRoundedRect(ctx, 10, 16, w - 20, h - 32, 18);
  ctx.fillStyle = active ? "rgba(18, 22, 32, 0.96)" : "rgba(15, 17, 22, 0.86)";
  ctx.fill();
  ctx.lineWidth = active ? 5 : 2.5;
  ctx.strokeStyle = active ? accentColor : "rgba(255,255,255,0.18)";
  ctx.stroke();

  ctx.fillStyle = accentColor;
  ctx.font = "bold 44px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label.toUpperCase(), w / 2, h / 2 + 2);
}

export function drawPitchSlide(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pitch: PitchParsedData | null
) {
  ctx.fillStyle = "#0f1116";
  ctx.fillRect(0, 0, w, h);

  // Accent bar
  ctx.fillStyle = "#EF9F27";
  ctx.fillRect(72, 74, 10, 130);

  // Subtle corner pill
  ctx.fillStyle = "rgba(239, 159, 39, 0.16)";
  drawRoundedRect(ctx, w - 300, 62, 228, 46, 23);
  ctx.fill();
  ctx.fillStyle = "#EF9F27";
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("PITCH STUDIO", w - 186, 93);
  ctx.textAlign = "left";

  if (!pitch) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 66px system-ui, sans-serif";
    ctx.fillText("Shadow Market HQ", 110, 150);
    ctx.fillStyle = "#9aa0ab";
    ctx.font = "36px system-ui, sans-serif";
    ctx.fillText("Waiting for founder pitch deck…", 110, 215);
    ctx.fillStyle = "#2b303d";
    drawRoundedRect(ctx, 110, 300, 620, 18, 9);
    ctx.fill();
    drawRoundedRect(ctx, 110, 345, 460, 18, 9);
    ctx.fill();
    return;
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 66px system-ui, sans-serif";
  const afterTitle = drawWrappedText(ctx, pitch.title, 110, 140, w - 430, 74, 2);

  ctx.fillStyle = "#b2b8c4";
  ctx.font = "34px system-ui, sans-serif";
  const afterOneLiner = drawWrappedText(
    ctx,
    pitch.one_liner || pitch.target_user || "",
    110,
    afterTitle + 8,
    w - 190,
    44,
    2
  );

  // Price badge
  const priceY = Math.max(335, afterOneLiner + 28);
  if (pitch.price_usd !== null && pitch.price_usd !== undefined) {
    ctx.fillStyle = "#EF9F27";
    ctx.font = "bold 60px system-ui, sans-serif";
    ctx.fillText(`$${pitch.price_usd}`, 110, priceY);
  }

  if (pitch.target_user) {
    ctx.fillStyle = "#7dd3fc";
    ctx.font = "28px system-ui, sans-serif";
    ctx.fillText(
      `Target: ${pitch.target_user.slice(0, 56)}`,
      pitch.price_usd !== null ? 290 : 110,
      priceY - 12
    );
  }

  // Features list
  const features = pitch.features.slice(0, 3);
  ctx.fillStyle = "#d5dae2";
  ctx.font = "32px system-ui, sans-serif";
  features.forEach((feat, idx) => {
    drawWrappedText(ctx, `•  ${feat}`, 110, priceY + 76 + idx * 58, w - 190, 38, 1);
  });
}

export function drawBoardroomSpec(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  spec: SpecReadyData | null,
  competitors: CompetitorItem[]
) {
  ctx.fillStyle = "#10141d";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(0, 0, w, 14);

  ctx.fillStyle = "#7dd3fc";
  ctx.font = "bold 28px system-ui, sans-serif";
  ctx.fillText("BOARDROOM · V1 SPEC", 48, 66);

  if (!spec) {
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 46px system-ui, sans-serif";
    ctx.fillText("Debating Positioning & Price", 48, 165);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "28px system-ui, sans-serif";
    ctx.fillText(
      competitors.length > 0
        ? `Comparing ${competitors.length} market rivals…`
        : "Strategist vs Skeptic locking V1 scope…",
      48,
      225
    );
    return;
  }

  if (spec.price_usd !== null && spec.price_usd !== undefined) {
    drawRoundedRect(ctx, w - 210, 30, 162, 62, 14);
    ctx.fillStyle = "rgba(56, 189, 248, 0.2)";
    ctx.fill();
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 38px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`$${spec.price_usd}`, w - 129, 74);
    ctx.textAlign = "left";
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 48px system-ui, sans-serif";
  const nextY = drawWrappedText(ctx, spec.headline || "V1 Spec Locked", 48, 150, w - 96, 56, 2);

  if (spec.pages.length > 0) {
    ctx.fillStyle = "#34d399";
    ctx.font = "bold 24px system-ui, sans-serif";
    ctx.fillText("PAGES", 48, nextY + 26);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "26px system-ui, sans-serif";
    drawWrappedText(ctx, spec.pages.slice(0, 4).join("  •  "), 48, nextY + 62, w - 96, 34, 2);
  }

  if (spec.risks.length > 0) {
    ctx.fillStyle = "#fb7185";
    ctx.font = "bold 24px system-ui, sans-serif";
    ctx.fillText("KEY RISKS", 48, h - 110);
    ctx.fillStyle = "#fecdd3";
    ctx.font = "24px system-ui, sans-serif";
    drawWrappedText(ctx, `• ${spec.risks[0]}`, 48, h - 72, w - 96, 30, 2);
  }
}

export function drawServerScreen(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  buildMessages: BuildLogEntry[],
  mvp: MvpReadyData | null,
  mvpImage: HTMLImageElement | null
) {
  ctx.fillStyle = "#0b0f17";
  ctx.fillRect(0, 0, w, h);

  // Top status bar
  ctx.fillStyle = "#151c29";
  ctx.fillRect(0, 0, w, 58);
  ctx.fillStyle = mvp ? "#34d399" : buildMessages.length > 0 ? "#f59e0b" : "#64748b";
  ctx.beginPath();
  ctx.arc(34, 29, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f1f5f9";
  ctx.font = "bold 24px system-ui, sans-serif";
  ctx.fillText(
    mvp
      ? "MVP DEPLOYED · LIVE PREVIEW"
      : buildMessages.length > 0
      ? "BUILD PIPELINE · COMPILING MVP"
      : "SERVER ROOM · STANDBY",
    58,
    37
  );

  if (mvp && mvpImage) {
    // Draw screenshot neatly preserving aspect ratio inside frame
    const padX = 24;
    const padY = 74;
    const boxW = w - padX * 2;
    const boxH = h - padY - 24;
    const scale = Math.min(boxW / mvpImage.width, boxH / mvpImage.height);
    const drawW = mvpImage.width * scale;
    const drawH = mvpImage.height * scale;
    const dx = padX + (boxW - drawW) / 2;
    const dy = padY + (boxH - drawH) / 2;
    ctx.fillStyle = "#111827";
    ctx.fillRect(padX, padY, boxW, boxH);
    ctx.drawImage(mvpImage, dx, dy, drawW, drawH);
    return;
  }

  if (mvp) {
    ctx.fillStyle = "#34d399";
    ctx.font = "bold 46px system-ui, sans-serif";
    ctx.fillText("MVP Build Ready", 48, 165);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "28px system-ui, sans-serif";
    drawWrappedText(
      ctx,
      mvp.url || "Landing page & checkout live",
      48,
      225,
      w - 96,
      36,
      2
    );
    return;
  }

  if (buildMessages.length === 0) {
    ctx.fillStyle = "#64748b";
    ctx.font = "30px monospace";
    ctx.fillText("$ awaiting spec to scaffold MVP…", 48, 150);
    return;
  }

  const recent = buildMessages.slice(-6);
  ctx.font = "26px monospace";
  recent.forEach((entry, idx) => {
    const isLatest = idx === recent.length - 1;
    ctx.fillStyle = isLatest ? "#34d399" : "#94a3b8";
    drawWrappedText(
      ctx,
      `> ${entry.message}`,
      42,
      118 + idx * 72,
      w - 84,
      32,
      2
    );
  });
}

export function drawCodeScreen(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  offset: number
) {
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, w, h);
  const colors = ["#5DCAA5", "#85B7EB", "#EF9F27", "#c9d1d9"];
  for (let i = 0; i < 14; i += 1) {
    ctx.fillStyle = colors[(i + offset) % 4];
    const x = 16 + ((i * 37 + offset * 13) % 64);
    const barW = 80 + ((i * 53 + offset * 7) % 290);
    ctx.fillRect(x, 14 + i * 21, barW, 9);
  }
}

export function drawLabMonitor(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  persona: PersonaState | null,
  deskIdx: number,
  mvpImage: HTMLImageElement | null
) {
  ctx.fillStyle = "#0c111a";
  ctx.fillRect(0, 0, w, h);

  // MVP thumbnail in top area
  const thumbH = Math.round(h * 0.62);
  if (mvpImage) {
    const scale = Math.max(w / mvpImage.width, thumbH / mvpImage.height);
    const dw = mvpImage.width * scale;
    const dh = mvpImage.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, thumbH);
    ctx.clip();
    ctx.drawImage(mvpImage, (w - dw) / 2, (thumbH - dh) / 2, dw, dh);
    ctx.restore();
  } else {
    ctx.fillStyle = "#162032";
    ctx.fillRect(0, 0, w, thumbH);
    ctx.fillStyle = "#334155";
    ctx.fillRect(24, 24, w - 48, 28);
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(24, 66, w - 120, 76);
  }

  // Bottom bar with persona name + status
  ctx.fillStyle = "#090d14";
  ctx.fillRect(0, thumbH, w, h - thumbH);

  const statusColor = !persona
    ? "#475569"
    : persona.status === "converted"
    ? "#34d399"
    : persona.status === "quit"
    ? "#f43f5e"
    : "#f59e0b";

  ctx.fillStyle = statusColor;
  ctx.fillRect(0, thumbH, w, 6);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 32px system-ui, sans-serif";
  ctx.fillText(
    persona ? persona.name.slice(0, 20) : `Station 0${deskIdx + 1}`,
    20,
    thumbH + 48
  );

  ctx.fillStyle = statusColor;
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.fillText(
    persona ? persona.status.toUpperCase() : "IDLE",
    20,
    thumbH + 84
  );
}

function formatRubricName(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function drawMarketBoard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  progress: SwarmProgressData | null,
  result: SwarmResultData | null
) {
  ctx.fillStyle = "#0e121b";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#a78bfa";
  ctx.fillRect(0, 0, w, 12);

  ctx.fillStyle = "#c4b5fd";
  ctx.font = "bold 28px system-ui, sans-serif";
  ctx.fillText("MARKET FLOOR · 200-BUYER SWARM", 44, 62);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px system-ui, sans-serif";
  ctx.fillText("Expected buyers (mean intent)", 44, 114);

  if (!result) {
    const done = progress?.done ?? 0;
    const total = progress?.total ?? 200;
    const pct = total > 0 ? Math.min(1, done / total) : 0;

    ctx.fillStyle = "#94a3b8";
    ctx.font = "30px system-ui, sans-serif";
    ctx.fillText(
      progress ? `Evaluating ${done} / ${total} synthetic buyers…` : "Awaiting buyer swarm…",
      44,
      195
    );

    drawRoundedRect(ctx, 44, 240, w - 88, 36, 18);
    ctx.fillStyle = "#1e293b";
    ctx.fill();

    if (pct > 0) {
      drawRoundedRect(ctx, 44, 240, Math.max(36, (w - 88) * pct), 36, 18);
      ctx.fillStyle = "#38bdf8";
      ctx.fill();
    }
    return;
  }

  const expectedBuyers = Math.round(
    Math.max(0, Math.min(1, result.intent_mean)) * 200
  );
  const pct = Math.round(Math.max(0, Math.min(1, result.intent_mean)) * 100);

  ctx.fillStyle = "#34d399";
  ctx.font = "bold 76px system-ui, sans-serif";
  ctx.fillText(`${expectedBuyers} / 200`, 44, 206);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 32px system-ui, sans-serif";
  ctx.fillText(`(${pct}% mean intent)`, 365, 198);

  // 5 rubric means as horizontal bars, lowest one highlighted
  const entries = Object.entries(result.rubrics || {}).slice(0, 5);
  if (entries.length === 0) return;

  let lowestIdx = 0;
  let lowestVal = Number.POSITIVE_INFINITY;
  entries.forEach(([, val], idx) => {
    if (val < lowestVal) {
      lowestVal = val;
      lowestIdx = idx;
    }
  });

  const startY = 258;
  const rowH = 68;
  const barX = 330;
  const barW = w - barX - 115;

  entries.forEach(([key, rawVal], idx) => {
    const val = Math.max(0, Math.min(1, rawVal));
    const isLowest = idx === lowestIdx;
    const y = startY + idx * rowH;

    ctx.fillStyle = isLowest ? "#fb7185" : "#e2e8f0";
    ctx.font = isLowest ? "bold 25px system-ui, sans-serif" : "24px system-ui, sans-serif";
    const label = formatRubricName(key).slice(0, 22);
    ctx.fillText(isLowest ? `▼ ${label}` : label, 44, y + 26);

    drawRoundedRect(ctx, barX, y + 4, barW, 30, 8);
    ctx.fillStyle = "#1e293b";
    ctx.fill();

    drawRoundedRect(ctx, barX, y + 4, Math.max(12, barW * val), 30, 8);
    ctx.fillStyle = isLowest ? "#f43f5e" : "#5DCAA5";
    ctx.fill();

    ctx.fillStyle = isLowest ? "#fda4af" : "#cbd5e1";
    ctx.font = "bold 25px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(val * 100)}%`, w - 40, y + 27);
    ctx.textAlign = "left";
  });
}

function getAnalystFraming(verdict: VerdictData): string | null {
  if ("analyst_framing" in verdict) {
    const maybe = (verdict as VerdictData & { analyst_framing?: unknown }).analyst_framing;
    if (typeof maybe === "string" && maybe.trim().length > 0) {
      return maybe.trim();
    }
  }
  if (typeof verdict.analyst_reason === "string" && verdict.analyst_reason.trim().length > 0) {
    return verdict.analyst_reason.trim();
  }
  return null;
}

export function drawVerdictBoard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  verdict: VerdictData | null
) {
  ctx.fillStyle = "#0e1017";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#EF9F27";
  ctx.fillRect(0, 0, w, 14);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 28px system-ui, sans-serif";
  ctx.fillText("LAUNCH VERDICT", 54, 68);

  if (!verdict) {
    ctx.fillStyle = "#475569";
    ctx.font = "bold 160px system-ui, sans-serif";
    ctx.fillText("--%", 54, 270);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "32px system-ui, sans-serif";
    ctx.fillText("Synthesizing lab, swarm & analyst forecast…", 54, 350);
    return;
  }

  const probPct = Math.round(
    Math.max(0, Math.min(1, verdict.launch_probability)) * 100
  );
  const probColor =
    probPct >= 65 ? "#34d399" : probPct >= 40 ? "#EF9F27" : "#fb7185";

  ctx.fillStyle = probColor;
  ctx.font = "bold 168px system-ui, sans-serif";
  ctx.fillText(`${probPct}%`, 50, 240);

  // Summary beside percentage
  ctx.fillStyle = "#f1f5f9";
  ctx.font = "28px system-ui, sans-serif";
  drawWrappedText(ctx, verdict.summary || "", 455, 118, w - 500, 38, 4);

  // First 3 failure modes
  ctx.fillStyle = "#fb7185";
  ctx.font = "bold 24px system-ui, sans-serif";
  ctx.fillText("TOP FAILURE MODES", 54, 326);

  const modes = verdict.failure_modes.slice(0, 3);
  modes.forEach((mode, idx) => {
    const y = 350 + idx * 62;
    drawRoundedRect(ctx, 54, y, w - 108, 48, 10);
    ctx.fillStyle = "rgba(244, 63, 94, 0.14)";
    ctx.fill();
    ctx.strokeStyle = "rgba(244, 63, 94, 0.4)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#fecdd3";
    ctx.font = "25px system-ui, sans-serif";
    drawWrappedText(ctx, `!  ${mode}`, 74, y + 32, w - 148, 30, 1);
  });

  // Small assumed framing / analyst reason
  const framing = getAnalystFraming(verdict);
  if (framing) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "italic 22px system-ui, sans-serif";
    drawWrappedText(ctx, `assumed: ${framing}`, 54, h - 42, w - 108, 26, 2);
  }
}

export function drawTeleprompter(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  brief: FounderBriefData | null
) {
  ctx.fillStyle = "#090c13";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, w - 8, h - 8);

  if (!brief) {
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 26px system-ui, sans-serif";
    ctx.fillText("FOUNDER TELEPROMPTER", 42, 62);
    ctx.fillStyle = "#64748b";
    ctx.font = "34px system-ui, sans-serif";
    ctx.fillText("Listening for judge challenges…", 42, 165);
    return;
  }

  const badgeColors =
    brief.badge === "VERIFIED"
      ? { bg: "rgba(16,185,129,0.22)", fg: "#34d399", label: "VERIFIED" }
      : brief.badge === "PARTIAL"
      ? { bg: "rgba(245,158,11,0.22)", fg: "#fbbf24", label: "PARTIAL" }
      : { bg: "rgba(244,63,94,0.22)", fg: "#fb7185", label: "PUSH BACK" };

  drawRoundedRect(ctx, 40, 32, 230, 52, 26);
  ctx.fillStyle = badgeColors.bg;
  ctx.fill();
  ctx.strokeStyle = badgeColors.fg;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = badgeColors.fg;
  ctx.font = "bold 28px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(badgeColors.label, 155, 67);
  ctx.textAlign = "left";

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 46px system-ui, sans-serif";
  drawWrappedText(ctx, brief.line, 42, 148, w - 84, 56, 3);

  // Proof pills
  const pills = (brief.proof || []).slice(0, 3);
  let pillX = 42;
  const pillY = h - 76;
  ctx.font = "bold 22px system-ui, sans-serif";
  pills.forEach((p) => {
    const text = `${p.label}: ${p.value}`;
    const textW = ctx.measureText(text).width + 36;
    if (pillX + textW > w - 32) return;
    drawRoundedRect(ctx, pillX, pillY, textW, 44, 22);
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fill();
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(text, pillX + 18, pillY + 29);
    pillX += textW + 14;
  });
}

export function drawCaptionTicker(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  caption: string | null,
  latestUtterance: RoomUtteranceData | null
) {
  ctx.fillStyle = "#111622";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(0, 0, 14, h);

  const text = caption || latestUtterance?.text || "Live caption ticker · standby";
  const prefix = caption ? "LIVE  " : latestUtterance ? "LAST  " : "";

  ctx.fillStyle = caption ? "#38bdf8" : "#94a3b8";
  ctx.font = "bold 26px system-ui, sans-serif";
  ctx.fillText(prefix, 30, h / 2 + 9);

  ctx.fillStyle = caption ? "#f8fafc" : "#cbd5e1";
  ctx.font = "28px system-ui, sans-serif";
  drawWrappedText(ctx, text, prefix ? 124 : 30, h / 2 + 10, w - 150, 32, 1);
}

export function drawNameplate(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  role: string
) {
  ctx.fillStyle = "#f5f1e8";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#222222";
  ctx.font = "bold 28px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(role.slice(0, 18), w / 2, h / 2 + 2);
}
