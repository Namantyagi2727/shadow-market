"use client";

import React, { useMemo, useState } from "react";
import { MapPin, Users } from "lucide-react";
import type { SessionEvent } from "@/components/session/useSessionEvents";
import { C, MarketCircles, parseMarketSizes } from "./charts";
import {
  formatPrice,
  type PitchCompetitor,
  type PitchResearchData,
} from "./types";

export interface PitchSnapshotProps {
  research: PitchResearchData | null;
  events: SessionEvent[];
  reveal: boolean;
}

interface MarketSizeItem {
  label: string;
  value: number;
  text: string;
}

interface PricedCompetitor {
  title: string;
  price: number;
}

function findLatestMarketSizes(events: SessionEvent[]): MarketSizeItem[] {
  for (let i = events.length - 1; i >= 0; i--) {
    const evt = events[i];
    if (evt.type !== "expert_note") continue;
    const raw: unknown = evt.data;
    if (!raw || typeof raw !== "object") continue;
    const data = raw as Record<string, unknown>;
    if (data.expert_id !== "market") continue;
    const headline = typeof data.headline === "string" ? data.headline : "";
    const message = typeof data.message === "string" ? data.message : "";
    return parseMarketSizes(`${headline} ${message}`);
  }
  return [];
}

function isPricedCompetitor(
  item: PitchCompetitor
): item is PitchCompetitor & { price_usd: number } {
  return (
    typeof item.price_usd === "number" &&
    Number.isFinite(item.price_usd) &&
    item.price_usd >= 0
  );
}

function PricePositionStrip({
  competitors,
  pitchPrice,
}: {
  competitors: PricedCompetitor[];
  pitchPrice: number;
}) {
  const sorted = useMemo(
    () => [...competitors].sort((a, b) => a.price - b.price),
    [competitors]
  );

  const compMin = sorted[0].price;
  const compMax = sorted[sorted.length - 1].price;
  const scaleMin = Math.min(compMin, pitchPrice);
  const scaleMax = Math.max(compMax, pitchPrice);
  const span = scaleMax - scaleMin;
  const toPct = (price: number): number =>
    span > 0 ? ((price - scaleMin) / span) * 100 : 50;

  const rangeLeft = toPct(compMin);
  const rangeRight = toPct(compMax);
  const pitchPct = toPct(pitchPrice);

  const dots = useMemo(() => {
    const bucketCounts = new Map<number, number>();
    const rawDots = sorted.map((comp) => {
      const pct = span > 0 ? ((comp.price - scaleMin) / span) * 100 : 50;
      const bucket = Math.round(pct / 3);
      bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
      return { comp, pct, bucket };
    });

    const bucketSeen = new Map<number, number>();
    return rawDots.map((dot) => {
      const total = bucketCounts.get(dot.bucket) ?? 1;
      const idx = bucketSeen.get(dot.bucket) ?? 0;
      bucketSeen.set(dot.bucket, idx + 1);
      const rawOffset = total > 1 ? (idx - (total - 1) / 2) * 5 : 0;
      const yOffset = Math.max(-6, Math.min(6, rawOffset));
      return { ...dot, yOffset };
    });
  }, [sorted, scaleMin, span]);

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[11px]">
        <span className="truncate text-[#5F6368]">Price position</span>
        <span
          className="shrink-0 font-medium tabular-nums"
          style={{ color: C.yellow }}
        >
          This pitch {formatPrice(pitchPrice)}
        </span>
      </div>

      <div className="px-2 py-2">
        <div className="relative h-1.5 rounded-full bg-[#2A2B30]">
          {rangeRight > rangeLeft && (
            <div
              className="absolute inset-y-0 rounded-full"
              style={{
                left: `${rangeLeft}%`,
                width: `${rangeRight - rangeLeft}%`,
                background: `${C.purple}45`,
              }}
            />
          )}

          {dots.map((dot, idx) => (
            <span
              key={`${dot.comp.title}-${idx}`}
              role="img"
              aria-label={`${dot.comp.title} ${formatPrice(dot.comp.price)}`}
              title={`${dot.comp.title} · ${formatPrice(dot.comp.price)}`}
              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[#16171A] transition-transform hover:z-20 hover:scale-125"
              style={{
                left: `${dot.pct}%`,
                marginTop: `${dot.yOffset}px`,
                background: C.purple,
              }}
            />
          ))}

          <span
            role="img"
            aria-label={`This pitch ${formatPrice(pitchPrice)}`}
            title={`This pitch · ${formatPrice(pitchPrice)}`}
            className="absolute top-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[#16171A]"
            style={{
              left: `${pitchPct}%`,
              background: C.yellow,
              boxShadow: "0 0 0 2px rgba(253, 214, 99, 0.22)",
            }}
          />
        </div>
      </div>

      <div className="mt-0.5 flex items-center justify-between gap-1 text-[10px] tabular-nums text-[#5F6368]">
        <span>{formatPrice(scaleMin)}</span>
        <span className="truncate">
          {sorted.length} {sorted.length === 1 ? "rival" : "rivals"}
        </span>
        {scaleMax > scaleMin && <span>{formatPrice(scaleMax)}</span>}
      </div>
    </div>
  );
}

export function PitchSnapshot({
  research,
  events,
  reveal,
}: PitchSnapshotProps) {
  const [expanded, setExpanded] = useState(false);

  const marketSizes = useMemo(() => findLatestMarketSizes(events), [events]);

  const pricedCompetitors = useMemo<PricedCompetitor[]>(() => {
    if (!research) return [];
    return research.competitors
      .filter(isPricedCompetitor)
      .map((c) => ({ title: c.title, price: c.price_usd }));
  }, [research]);

  if (!reveal || !research) return null;

  const pitch = research.pitch;
  const title = pitch?.title?.trim() ?? "";
  const oneLiner = pitch?.one_liner?.trim() ?? "";
  const targetUser = pitch?.target_user?.trim() ?? "";
  const location = pitch?.location?.trim() ?? "";
  const pitchPrice =
    typeof pitch?.price_usd === "number" &&
    Number.isFinite(pitch.price_usd) &&
    pitch.price_usd >= 0
      ? pitch.price_usd
      : null;

  const hasLeft = Boolean(title || oneLiner || targetUser || location);
  const hasMarket = marketSizes.length > 0;
  const hasPrice = pricedCompetitors.length >= 1 && pitchPrice !== null;

  if (!hasLeft && !hasMarket && !hasPrice) return null;

  const leftBlock = hasLeft ? (
    <div className="min-w-0">
      {title && (
        <h2
          className="truncate text-[14px] font-medium leading-snug text-[#E8EAED]"
          title={title}
        >
          {title}
        </h2>
      )}
      {oneLiner && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          title={expanded ? undefined : oneLiner}
          className="mt-0.5 block w-full text-left text-[12px] leading-snug text-[#9AA0A6] transition-colors hover:text-[#E8EAED]"
        >
          <span className={expanded ? "" : "line-clamp-1"}>{oneLiner}</span>
        </button>
      )}
      {(targetUser || location) && (
        <div className="mt-1.5 flex items-center gap-1.5 overflow-hidden">
          {targetUser && (
            <span
              title={targetUser}
              className="inline-flex min-w-0 items-center gap-1 rounded-[8px] border border-[#2A2B30] bg-[#0E0F11] px-2 py-0.5 text-[11px] text-[#9AA0A6]"
            >
              <Users
                className="h-3 w-3 shrink-0"
                style={{ color: C.blue }}
                strokeWidth={1.75}
              />
              <span className="truncate">{targetUser}</span>
            </span>
          )}
          {location && (
            <span
              title={location}
              className="inline-flex max-w-[45%] shrink-0 items-center gap-1 rounded-[8px] border border-[#2A2B30] bg-[#0E0F11] px-2 py-0.5 text-[11px] text-[#9AA0A6]"
            >
              <MapPin
                className="h-3 w-3 shrink-0"
                style={{ color: C.purple }}
                strokeWidth={1.75}
              />
              <span className="truncate">{location}</span>
            </span>
          )}
        </div>
      )}
    </div>
  ) : null;

  const marketBlock = hasMarket ? (
    <div className="min-w-0 [&_svg]:h-[72px] [&_svg]:w-[72px] [&_svg]:shrink-0">
      <MarketCircles sizes={marketSizes} />
    </div>
  ) : null;

  const priceBlock =
    hasPrice && pitchPrice !== null ? (
      <PricePositionStrip
        competitors={pricedCompetitors}
        pitchPrice={pitchPrice}
      />
    ) : null;

  return (
    <section
      aria-label="Pitch snapshot"
      className="judge-fade-in mb-4 shrink-0 rounded-[14px] border border-[#2A2B30] bg-[#16171A] px-3.5 py-2.5"
    >
      {hasLeft && hasMarket && hasPrice ? (
        <div className="grid grid-cols-1 gap-2 min-[1800px]:grid-cols-[minmax(0,1.1fr)_auto_minmax(0,1fr)] min-[1800px]:items-center min-[1800px]:gap-3.5">
          {leftBlock}
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3.5 border-t border-[#2A2B30]/70 pt-2 min-[1800px]:contents">
            <div className="min-w-0 min-[1800px]:border-l min-[1800px]:border-[#2A2B30]/70 min-[1800px]:pl-3.5">
              {marketBlock}
            </div>
            <div className="min-w-0 min-[1800px]:border-l min-[1800px]:border-[#2A2B30]/70 min-[1800px]:pl-3.5">
              {priceBlock}
            </div>
          </div>
        </div>
      ) : hasMarket && hasPrice ? (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3.5">
          {marketBlock}
          <div className="min-w-0 border-l border-[#2A2B30]/70 pl-3.5">
            {priceBlock}
          </div>
        </div>
      ) : hasMarket && hasLeft ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3.5">
          {leftBlock}
          <div className="min-w-0 border-l border-[#2A2B30]/70 pl-3.5">
            {marketBlock}
          </div>
        </div>
      ) : hasPrice && hasLeft ? (
        <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-center gap-3.5">
          {leftBlock}
          <div className="min-w-0 border-l border-[#2A2B30]/70 pl-3.5">
            {priceBlock}
          </div>
        </div>
      ) : (
        <div className="min-w-0">
          {leftBlock}
          {marketBlock}
          {priceBlock}
        </div>
      )}
    </section>
  );
}
