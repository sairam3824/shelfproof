"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS_TICK, GRID, TooltipRow, TooltipShell, pct } from "./chart-ui.tsx";

export type ChartPoint = {
  variant: string;
  label: string;
  winRate: number;
  ciLo: number;
  ciHi: number;
  /** [distance below the value, distance above] — Recharts wants offsets. */
  err: [number, number];
  verdict: string;
  validTrials: number;
  wins: number;
};

const VERDICT_TEXT: Record<string, string> = {
  control: "control",
  higher: "above control",
  lower: "below control",
  no_effect: "not distinguishable from control",
  insufficient: "not enough valid trials",
};

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <TooltipShell title={p.label}>
      <TooltipRow label="Win rate" value={`${pct(p.winRate)} (${p.wins}/${p.validTrials})`} />
      <TooltipRow label="95% CI" value={`${pct(p.ciLo)}–${pct(p.ciHi)}`} tone="muted" />
      <div className="muted pt-1">{VERDICT_TEXT[p.verdict] ?? p.verdict}</div>
    </TooltipShell>
  );
}

export default function WinRateChart({
  data,
  controlRate,
  selected,
}: {
  data: ChartPoint[];
  controlRate: number | null;
  selected?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const select = (variant: string) => {
    const next = new URLSearchParams(params.toString());
    if (next.get("variant") === variant) next.delete("variant");
    else next.set("variant", variant);
    router.push(`/?${next.toString()}`, { scroll: false });
  };

  if (!data.length) {
    return (
      <p className="secondary py-12 text-center text-sm">
        No valid trials in this category yet.
      </p>
    );
  }

  return (
    // Height includes the x-axis band, so the axis labels are never cut off and
    // the card never grows a nested scrollbar.
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 16, right: 92, bottom: 8, left: 0 }}>
          {/* Hairline, solid, horizontal only — recessive. */}
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
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--gridline)", fillOpacity: 0.35 }} />
          {controlRate !== null && (
            // Dashed here is deliberate and semantic: this is a threshold, not a
            // gridline. Gridlines above are solid hairlines.
            <ReferenceLine
              y={controlRate}
              stroke="var(--text-secondary)"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: `control ${pct(controlRate)}`,
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
            onClick={(d: unknown) => select((d as ChartPoint).variant)}
            cursor="pointer"
          >
            {/* One series, one colour — colouring bars by their own height would
                double-encode length as hue. The control bar is de-saturated only
                as a redundant cue; the reference line and table say so in words. */}
            {data.map((d) => (
              <Cell
                key={d.variant}
                fill="var(--series-1)"
                fillOpacity={d.variant === "v0_control" ? 0.45 : 1}
                stroke={selected === d.variant ? "var(--text-primary)" : undefined}
                strokeWidth={selected === d.variant ? 1.5 : 0}
              />
            ))}
            <ErrorBar dataKey="err" width={6} strokeWidth={1.5} stroke="var(--text-secondary)" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
