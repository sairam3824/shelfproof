"use client";

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
import { AXIS_TICK, GRID, TooltipRow, TooltipShell, signedPct } from "./chart-ui.tsx";
import type { LiftPoint } from "./lift-data.ts";

export type { LiftPoint };

function barColor(verdict: string) {
  if (verdict === "higher") return "var(--diverge-pos)";
  if (verdict === "lower") return "var(--diverge-neg)";
  // The neutral midpoint of the diverging scale. An interval spanning zero is
  // not a finding, and colouring it as one would be the whole mistake this
  // project exists to avoid.
  return "var(--mark-null)";
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: LiftPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const crossesZero = p.lo <= 0 && p.hi >= 0;
  return (
    <TooltipShell title={p.label}>
      <TooltipRow label="Lift vs control" value={signedPct(p.lift, 1)} />
      <TooltipRow label="95% CI" value={`${signedPct(p.lo, 1)} to ${signedPct(p.hi, 1)}`} tone="muted" />
      <TooltipRow label="Won" value={`${p.wins}/${p.validTrials}`} tone="muted" />
      <div className="muted pt-1">
        {crossesZero ? "interval spans zero — no measurable effect" : "interval clears zero"}
      </div>
    </TooltipShell>
  );
}

export default function LiftChart({ data }: { data: LiftPoint[] }) {
  if (!data.length) {
    return <p className="secondary py-12 text-center text-sm">No lift to plot yet.</p>;
  }

  // Symmetric domain so "left of zero" and "right of zero" are visually
  // comparable distances. An asymmetric axis would make a -20pt lift look
  // smaller or larger than a +20pt one.
  const reach = Math.max(...data.map((d) => Math.max(Math.abs(d.lo), Math.abs(d.hi))), 0.1);
  const bound = Math.min(1, Math.ceil(reach * 10) / 10);

  // Each row needs vertical room for a 24px bar plus air; the container grows
  // with the data rather than fixing a height that would clip the axis.
  const height = data.length * 44 + 56;

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 16, bottom: 24, left: 0 }}
          barCategoryGap="22%"
        >
          <CartesianGrid {...GRID} horizontal={false} />
          <XAxis
            type="number"
            domain={[-bound, bound]}
            tickFormatter={(v: number) => signedPct(v)}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={76}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--gridline)", fillOpacity: 0.35 }} />
          {/* Zero is the threshold the whole chart is read against, so it is a
              solid rule in ink rather than another hairline gridline. */}
          <ReferenceLine x={0} stroke="var(--text-secondary)" strokeWidth={1.5} />
          <Bar dataKey="lift" maxBarSize={24} radius={3} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.variant} fill={barColor(d.verdict)} />
            ))}
            <ErrorBar
              dataKey="err"
              direction="x"
              width={6}
              strokeWidth={1.5}
              stroke="var(--text-secondary)"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

