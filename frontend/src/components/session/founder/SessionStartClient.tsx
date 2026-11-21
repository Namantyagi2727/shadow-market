"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, Laptop, Radio } from "lucide-react";
import { getApiBase } from "@/lib/contracts";

interface SessionStartClientProps {
  fontClassName: string;
}

const SESSION_STYLES = `
  .session-root {
    font-family: var(--font-founder-sans), Inter, system-ui, -apple-system, sans-serif;
    --font-sans: var(--font-founder-sans), Inter, system-ui, -apple-system, sans-serif;
    --font-mono: var(--font-founder-mono), "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
  }

  .session-root .font-mono {
    font-family: var(--font-founder-mono), "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
  }

  @keyframes sessionShimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  .session-shimmer-bar {
    background-image: linear-gradient(
      90deg,
      rgba(66, 133, 244, 0.15) 0%,
      #4285F4 25%,
      #9B72CB 50%,
      #D96570 75%,
      rgba(217, 101, 112, 0.15) 100%
    );
    background-size: 200% 100%;
    animation: sessionShimmer 1.6s linear infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .session-shimmer-bar {
      animation: none;
      background-size: 100% 100%;
    }
  }
`;

export function SessionStartClient({ fontClassName }: SessionStartClientProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hostname, setHostname] = useState<string>("localhost");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<"founder" | "judge" | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hostname) {
      setHostname(window.location.hostname);
    }
  }, []);

  const handleStartSession = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        let detail = `Could not start session (${res.status})`;
        try {
          const text = await res.text();
          if (text) {
            try {
              const parsed = JSON.parse(text) as {
                detail?: string;
                message?: string;
              };
              detail = parsed.detail || parsed.message || text;
            } catch {
              detail = text;
            }
          }
        } catch {
          // ignore body read error
        }
        throw new Error(detail);
      }
      const data = (await res.json()) as { run_id?: string };
      if (!data.run_id) {
        throw new Error("Backend did not return a session run_id.");
      }
      setSessionId(data.run_id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start live pitch session."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async (key: "founder" | "judge", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((current) => (current === key ? null : current));
      }, 1800);
    } catch {
      setError("Could not copy to clipboard.");
    }
  };

  const founderPath = sessionId ? `/founder/${sessionId}` : "";
  const judgeUrl = sessionId ? `http://${hostname}:3000/judge/${sessionId}` : "";

  return (
    <div
      className={`session-root ${fontClassName} flex min-h-screen flex-col bg-[#0E0F11] text-[#E8EAED] selection:bg-[#4285F4]/25 selection:text-[#E8EAED]`}
    >
      <style>{SESSION_STYLES}</style>

      <header className="flex h-14 items-center justify-between border-b border-[#2A2B30] px-8">
        <div className="flex items-center gap-3">
          <span className="text-[15px] font-medium tracking-[-0.01em] text-[#E8EAED]">
            Shadow Market
          </span>
          <span className="h-3.5 w-px bg-[#2A2B30]" aria-hidden="true" />
          <span className="text-[13px] text-[#9AA0A6]">Live pitch session</span>
        </div>
        <Link
          href="/"
          className="text-[12px] text-[#5F6368] transition-colors hover:text-[#9AA0A6]"
        >
          Home
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-[820px] flex-1 flex-col justify-center px-6 py-12">
        {!sessionId ? (
          <div className="rounded-[20px] border border-[#2A2B30] bg-[#16171A] p-10">
            <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
              Two-laptop live mode
            </div>
            <h1 className="mt-3 text-[34px] font-light tracking-[-0.02em] text-[#E8EAED]">
              Start a live pitch session.
            </h1>
            <p className="mt-3 max-w-[580px] text-[15px] leading-[1.6] text-[#9AA0A6]">
              Creates a shared session for both laptops. Laptop A listens to the
              founder and prepares live answers; Laptop B listens to the judges
              and surfaces the sharpest follow-up questions.
            </p>

            <div className="mt-8 flex flex-col items-start gap-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleStartSession()}
                className="flex h-12 items-center gap-2.5 rounded-full bg-[#E8EAED] px-6 text-[15px] font-medium text-[#0E0F11] transition-colors duration-150 hover:bg-white disabled:opacity-50"
              >
                <Radio className="h-4 w-4" strokeWidth={2} />
                <span>
                  {busy ? "Starting session…" : "Start live pitch session"}
                </span>
              </button>

              {busy && (
                <div className="session-shimmer-bar h-[2px] w-48 rounded-full" />
              )}

              {error && (
                <p className="text-[13px] text-[#F28B82]">{error}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#81C995]">
                  Session ready
                </div>
                <h1 className="mt-1.5 text-[28px] font-light tracking-[-0.02em] text-[#E8EAED]">
                  Connect both laptops
                </h1>
              </div>
              <span className="rounded-[10px] border border-[#2A2B30] bg-[#16171A] px-3 py-1.5 font-mono text-[13px] text-[#9AA0A6]">
                {sessionId}
              </span>
            </div>

            <div className="space-y-4">
              {/* Link 1: Founder (this laptop) */}
              <div className="rounded-[16px] border border-[#2A2B30] bg-[#16171A] p-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-2.5 text-[12px] font-medium uppercase tracking-[0.08em] text-[#9AA0A6]">
                    <Laptop className="h-4 w-4 text-[#5F6368]" strokeWidth={1.75} />
                    <span>Founder (this laptop)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void handleCopy(
                        "founder",
                        typeof window !== "undefined"
                          ? `${window.location.origin}${founderPath}`
                          : founderPath
                      )
                    }
                    className="flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#2A2B30] bg-[#1C1D21] px-3 text-[12px] font-medium text-[#E8EAED] transition-colors hover:border-[#5F6368]"
                  >
                    {copiedKey === "founder" ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[#81C995]" strokeWidth={2} />
                        <span className="text-[#81C995]">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-[#9AA0A6]" strokeWidth={1.75} />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                <Link
                  href={founderPath}
                  className="mt-3 block break-all font-mono text-[22px] font-normal text-[#E8EAED] transition-colors hover:text-white"
                >
                  {founderPath}
                </Link>
              </div>

              {/* Link 2: Judges' laptop */}
              <div className="rounded-[16px] border border-[#2A2B30] bg-[#16171A] p-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-2.5 text-[12px] font-medium uppercase tracking-[0.08em] text-[#9AA0A6]">
                    <Laptop className="h-4 w-4 text-[#5F6368]" strokeWidth={1.75} />
                    <span>Judges&apos; laptop</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCopy("judge", judgeUrl)}
                    className="flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#2A2B30] bg-[#1C1D21] px-3 text-[12px] font-medium text-[#E8EAED] transition-colors hover:border-[#5F6368]"
                  >
                    {copiedKey === "judge" ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[#81C995]" strokeWidth={2} />
                        <span className="text-[#81C995]">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-[#9AA0A6]" strokeWidth={1.75} />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                <a
                  href={judgeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 block break-all font-mono text-[22px] font-normal text-[#E8EAED] transition-colors hover:text-white"
                >
                  {judgeUrl}
                </a>
              </div>
            </div>

            {error && <p className="text-[13px] text-[#F28B82]">{error}</p>}

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <Link
                href={founderPath}
                className="flex h-12 items-center gap-2 rounded-full bg-[#E8EAED] px-6 text-[15px] font-medium text-[#0E0F11] transition-colors duration-150 hover:bg-white"
              >
                <span>Open founder view</span>
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </Link>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleStartSession()}
                className="text-[13px] text-[#5F6368] transition-colors hover:text-[#9AA0A6] disabled:opacity-40"
              >
                Start another session
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
