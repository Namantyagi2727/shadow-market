"use client";

/**
 * Tiny dependency-free SVG chart kit for the judges' screen.
 * Every chart takes real numbers from the run; callers must hide a chart when its data is missing.
 * Palette: Gemini dark (#E8EAED text, #9AA0A6 secondary, #5F6368 muted, #2A2B30 tracks).
 */

import React from "react";

export const C = {
  blue: "#4285F4",
  purple: "#9B72CB",
  pink: "#D96570",
  green: "#81C995",
  yellow: "#FDD663",
  cyan: "#78D9EC",
  red: "#F28B82",
  text: "#E8EAED",
  sub: "#9AA0A6",
  muted: "#5F6368",
  track: "#2A2B30",
};

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/** Donut showing one share (0..1) of a whole, with a big % in the middle. */
export function Donut({
  value,
  size = 88,
  stroke = 10,
  color = C.blue,
  label,
  sublabel,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
  sublabel?: string;
}) {
  const v = clamp01(value);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(v * 100)}%${label ? ` ${label}` : ""}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circ * v} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 600ms ease-out" }}
        />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill={C.text} fontSize={size * 0.24} fontWeight={500}>
          {Math.round(v * 100)}%
        </text>
      </svg>
      {(label || sublabel) && (
        <div className="min-w-0">
          {label && <div className="text-[13px] text-[#E8EAED]">{label}</div>}
          {sublabel && <div className="text-[11px] text-[#9AA0A6]">{sublabel}</div>}
        </div>
      )}
    </div>
  );
}

/** Half-circle gauge (0..1) with optional reference tick (e.g. a 50% base rate). */
export function Gauge({
  value,
  width = 150,
  color = C.blue,
  refValue,
  refLabel,
  caption,
}: {
  value: number;
  width?: number;
  color?: string;
  refValue?: number;
  refLabel?: string;
  caption?: string;
}) {
  const v = clamp01(value);
  const stroke = 12;
  const r = width / 2 - stroke;
  const cx = width / 2;
  const cy = width / 2;
  const arc = (t: number) => {
    const a = Math.PI * (1 - t);
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
  };
  const [ex, ey] = arc(v);
  const large = 0;
  const h = width / 2 + 8;
  const refPt = refValue !== undefined ? arc(clamp01(refValue)) : null;
  return (
    <div className="flex flex-col items-center">
      <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} role="img" aria-label={`${Math.round(v * 100)}%`}>
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={C.track} strokeWidth={stroke} strokeLinecap="round" />
        {v > 0 && (
          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
        )}
        {refPt && (
          <line x1={refPt[0]} y1={refPt[1] - 9} x2={refPt[0]} y2={refPt[1] + 9} stroke={C.sub} strokeWidth={2} />
        )}
        <text x={cx} y={cy - 4} textAnchor="middle" fill={C.text} fontSize={width * 0.2} fontWeight={500}>
          {Math.round(v * 100)}%
        </text>
      </svg>
      {(caption || refLabel) && (
        <div className="mt-0.5 text-center text-[11px] text-[#9AA0A6]">
          {caption}
          {refLabel && <span className="text-[#5F6368]">{caption ? " · " : ""}{refLabel}</span>}
        </div>
      )}
    </div>
  );
}

/** Horizontal bars for 0..1 scores; `highlight` keys turn red. */
export function ScoreBars({
  items,
  highlight = [],
  color = C.blue,
}: {
  items: { key: string; label: string; value: number }[];
  highlight?: string[];
  color?: string;
}) {
  return (
    <div className="space-y-1.5">
      {items.map((it) => {
        const v = clamp01(it.value);
        const hot = highlight.includes(it.key);
        return (
          <div key={it.key} className="grid grid-cols-[minmax(0,7.5rem)_1fr_2.5rem] items-center gap-2 text-[12px]">
            <span className={`truncate ${hot ? "text-[#F28B82]" : "text-[#9AA0A6]"}`}>{it.label}</span>
            <div className="h-2 overflow-hidden rounded-full bg-[#2A2B30]">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(2, v * 100)}%`, background: hot ? C.red : color, transition: "width 600ms ease-out" }}
              />
            </div>
            <span className={`text-right tabular-nums ${hot ? "text-[#F28B82]" : "text-[#E8EAED]"}`}>{Math.round(v * 100)}%</span>
          </div>
        );
      })}
    </div>
  );
}

/** Price comparison: one bar per product, the founder's price highlighted. */
export function PriceBars({
  items,
  yourPrice,
  yourLabel = "You",
}: {
  items: { label: string; price: number }[];
  yourPrice?: number | null;
  yourLabel?: string;
}) {
  const rows = [...items];
  if (typeof yourPrice === "number" && yourPrice > 0) rows.push({ label: yourLabel, price: yourPrice });
  const max = Math.max(1, ...rows.map((r) => r.price));
  rows.sort((a, b) => a.price - b.price);
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => {
        const you = r.label === yourLabel && r.price === yourPrice;
        return (
          <div key={`${r.label}-${i}`} className="grid grid-cols-[minmax(0,7.5rem)_1fr_3.5rem] items-center gap-2 text-[12px]">
            <span className={`truncate ${you ? "font-medium text-[#FDD663]" : "text-[#9AA0A6]"}`} title={r.label}>{r.label}</span>
            <div className="h-2 overflow-hidden rounded-full bg-[#2A2B30]">
              <div className="h-full rounded-full" style={{ width: `${(r.price / max) * 100}%`, background: you ? C.yellow : C.purple }} />
            </div>
            <span className={`text-right tabular-nums ${you ? "text-[#FDD663]" : "text-[#E8EAED]"}`}>${r.price.toFixed(r.price < 100 ? 2 : 0)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Nested circles for market sizes (TAM ⊃ SAM ⊃ SOM), areas proportional to value. */
export function MarketCircles({ sizes }: { sizes: { label: string; value: number; text: string }[] }) {
  const s = sizes.filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 3);
  if (s.length === 0) return null;
  const W = 120;
  const max = s[0].value;
  const colors = [C.blue, C.purple, C.pink];
  return (
    <div className="flex items-center gap-3">
      <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`} role="img" aria-label="Market size">
        {s.map((x, i) => {
          const r = Math.max(6, (W / 2 - 2) * Math.sqrt(x.value / max));
          return <circle key={x.label} cx={W / 2} cy={W - 2 - r} r={r} fill={colors[i]} fillOpacity={0.18 + i * 0.12} stroke={colors[i]} strokeWidth={1.5} />;
        })}
      </svg>
      <div className="space-y-1 text-[12px]">
        {s.map((x, i) => (
          <div key={x.label} className="flex items-baseline gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colors[i] }} />
            <span className="text-[#9AA0A6]">{x.label}</span>
            <span className="tabular-nums text-[#E8EAED]">{x.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One big number with a short label (e.g. the key stat inside a question's evidence). */
export function BigStat({ value, label, color = C.text }: { value: string; label?: string; color?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[28px] font-medium leading-none tabular-nums" style={{ color }}>{value}</span>
      {label && <span className="mt-1 text-[11px] text-[#9AA0A6]">{label}</span>}
    </div>
  );
}

/** Stacked bar of counts (e.g. insights vs risks in the team channel). */
export function StackBar({ parts }: { parts: { label: string; count: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.count, 0);
  if (total === 0) return null;
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-[#2A2B30]">
        {parts.map((p) => (p.count > 0 ? <div key={p.label} style={{ width: `${(p.count / total) * 100}%`, background: p.color }} /> : null))}
      </div>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-[#9AA0A6]">
        {parts.map((p) => (
          <span key={p.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.count} {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- parsers: pull real numbers out of research text (never invent) ---------- */

const MULT: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9, t: 1e12, trillion: 1e12 };

/** "$5.1B" / "$200M–$500M" / "$12 million" → number (first value of a range). */
export function parseMoney(s: string): number | null {
  const m = s.match(/\$\s?([\d.,]+)\s?(k|thousand|mm|m|million|bn|b|billion|t|trillion)?\b/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const mult = m[2] ? MULT[m[2].toLowerCase()] ?? 1 : 1;
  return n * mult;
}

/** Finds TAM / SAM / SOM values in free text, e.g. "$200M–$500M U.S. SAM … $5.14B global TAM". */
export function parseMarketSizes(text: string): { label: string; value: number; text: string }[] {
  const out: { label: string; value: number; text: string }[] = [];
  for (const key of ["TAM", "SAM", "SOM"]) {
    const re = new RegExp(
      `(\\$\\s?[\\d.,]+\\s?(?:k|thousand|mm|m|million|bn|b|billion|t|trillion)?(?:\\s?[–-]\\s?\\$?\\s?[\\d.,]+\\s?(?:k|thousand|mm|m|million|bn|b|billion|t|trillion)?)?)[^$.;]{0,40}?\\b${key}\\b|\\b${key}\\b[^$.;]{0,40}?(\\$\\s?[\\d.,]+\\s?(?:k|thousand|mm|m|million|bn|b|billion|t|trillion)?(?:\\s?[–-]\\s?\\$?\\s?[\\d.,]+\\s?(?:k|thousand|mm|m|million|bn|b|billion|t|trillion)?)?)`,
      "i"
    );
    const m = text.match(re);
    const raw = m ? (m[1] || m[2]) : null;
    if (raw) {
      const v = parseMoney(raw);
      if (v) out.push({ label: key, value: v, text: raw.replace(/\s+/g, " ").trim() });
    }
  }
  return out;
}

/** The first striking number in a sentence: a %, a $ amount, or "N of M". Returns display text. */
export function extractStat(text: string): string | null {
  const pct = text.match(/\b(\d{1,3}(?:\.\d+)?)\s?%/);
  if (pct) return `${pct[1]}%`;
  const ofm = text.match(/\b(\d{1,4})\s?(?:\/|of)\s?(\d{1,4})\b/);
  if (ofm) return `${ofm[1]}/${ofm[2]}`;
  const money = text.match(/\$\s?[\d.,]+\s?(?:k|m|b|bn|million|billion)?\b/i);
  if (money) return money[0].replace(/\s+/g, "");
  const dec = text.match(/\b0\.\d{1,3}\b/);
  if (dec) return `${Math.round(parseFloat(dec[0]) * 100)}%`;
  return null;
}
