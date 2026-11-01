import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AI Agency Platform", template: "%s · AI Agency Platform" },
  description: "Intern arbejdsplatform for AI-bureauet: research, tilbud, produktion, CRM, dashboard og AOS.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Rodlayout: kun dokumentet. Platformens ramme (og adgangskontrol) ligger i app/(app)/layout.tsx. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="da" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
