"use client";

import React from "react";
import { AlertCircle, Plus, Radio, Trash2, Users } from "lucide-react";
import type { TwinSeat } from "@/lib/room-twins";

export interface SeatSetupProps {
  runId: string;
  seats: TwinSeat[];
  onChangeSeats: (seats: TwinSeat[]) => void;
  onStart: () => void;
  starting: boolean;
  isDevSample: boolean;
  errors: string[];
}

export function SeatSetup({
  runId,
  seats,
  onChangeSeats,
  onStart,
  starting,
  isDevSample,
  errors,
}: SeatSetupProps) {
  const hasThirdSeat = seats.length >= 3;

  const updateSeatRole = (seatNum: number, role: string) => {
    onChangeSeats(
      seats.map((s) => (s.seat === seatNum ? { ...s, role } : s))
    );
  };

  const addThirdSeat = () => {
    if (seats.length >= 3) return;
    onChangeSeats([...seats, { seat: 3, role: "Product lead" }]);
  };

  const removeThirdSeat = () => {
    if (seats.length <= 2) return;
    onChangeSeats(seats.filter((s) => s.seat !== 3));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!starting) {
      onStart();
    }
  };

  return (
    <div className="min-h-screen bg-stage-grid flex flex-col items-center justify-center px-4 py-10">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl rounded-3xl border border-white/15 bg-[#0d1018]/95 p-8 shadow-2xl sm:p-10"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/35 bg-emerald-500/15 text-emerald-300">
              <Radio className="h-5 w-5" />
            </span>
            <div>
              <div
                className="text-base font-bold tracking-wide text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                SHADOW MARKET
              </div>
              <div className="font-mono text-xs uppercase tracking-widest text-zinc-400">
                Judges&apos; Table • Q&amp;A Room
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isDevSample && (
              <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 font-mono text-xs font-medium text-amber-200">
                Sample data
              </span>
            )}
            <span className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-xs text-zinc-300">
              run: {runId}
            </span>
          </div>
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h1
              className="text-2xl font-bold tracking-tight text-white sm:text-3xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Set the judge seats
            </h1>
            <span className="flex items-center gap-1.5 font-mono text-xs text-zinc-400">
              <Users className="h-4 w-4" />
              {seats.length} seats
            </span>
          </div>
          <p className="mt-2 text-base text-zinc-400">
            Each seat runs a live voice twin calibrated to push back on claims during Q&amp;A.
          </p>
        </div>

        <div className="mt-7 space-y-4">
          {seats.map((seat) => (
            <div
              key={seat.seat}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5"
            >
              <span className="flex h-9 w-20 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#07080d] font-mono text-xs font-semibold uppercase tracking-wider text-zinc-300">
                Seat {seat.seat}
              </span>
              <input
                type="text"
                value={seat.role}
                onChange={(e) => updateSeatRole(seat.seat, e.target.value)}
                placeholder={
                  seat.seat === 1
                    ? "VC partner"
                    : seat.seat === 2
                    ? "Skeptical CFO"
                    : "Product lead"
                }
                maxLength={60}
                aria-label={`Seat ${seat.seat} role`}
                className="w-full bg-transparent text-lg font-medium text-white placeholder-zinc-600 focus:outline-none"
              />
              {seat.seat === 3 && (
                <button
                  type="button"
                  onClick={removeThirdSeat}
                  className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-xs text-zinc-400 transition hover:border-rose-400/40 hover:text-rose-200"
                  title="Remove seat 3"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Remove</span>
                </button>
              )}
            </div>
          ))}

          {!hasThirdSeat && (
            <button
              type="button"
              onClick={addThirdSeat}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.015] py-3.5 text-sm font-medium text-zinc-300 transition hover:border-white/30 hover:bg-white/[0.04] hover:text-white"
            >
              <Plus className="h-4 w-4" />
              <span>Add optional Seat 3 (Product lead)</span>
            </button>
          )}
        </div>

        {errors.length > 0 && (
          <div className="mt-6 space-y-2 rounded-2xl border border-rose-500/35 bg-rose-500/10 p-4 text-sm text-rose-200">
            {errors.map((err, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                <span>{err}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8">
          <button
            type="submit"
            disabled={starting}
            className="w-full rounded-2xl bg-emerald-400 px-6 py-5 text-xl font-bold tracking-tight text-zinc-950 shadow-[0_0_36px_rgba(16,185,129,0.28)] transition hover:bg-emerald-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {starting ? "Starting room…" : "Start room"}
          </button>
          <p className="mt-3 text-center text-xs text-zinc-500">
            Enables room microphone capture and speaker playback for judge twins.
          </p>
        </div>
      </form>
    </div>
  );
}
