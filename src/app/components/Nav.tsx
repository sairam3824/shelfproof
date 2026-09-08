"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type RunOption = {
  id: string;
  model: string;
  startedAt: string;
  trials: number;
  finished: boolean;
};

const LINKS = [
  { href: "/", label: "Category detail" },
  { href: "/overview", label: "Overview" },
  { href: "/methodology", label: "Methodology" },
] as const;

/**
 * One nav row and one run selector above everything they scope.
 *
 * The run is a filter over the whole app, so it lives here rather than inside
 * any single card — every view re-renders against the same slice.
 */
export default function Nav({
  runs,
  activeRunId,
}: {
  runs: RunOption[];
  activeRunId: string | null;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();

  const withRun = (href: string) => {
    const next = new URLSearchParams();
    const run = params.get("run");
    if (run) next.set("run", run);
    const qs = next.toString();
    return (qs ? `${href}?${qs}` : href) as Route;
  };

  const onRunChange = (id: string) => {
    const next = new URLSearchParams(params.toString());
    // Switching runs invalidates any open drill-down — that variant's trials
    // belong to the run you just left.
    next.delete("variant");
    if (id) next.set("run", id);
    else next.delete("run");
    router.push(`${pathname}?${next.toString()}` as Route);
  };

  return (
    <header
      className="sticky top-0 z-20 border-b backdrop-blur"
      style={{
        borderColor: "var(--hairline)",
        background: "color-mix(in srgb, var(--page-plane) 88%, transparent)",
      }}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
        <Link href={withRun("/")} className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tracking-tight">ShelfProof</span>
          <span className="muted hidden text-xs sm:inline">listing-edit bench</span>
        </Link>

        <nav className="flex items-center gap-5" aria-label="Views">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={withRun(l.href)}
              className="tab"
              data-active={pathname === l.href}
              aria-current={pathname === l.href ? "page" : undefined}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {runs.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <label htmlFor="run-picker" className="muted text-xs">
              Run
            </label>
            <select
              id="run-picker"
              className="pill tnum cursor-pointer pr-2"
              value={activeRunId ?? ""}
              onChange={(e) => onRunChange(e.target.value)}
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.startedAt} · {r.model} · {r.trials} trials
                  {r.finished ? "" : " (unfinished)"}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </header>
  );
}
