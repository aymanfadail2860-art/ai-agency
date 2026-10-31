"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, apiFetch, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Label, Spinner, Textarea } from "@agency/ui";
import { formatDateTime } from "@agency/shared";
import { ExternalLink, Telescope } from "lucide-react";
import { DeepResearchResultSchema, VERIFICATION_LABELS, type DeepResearchResult } from "../deep-research";
import { ClassificationBadge } from "./badges";

export interface DeepResearchJobView {
  id: string;
  status: string;
  statusLabel: string;
  createdAt: string;
  sessionUrl: string | null;
  summary: string | null;
  error: string | null;
  overdue: boolean;
  result: unknown;
}

export interface DeepResearchPanelProps {
  brandId: string;
  mode: "demo" | "live";
  available: boolean;
  unavailableReason: string;
  jobs: DeepResearchJobView[];
}

/**
 * Dyb research via Claude Code-rutine. Panelet viser kun, hvad Job Center har
 * registreret: afsendelse, tilbagemeldinger fra sessionen og det validerede resultat.
 */
export function DeepResearchPanel({ brandId, mode, available, unavailableReason, jobs }: DeepResearchPanelProps) {
  const router = useRouter();
  const [focus, setFocus] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const open = jobs.find((j) => ["queued", "awaiting_approval", "dispatched", "running"].includes(j.status));

  React.useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [open, router]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/research/brands/${brandId}/deep-research`, { body: { focus } });
      setFocus("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="deep-research">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Telescope className="h-4 w-4 text-accent" /> Dyb research (Claude Code)
        </CardTitle>
        <CardDescription>Længere agentbaseret research med websøgning. Kører som en Claude Code-rutine på abonnementet og melder resultatet tilbage hertil.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!available ? (
          <Alert variant="info" title={mode === "demo" ? "Kun i Live Mode" : "Ikke tilgængelig endnu"}>
            <span data-testid="deep-research-unavailable">{mode === "demo" ? "Dyb research bruger en rigtig AI-motor og vises ikke med fiktive resultater i Demo Mode." : unavailableReason}</span>
          </Alert>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="deep-focus">Fokus (valgfrit)</Label>
            <Textarea id="deep-focus" rows={2} maxLength={1000} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Fx kundeservice, booking eller konkurrenter" />
            <Button className="w-full" onClick={start} disabled={busy || Boolean(open)} data-testid="start-deep-research">
              {busy ? <Spinner /> : <Telescope />} {open ? "Dyb research kører…" : "Start dyb research"}
            </Button>
          </div>
        )}
        {error && <Alert variant="error" title="Kunne ikke starte">{error}</Alert>}
        {jobs.length > 0 && (
          <ul className="space-y-3">
            {jobs.map((j) => (
              <li key={j.id} className="rounded-lg border border-border p-3 text-sm" data-testid="deep-research-job">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">{formatDateTime(j.createdAt)}</span>
                  <Badge variant={j.status === "succeeded" ? "success" : j.status === "failed" ? "destructive" : j.overdue ? "warning" : "info"}>
                    {j.overdue ? "Forsinket — intet svar fra sessionen" : j.statusLabel}
                  </Badge>
                </div>
                {j.error && <p className="mt-2 text-destructive">{j.error}</p>}
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <Link href={`/aos/jobs/${j.id}`} className="text-accent hover:underline">
                    Se i AOS
                  </Link>
                  {j.sessionUrl && (
                    <a href={j.sessionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                      Claude Code-session <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                {j.status === "succeeded" && <DeepResearchResultView raw={j.result} summary={j.summary} />}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DeepResearchResultView({ raw, summary }: { raw: unknown; summary: string | null }) {
  const parsed = DeepResearchResultSchema.safeParse(raw);
  if (!parsed.success) return <p className="mt-2 text-muted-foreground">{summary}</p>;
  const r: DeepResearchResult = parsed.data;
  return (
    <div className="mt-3 space-y-3" data-testid="deep-research-result">
      {summary && <p>{summary}</p>}
      <ul className="space-y-2">
        {r.findings.map((f, i) => (
          <li key={i} className="space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <ClassificationBadge classification={f.classification} />
              <Badge variant={f.verification === "unverified" ? "muted" : "outline"}>{VERIFICATION_LABELS[f.verification]}</Badge>
            </div>
            <p>{f.statement}</p>
            {f.sourceUrls.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {f.sourceUrls.map((u) => (
                  <a key={u} href={u} target="_blank" rel="noopener noreferrer nofollow" className="mr-2 break-all text-accent hover:underline">
                    {new URL(u).hostname}
                  </a>
                ))}
              </p>
            )}
          </li>
        ))}
      </ul>
      {r.openQuestions.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Åbne spørgsmål</p>
          <ul className="ml-4 list-disc">
            {r.openQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}
      {r.limitations.length > 0 && <p className="text-xs text-muted-foreground">Begrænsninger: {r.limitations.join(" ")}</p>}
      <p className="text-xs text-muted-foreground">{r.sources.length} kilder · indholdet er fundet af AI og skal verificeres før brug over for kunden.</p>
    </div>
  );
}
