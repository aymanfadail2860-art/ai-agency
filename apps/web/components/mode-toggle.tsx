"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import type { Mode } from "@agency/core";
import { Alert, apiFetch, Spinner } from "@agency/ui";
import { FlaskConical, ShieldCheck } from "lucide-react";

export function ModeToggle({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<Mode | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function choose(next: Mode) {
    setBusy(next);
    setError(null);
    try {
      await apiFetch("/api/settings", { method: "PUT", body: { mode: next } });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {(
          [
            ["demo", "Demo Mode", "Fungerer uden API-nøgler. Fiktive virksomheder, kilder og priser — tydeligt markeret.", FlaskConical],
            ["live", "Live Mode", "Rigtige CVR-opslag, webhentning, websøgning og AI-kald via konfigurerede integrationer.", ShieldCheck],
          ] as const
        ).map(([key, title, text, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => choose(key)}
            disabled={busy !== null || mode === key}
            aria-pressed={mode === key}
            data-testid={`mode-${key}`}
            className={`rounded-xl border p-4 text-left transition-colors ${mode === key ? "border-accent bg-accent/5 ring-1 ring-accent/30" : "border-border bg-card hover:bg-muted/40"}`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {busy === key ? <Spinner /> : <Icon className="h-4 w-4 text-accent" />} {title}
              {mode === key && <span className="ml-auto text-xs font-medium text-accent">Aktiv</span>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Demo- og live-data holdes adskilt. Lister i Research og Tilbud viser kun data for den aktive tilstand.</p>
      {error && <Alert variant="error" title="Kunne ikke skifte tilstand">{error}</Alert>}
    </div>
  );
}
