import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShelfProof",
  description:
    "Which product-listing changes make an AI shopping assistant recommend a given SKU?",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="bg-white text-[--color-ink] antialiased">{children}</body>
    </html>
  );
}
