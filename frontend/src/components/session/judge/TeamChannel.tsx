"use client";

import React, { useEffect, useRef, useState } from "react";
import { Globe } from "lucide-react";
import type { SessionEvent } from "@/components/session/useSessionEvents";
import {
  BigStat,
  C,
  extractStat,
  MarketCircles,
  parseMarketSizes,
  StackBar,
} from "./charts";

/** The judges' support team: six AI specialists working on the pitch in parallel (expert_status / expert_note). */
const TEAM: { id: string; name: string; role: string; color: string }[] = [
  { id: "market", name: "Maya", role: "Market analyst", color: C.blue },
  { id: "rivals", name: "Theo", role: "Competitive intel", color: C.purple },
  { id: "history", name: "Iris", role: "Startup historian", color: C.pink },
  { id: "gtm", name: "Ravi", role: "Go-to-market", color: C.green },
  { id: "social", name: "Zoe", role: "Social media", color: C.yellow },
  { id: "sales", name: "Marco", role: "Sales lead", color: C.cyan },
];

type NoteKind = "insight" | "risk" | "question";

interface ExpertNote {
  expert_id: string;
  name: string;
  role: string;
  headline: string;
  message: string;
  kind: NoteKind;
  question: string | null;
  sources: string[];
  web: boolean;
  latency_ms: number;
}

const KIND_STYLE: Record<NoteKind, string> = {
  insight: "text-[#81C995] border-[#81C995]/30 bg-[#81C995]/10",
  risk: "text-[#F28B82] border-[#F28B82]/30 bg-[#F28B82]/10",
  question: "text-[#FDD663] border-[#FDD663]/30 bg-[#FDD663]/10",
};

const KIND_STAT_COLOR: Record<NoteKind, string> = {
  insight: C.green,
  risk: C.red,
  question: C.yellow,
};

function domain(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    return h.includes("vertexaisearch") ? "web search" : h;
  } catch {
    return "web";
  }
}

function ExpertNoteCard({
  note,
  avatarColor,
}: {
  note: ExpertNote;
  avatarColor: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const [askExpanded, setAskExpanded] = useState(false);
  const msgRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const el = msgRef.current;
    if (!el || expanded) return;
    setCanExpand(el.scrollHeight > el.clientHeight + 1);
  }, [note.message, expanded]);

  const combinedText = `${note.headline} ${note.message}`;
  const stat = extractStat(combinedText);
  const marketSizes =
    note.expert_id === "market" ? parseMarketSizes(combinedText) : [];
  const uniqueSources = Array.from(new Set(note.sources.map(domain)));

  return (
    <article className="judge-fade-in rounded-[14px] border border-[#2A2B30] bg-[#16171A] p-3.5">
      {/* Header: avatar + name + role + kind tag on one line */}
      <div className="flex min-w-0 items-center gap-2">
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium text-[#0E0F11]"
          style={{ background: avatarColor }}
        >
          {note.name[0]}
        </div>
        <span className="truncate text-[13px] font-medium text-[#E8EAED]">
          {note.name}
        </span>
        {note.role && (
          <span className="truncate text-[11px] text-[#5F6368]">{note.role}</span>
        )}
        <span
          className={`ml-auto shrink-0 rounded-[8px] border px-1.5 py-px text-[10px] ${KIND_STYLE[note.kind]}`}
        >
          {note.kind}
        </span>
      </div>

      {/* Headline (15px) + BigStat on the right when a stat exists */}
      <div className="mt-2 flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-[15px] font-medium leading-snug text-[#E8EAED]">
          {note.headline}
        </p>
        {stat && (
          <div className="shrink-0 text-right">
            <BigStat value={stat} color={KIND_STAT_COLOR[note.kind]} />
          </div>
        )}
      </div>

      {/* Message body clamped to 2 lines with more/less toggle */}
      {note.message && (
        <div className="mt-1">
          <p
            ref={msgRef}
            onClick={() => {
              if (canExpand || expanded) setExpanded((v) => !v);
            }}
            className={`text-[13px] leading-snug text-[#9AA0A6] ${
              expanded ? "" : "line-clamp-2"
            } ${canExpand || expanded ? "cursor-pointer" : ""}`}
          >
            {note.message}
          </p>
          {(canExpand || expanded) && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-0.5 text-[11px] text-[#5F6368] transition-colors hover:text-[#E8EAED]"
            >
              {expanded ? "less" : "more"}
            </button>
          )}
        </div>
      )}

      {/* Maya's market sizes visualization when real numbers exist */}
      {marketSizes.length > 0 && (
        <div className="mt-2.5 rounded-[10px] border border-[#2A2B30]/80 bg-[#0E0F11]/60 px-3 py-2">
          <MarketCircles sizes={marketSizes} />
        </div>
      )}

      {/* Suggested Ask question highlighted in yellow, clamped to 2 lines */}
      {note.question && (
        <p
          onClick={() => setAskExpanded((v) => !v)}
          title={note.question}
          className={`mt-2 cursor-pointer rounded-[8px] border border-[#FDD663]/20 bg-[#FDD663]/[0.07] px-2.5 py-1.5 text-[12px] leading-snug text-[#FDD663] ${
            askExpanded ? "" : "line-clamp-2"
          }`}
        >
          <span className="font-medium">Ask:</span> “{note.question}”
        </p>
      )}

      {/* Sources as tiny chips */}
      {uniqueSources.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {uniqueSources.map((src) => (
            <span
              key={src}
              className="inline-flex items-center gap-1 rounded-[6px] border border-[#2A2B30] bg-[#0E0F11] px-1.5 py-0.5 text-[10px] text-[#9AA0A6]"
            >
              <Globe className="h-2.5 w-2.5 shrink-0 text-[#5F6368]" strokeWidth={1.75} />
              <span>{src}</span>
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

export function TeamChannel({ events, reveal = true }: { events: SessionEvent[]; reveal?: boolean }) {
  const state: Record<string, string> = {};
  const notes: ExpertNote[] = [];
  for (const e of events) {
    const raw = e.data as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object") continue;

    if (e.type === "expert_status") {
      const expertId = typeof raw.expert_id === "string" ? raw.expert_id : "";
      const expertState = typeof raw.state === "string" ? raw.state : "";
      if (expertId && expertState) state[expertId] = expertState;
    }

    if (e.type === "expert_note") {
      const expertId = typeof raw.expert_id === "string" ? raw.expert_id : "";
      if (!expertId) continue;
      state[expertId] = "done";
      const member = TEAM.find((t) => t.id === expertId);
      const kind: NoteKind =
        raw.kind === "risk" || raw.kind === "question" ? raw.kind : "insight";
      const note: ExpertNote = {
        expert_id: expertId,
        name: typeof raw.name === "string" && raw.name ? raw.name : member?.name ?? expertId,
        role: typeof raw.role === "string" && raw.role ? raw.role : member?.role ?? "",
        headline: typeof raw.headline === "string" ? raw.headline : "",
        message: typeof raw.message === "string" ? raw.message : "",
        kind,
        question:
          typeof raw.question === "string" && raw.question.trim()
            ? raw.question.trim()
            : null,
        sources: Array.isArray(raw.sources)
          ? raw.sources.filter((s): s is string => typeof s === "string")
          : [],
        web: Boolean(raw.web),
        latency_ms: typeof raw.latency_ms === "number" ? raw.latency_ms : 0,
      };
      // Keep only the latest note per specialist (research can re-run while the pitch grows).
      const idx = notes.findIndex((n) => n.expert_id === expertId);
      if (idx >= 0) notes.splice(idx, 1);
      notes.push(note);
    }
  }
  const color = (id: string) => TEAM.find((t) => t.id === id)?.color ?? "#9AA0A6";

  const visibleNotes = reveal ? notes : [];
  const insightCount = visibleNotes.filter((n) => n.kind === "insight").length;
  const riskCount = visibleNotes.filter((n) => n.kind === "risk").length;
  const questionCount = visibleNotes.filter((n) => n.kind === "question").length;
  const stackParts = [
    ...(insightCount > 0
      ? [{ label: insightCount === 1 ? "insight" : "insights", count: insightCount, color: C.green }]
      : []),
    ...(riskCount > 0
      ? [{ label: riskCount === 1 ? "risk" : "risks", count: riskCount, color: C.red }]
      : []),
    ...(questionCount > 0
      ? [{ label: questionCount === 1 ? "question" : "questions", count: questionCount, color: C.yellow }]
      : []),
  ];

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between pb-3">
        <h2 className="text-[13px] font-medium text-[#9AA0A6]">Your team, working on this pitch</h2>
        <span className="text-[11px] text-[#5F6368]">{notes.length}/{TEAM.length} reported</span>
      </div>

      {/* Roster */}
      <div className="grid grid-cols-6 gap-2 pb-3">
        {TEAM.map((t) => {
          const s = state[t.id];
          const isDone = s === "done";
          const isWorking = s === "working";
          const isIdle = !isDone && !isWorking;
          return (
            <div
              key={t.id}
              className={`flex flex-col items-center gap-1.5 ${isIdle ? "opacity-35" : ""}`}
              title={`${t.name} · ${t.role} (${s || "idle"})`}
            >
              <div className="relative flex h-10 w-10 items-center justify-center">
                {isDone && (
                  <span
                    className="pointer-events-none absolute inset-0 rounded-full border-2"
                    style={{ borderColor: t.color }}
                  />
                )}
                {isWorking && (
                  <span
                    className="pointer-events-none absolute inset-0 rounded-full border-2 border-dashed motion-safe:animate-[spin_6s_linear_infinite]"
                    style={{ borderColor: t.color }}
                  />
                )}
                {isIdle && (
                  <span className="pointer-events-none absolute inset-0 rounded-full border border-[#2A2B30]" />
                )}
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-medium text-[#0E0F11] ${
                    isWorking ? "motion-safe:animate-pulse" : ""
                  }`}
                  style={{ background: t.color }}
                >
                  {t.name[0]}
                </div>
              </div>
              <span className="text-center text-[10px] leading-tight text-[#9AA0A6]">{t.role}</span>
            </div>
          );
        })}
      </div>

      {/* Note-kind breakdown for visible notes */}
      {stackParts.length > 0 && (
        <div className="pb-3">
          <StackBar parts={stackParts} />
        </div>
      )}

      {/* Channel */}
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-1">
        {!reveal && (
          <p className="text-[13px] text-[#9AA0A6]">Working while the founder pitches… notes appear when the pitch ends.</p>
        )}
        {reveal && notes.length === 0 && (
          <p className="text-[13px] text-[#5F6368]">The team starts as soon as the founder describes the idea…</p>
        )}
        {visibleNotes
          .slice()
          .reverse()
          .map((n) => (
            <ExpertNoteCard
              key={n.expert_id + n.latency_ms}
              note={n}
              avatarColor={color(n.expert_id)}
            />
          ))}
      </div>
    </section>
  );
}
