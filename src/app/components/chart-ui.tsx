"use client";

import type { ReactNode } from "react";

/** Shared tooltip shell so every chart's hover layer looks and behaves alike. */
export function TooltipShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      className="card px-3 py-2 text-sm shadow-lg"
      style={{ color: "var(--text-primary)", borderColor: "var(--hairline-strong)" }}
    >
      <div className="font-medium">{title}</div>
      <div className="mt-1 space-y-0.5">{children}</div>
    </div>
  );
}

export function TooltipRow({
  label,
  value,
  tone = "secondary",
}: {
  label: string;
  value: string;
  tone?: "secondary" | "muted";
}) {
  return (
    <div className={`tnum flex gap-3 justify-between ${tone}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** Recharts axis/grid chrome, kept identical across charts. */
export const AXIS_TICK = { fill: "var(--text-muted)", fontSize: 12 } as const;
export const GRID = { stroke: "var(--gridline)", strokeWidth: 1 } as const;

export const pct = (v: number, dp = 0) => `${(v * 100).toFixed(dp)}%`;
export const signedPct = (v: number, dp = 0) =>
  `${v > 0 ? "+" : ""}${(v * 100).toFixed(dp)}%`;
