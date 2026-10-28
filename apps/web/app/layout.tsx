import type { Metadata } from "next";
import Link from "next/link";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { getSettings } from "@agency/core/server";
import { ModeBadge } from "@agency/ui";
import { MobileNav, Sidebar } from "@/components/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AI Agency Platform", template: "%s · AI Agency Platform" },
  description: "Research, tilbud, produktion, CRM og dashboard for et AI-bureau.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  return (
    <html lang="da" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans">
        <Sidebar mode={settings.mode} />
        <div className="lg:pl-72">
          <MobileNav />
          <header className="flex h-14 items-center justify-end gap-3 border-b border-border/70 bg-background/80 px-6 backdrop-blur">
            <span className="text-xs text-muted-foreground">Tilstand</span>
            <Link href="/settings" aria-label="Skift tilstand under Indstillinger">
              <ModeBadge mode={settings.mode} />
            </Link>
          </header>
          <main className="mx-auto max-w-[1400px] px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
