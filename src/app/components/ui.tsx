import type { ReactNode } from "react";
import type { Verdict } from "../../lib/analysis.ts";

/* ------------------------------------------------------------------ tiles */

/**
 * Stat tile: label · value · optional delta · optional hint.
 * Values use proportional figures — tabular-nums makes a number like 121 look
 * loose at display sizes.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: "neutral" | "good" | "warning" | "critical";
}) {
  const color =
    tone === "good"
      ? "var(--success-text)"
      : tone === "warning"
        ? "var(--serious)"
        : tone === "critical"
          ? "var(--critical)"
          : "var(--text-primary)";
  return (
    <div className="card p-4">
      <div className="muted text-xs">{label}</div>
      <div className="figure mt-1.5 text-2xl font-semibold" style={{ color }}>
        {value}
      </div>
      {hint && <div className="muted mt-1 text-xs leading-snug">{hint}</div>}
    </div>
  );
}

/** The single number a view leads with. Exactly one per page. */
export function HeroFigure({
  value,
  label,
  sub,
}: {
  value: string;
  label: string;
  sub?: ReactNode;
}) {
  return (
    <div>
      <div className="muted text-xs uppercase tracking-wide">{label}</div>
      <div className="figure mt-1 text-5xl font-semibold leading-none">{value}</div>
      {sub && <div className="secondary mt-2 text-sm">{sub}</div>}
    </div>
  );
}

/* ----------------------------------------------------------------- badges */

const VERDICT_META: Record<Verdict, { icon: string; text: string; color: string; bg: string }> = {
  control: { icon: "—", text: "Control", color: "var(--text-secondary)", bg: "transparent" },
  higher: {
    icon: "▲",
    text: "Above control",
    color: "var(--success-text)",
    bg: "color-mix(in srgb, var(--good) 12%, transparent)",
  },
  lower: {
    icon: "▼",
    text: "Below control",
    color: "var(--critical)",
    bg: "color-mix(in srgb, var(--critical) 12%, transparent)",
  },
  no_effect: {
    icon: "·",
    text: "No measurable effect",
    color: "var(--text-secondary)",
    bg: "var(--surface-2)",
  },
  insufficient: {
    icon: "?",
    text: "Insufficient data",
    color: "var(--text-secondary)",
    bg: "var(--surface-2)",
  },
};

/**
 * Status colour never carries the meaning alone — every badge ships the icon
 * and the word alongside it.
 */
export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const m = VERDICT_META[verdict];
  return (
    <span className="badge" style={{ color: m.color, background: m.bg }}>
      <span aria-hidden="true">{m.icon}</span>
      {m.text}
    </span>
  );
}

/* ---------------------------------------------------------------- layout */

export function SectionHeading({
  title,
  note,
  action,
}: {
  title: string;
  note?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {note && <p className="muted mt-1 max-w-prose text-xs leading-relaxed">{note}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  hint,
}: {
  title: string;
  body: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="card p-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="secondary mx-auto mt-2 max-w-md text-sm leading-relaxed">{body}</p>
      {hint && <div className="inset muted mx-auto mt-4 max-w-md p-3 text-left text-xs">{hint}</div>}
    </div>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code
      className="rounded px-1.5 py-0.5 text-[0.85em]"
      style={{ background: "var(--surface-2)", color: "var(--text-primary)" }}
    >
      {children}
    </code>
  );
}

/** Banner for conditions the reader must know about before trusting the view. */
export function Notice({
  tone = "warning",
  children,
}: {
  tone?: "warning" | "critical" | "info";
  children: ReactNode;
}) {
  const color =
    tone === "critical" ? "var(--critical)" : tone === "warning" ? "var(--warning)" : "var(--series-1)";
  return (
    <div
      className="flex gap-2.5 rounded-lg border p-3 text-xs leading-relaxed"
      style={{
        borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
        background: `color-mix(in srgb, ${color} 8%, transparent)`,
        color: "var(--text-secondary)",
      }}
      role="status"
    >
      <span aria-hidden="true" style={{ color }}>
        {tone === "info" ? "i" : "!"}
      </span>
      <div>{children}</div>
    </div>
  );
}
