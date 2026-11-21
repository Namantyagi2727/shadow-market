"use client";

import React, { useState } from "react";
import { Send } from "lucide-react";
import { getApiBase } from "@/lib/contracts";

interface TypedAskBarProps {
  runId: string;
}

export function TypedAskBar({ runId }: TypedAskBarProps) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `${getApiBase()}/api/runs/${encodeURIComponent(runId)}/session/ask`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed, role: "judge" }),
        }
      );

      if (!response.ok) {
        let detail = response.statusText || "Request failed";
        try {
          const bodyText = await response.text();
          if (bodyText) {
            try {
              const parsed = JSON.parse(bodyText) as {
                detail?: string;
                message?: string;
              };
              detail = parsed.detail || parsed.message || bodyText;
            } catch {
              detail = bodyText;
            }
          }
        } catch {
          // Ignore body parsing failure
        }
        throw new Error(detail);
      }

      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send question.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 shrink-0">
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2.5 rounded-[12px] border border-[#2A2B30] bg-[#16171A] px-3.5 py-2"
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask by typing"
          aria-label="Ask by typing"
          disabled={submitting}
          className="min-w-0 flex-1 bg-transparent text-[14px] text-[#E8EAED] placeholder-[#5F6368] focus:outline-none disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={submitting || !text.trim()}
          className="flex shrink-0 items-center gap-1.5 rounded-[8px] border border-[#2A2B30] bg-[#1C1D21] px-3 py-1.5 text-[12px] font-medium text-[#E8EAED] transition-colors duration-200 hover:bg-[#2A2B30] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span>{submitting ? "Sending…" : "Ask"}</span>
        </button>
      </form>

      {error && (
        <p className="mt-1.5 font-mono text-[11px] text-[#F28B82]">{error}</p>
      )}
    </div>
  );
}
