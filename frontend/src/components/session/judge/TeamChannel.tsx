"use client";

import React from "react";
import { Globe } from "lucide-react";
import type { SessionEvent } from "@/components/session/useSessionEvents";

/** The judges' support team: six AI specialists working on the pitch in parallel (expert_status / expert_note). */
const TEAM: { id: string; name: string; role: string; color: string }[] = [
  { id: "market", name: "Maya", role: "Market analyst", color: "#4285F4" },
  { id: "rivals", name: "Theo", role: "Competitive intel", color: "#9B72CB" },
  { id: "history", name: "Iris", role: "Startup historian", color: "#D96570" },
  { id: "gtm", name: "Ravi", role: "Go-to-market", color: "#81C995" },
  { id: "social", name: "Zoe", role: "Social media", color: "#FDD663" },
  { id: "sales", name: "Marco", role: "Sales lead", color: "#78D9EC" },
];

interface ExpertNote {
  expert_id: string;
  name: string;
  role: string;
  headline: string;
  message: string;
  kind: "insight" | "risk" | "question";
  question: string | null;
  sources: string[];
  web: boolean;
  latency_ms: number;
}

const KIND_STYLE: Record<string, string> = {
  insight: "text-[#81C995] border-[#81C995]/30 bg-[#81C995]/10",
  risk: "text-[#F28B82] border-[#F28B82]/30 bg-[#F28B82]/10",
  question: "text-[#FDD663] border-[#FDD663]/30 bg-[#FDD663]/10",
};

function domain(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    return h.includes("vertexaisearch") ? "web search" : h;
  } catch {
    return "web";
  }
}

export function TeamChannel({ events }: { events: SessionEvent[] }) {
  const state: Record<string, string> = {};
  const notes: ExpertNote[] = [];
  for (const e of events) {
    if (e.type === "expert_status") state[e.data.expert_id] = e.data.state;
    if (e.type === "expert_note") {
      state[e.data.expert_id] = "done";
      notes.push(e.data as ExpertNote);
    }
  }
  const color = (id: string) => TEAM.find((t) => t.id === id)?.color ?? "#9AA0A6";

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between pb-3">
        <h2 className="text-[13px] font-medium text-[#9AA0A6]">Your team, working on this pitch</h2>
        <span className="text-[11px] text-[#5F6368]">{notes.length}/{TEAM.length} reported</span>
      </div>

      {/* Roster */}
      <div className="grid grid-cols-6 gap-2 pb-4">
        {TEAM.map((t) => {
          const s = state[t.id];
          return (
            <div key={t.id} className="flex flex-col items-center gap-1.5">
              <div
                className={`relative flex h-10 w-10 items-center justify-center rounded-full text-[14px] font-medium text-[#0E0F11] ${
                  s === "working" ? "animate-pulse" : ""
                } ${!s ? "opacity-35" : ""}`}
                style={{ background: t.color }}
              >
                {t.name[0]}
                {s === "working" && (
                  <span className="absolute -bottom-0.5 h-0.5 w-8 rounded-full bg-[linear-gradient(90deg,#4285F4,#9B72CB,#D96570)]" />
                )}
              </div>
              <span className="text-center text-[10px] leading-tight text-[#9AA0A6]">{t.role}</span>
            </div>
          );
        })}
      </div>

      {/* Channel */}
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-1">
        {notes.length === 0 && (
          <p className="text-[13px] text-[#5F6368]">The team starts as soon as the founder describes the idea…</p>
        )}
        {notes
          .slice()
          .reverse()
          .map((n) => (
            <article key={n.expert_id + n.latency_ms} className="founder-fade-in flex gap-3 rounded-[14px] border border-[#2A2B30] bg-[#16171A] p-3.5">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-medium text-[#0E0F11]"
                style={{ background: color(n.expert_id) }}
              >
                {n.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium text-[#E8EAED]">{n.name}</span>
                  <span className="text-[11px] text-[#5F6368]">{n.role}</span>
                  <span className={`rounded-[8px] border px-1.5 py-px text-[10px] ${KIND_STYLE[n.kind] ?? KIND_STYLE.insight}`}>
                    {n.kind}
                  </span>
                </div>
                <p className="mt-1 text-[14px] font-medium leading-snug text-[#E8EAED]">{n.headline}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-[#9AA0A6]">{n.message}</p>
                {n.question && (
                  <p className="mt-1.5 text-[13px] leading-snug text-[#FDD663]">Ask: “{n.question}”</p>
                )}
                {n.web && n.sources.length > 0 && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-[#5F6368]">
                    <Globe className="h-3 w-3" strokeWidth={1.75} />
                    {n.sources.map(domain).join(" · ")}
                  </p>
                )}
              </div>
            </article>
          ))}
      </div>
    </section>
  );
}
