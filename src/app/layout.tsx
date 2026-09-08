import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import Nav from "./components/Nav.tsx";
import { getNavData } from "../lib/queries.ts";

export const metadata: Metadata = {
  title: "ShelfProof",
  description:
    "Which product-listing changes make an AI shopping assistant recommend a given SKU?",
};

export const dynamic = "force-dynamic";

async function Shell() {
  const { runs, defaultRunId } = await getNavData();
  return <Nav runs={runs} activeRunId={defaultRunId} />;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      {/* Colour comes from the tokens in globals.css so the dark scheme works.
          A literal bg-white here would paint over them, and --color-ink is not
          a token this project defines. */}
      <body className="antialiased">
        {/* Nav reads searchParams, so it needs a Suspense boundary to avoid
            opting the whole tree into client-side rendering. */}
        <Suspense fallback={<div style={{ height: 53 }} />}>
          <Shell />
        </Suspense>
        {children}
        <footer className="mx-auto max-w-6xl px-6 pb-10 pt-14">
          <hr className="rule" />
          <p className="muted mt-4 text-xs leading-relaxed">
            ShelfProof measures what one assistant recommends, at one temperature, on one
            date — not what a shopper then buys. Absence of a finding here is not evidence
            that an edit does nothing.
          </p>
        </footer>
      </body>
    </html>
  );
}
