import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Sparkles, ShieldCheck } from "lucide-react";
import { safeNextPath } from "@/lib/auth/access";
import { getAuthState } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log ind" };
export const dynamic = "force-dynamic";

const REASONS: Record<string, { tone: "info" | "warning" | "error"; text: string }> = {
  expired: { tone: "warning", text: "Din session er udløbet. Log ind igen." },
  forbidden: { tone: "error", text: "Kontoen har ikke adgang til AI Agency. Kontakt administratoren." },
  config: { tone: "error", text: "Adgangskontrol er ikke konfigureret på serveren. Se docs/security.md." },
  logged_out: { tone: "info", text: "Du er logget ud." },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reason?: string }> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  const auth = await getAuthState();
  if (auth.status === "authorized") redirect(next);
  const reason = auth.status === "unconfigured" ? REASONS.config : sp.reason ? REASONS[sp.reason] : undefined;

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
            <Sparkles className="h-5 w-5 text-blue-300" />
          </span>
          <div>
            <p className="font-semibold tracking-tight text-white">AI Agency</p>
            <p className="text-xs text-sidebar-muted">Intern platform</p>
          </div>
        </div>
        <div className="max-w-md space-y-4">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white">Research, salg, levering og AI-agenter — ét sted.</h2>
          <p className="text-sm text-sidebar-muted">Research · CRM · Tilbud · Produktion & Levering · AOS · Dashboard</p>
        </div>
        <p className="flex items-center gap-2 text-xs text-sidebar-muted">
          <ShieldCheck className="h-4 w-4" /> Privat platform. Adgang kun for autoriserede brugere.
        </p>
      </aside>
      <main className="flex items-center justify-center bg-background px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar">
              <Sparkles className="h-5 w-5 text-blue-300" />
            </span>
            <p className="font-semibold tracking-tight">AI Agency</p>
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Log ind</h1>
            <p className="text-sm text-muted-foreground">Brug din AI Agency-konto. Nye brugere oprettes af administratoren.</p>
          </div>
          <LoginForm next={next} notice={reason ?? null} />
        </div>
      </main>
    </div>
  );
}
