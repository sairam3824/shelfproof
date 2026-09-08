"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ErrorBar,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS_TICK, GRID, TooltipRow, TooltipShell, pct } from "./chart-ui.tsx";

export type PositionPoint = {
  label: string;
  winRate: number;
  lo: number;
  hi: number;
  err: [number, number];
  trials: number;
  wins: number;
};

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: PositionPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <TooltipShell title={p.label}>
      <TooltipRow label="Win rate" value={`${pct(p.winRate)} (${p.wins}/${p.trials})`} />
      <TooltipRow label="95% CI" value={`${pct(p.lo)}–${pct(p.hi)}`} tone="muted" />
    </TooltipShell>
  );
}

/**
 * Subject win rate by the slot it was shown in.
 *
 * This is an audit of the randomisation, not a result about listings. Four
 * overlapping intervals is the outcome the design predicts; a slot that
 * separates from the others means position is leaking into the measurement.
 */
export default function PositionChart({
  data,
  overall,
}: {
  data: PositionPoint[];
  overall: number | null;
}) {
  if (!data.some((d) => d.trials > 0)) {
    return <p className="secondary py-12 text-center text-sm">No valid trials to audit yet.</p>;
  }

  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 16, right: 84, bottom: 8, left: 0 }}>
          <CartesianGrid {...GRID} vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: "var(--baseline)" }}
            interval={0}
          />
          <YAxis
            domain={[0, 1]}
            ticks={[0, 0.5, 1]}
            tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--gridline)", fillOpacity: 0.35 }} />
          {overall !== null && (
            <ReferenceLine
              y={overall}
              stroke="var(--text-secondary)"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: `all slots ${pct(overall)}`,
                position: "right",
                fill: "var(--text-secondary)",
                fontSize: 11,
              }}
            />
          )}
          <Bar
            dataKey="winRate"
            fill="var(--series-1)"
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          >
            <ErrorBar dataKey="err" width={6} strokeWidth={1.5} stroke="var(--text-secondary)" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
