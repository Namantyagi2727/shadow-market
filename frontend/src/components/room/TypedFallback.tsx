"use client";

import React, { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { postRoomAsk } from "@/lib/api";
import type { TwinSeat } from "@/lib/room-twins";

export interface TypedFallbackProps {
  runId: string;
  seats: TwinSeat[];
}

export function TypedFallback({ runId, seats }: TypedFallbackProps) {
  const [text, setText] = useState("");
  const [selectedSeat, setSelectedSeat] = useState<number>(seats[0]?.seat ?? 1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (seats.length > 0 && !seats.some((s) => s.seat === selectedSeat)) {
      setSelectedSeat(seats[0].seat);
    }
  }, [seats, selectedSeat]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      await postRoomAsk(runId, { text: trimmed, seat: selectedSeat });
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send typed challenge.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d1018]/90 px-4 py-3">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2.5">
        <select
          value={selectedSeat}
          onChange={(e) => setSelectedSeat(Number(e.target.value))}
          aria-label="Target judge seat"
          className="rounded-xl border border-white/15 bg-[#07080d] px-3 py-2 text-xs font-medium text-zinc-200 focus:border-cyan-400/50 focus:outline-none"
        >
          {seats.map((s) => (
            <option key={s.seat} value={s.seat}>
              Seat {s.seat}: {s.role}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a judge question (mic fallback)…"
          disabled={submitting}
          className="min-w-[200px] flex-1 rounded-xl border border-white/10 bg-[#07080d] px-3.5 py-2 text-sm text-white placeholder-zinc-500 focus:border-cyan-400/50 focus:outline-none disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={submitting || !text.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" />
          <span>{submitting ? "Sending…" : "Ask"}</span>
        </button>
      </form>

      {error && (
        <div className="mt-2 font-mono text-xs text-rose-300">{error}</div>
      )}
    </div>
  );
}
