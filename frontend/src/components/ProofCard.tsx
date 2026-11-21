import React from "react";
import { CheckCircle2 } from "lucide-react";

export function ProofCard() {
  return (
    <section className="flex flex-col rounded-2xl border border-white/10 bg-[#0d1018]/90 p-6 shadow-2xl">
      <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <h3
            className="text-lg font-bold text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Proof: backtested on 120 real 2026 Kickstarter launches
          </h3>
        </div>
        <span className="rounded bg-white/[0.06] px-2.5 py-1 font-mono text-[10px] text-zinc-400">
          N=120 benchmark
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40 p-2">
          <img
            src="/proof/scores.png"
            alt="Backtested Model Scores AUC Comparison"
            className="h-auto w-full rounded-lg object-contain"
          />
        </div>
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40 p-2">
          <img
            src="/proof/reliability.png"
            alt="Calibration and Reliability Curve"
            className="h-auto w-full rounded-lg object-contain"
          />
        </div>
      </div>

      <div className="mt-4 space-y-1.5 border-t border-white/10 pt-3">
        <p className="font-mono text-xs text-amber-300/90 leading-relaxed">
          First run leaked outcomes via &apos;FUNDED!&apos; photo banners (AUC 0.96) — caught and removed.
        </p>
        <p className="text-xs text-zinc-300 leading-relaxed">
          Analyst AUC 0.88 vs buyer swarm 0.70 — so the headline number comes from the analyst; the swarm, lab and boardroom explain why.
        </p>
      </div>
    </section>
  );
}
