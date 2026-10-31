"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { APPROVAL_CATEGORY_LABELS, type Approval } from "@agency/orchestrator";
import { Alert, apiFetch, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Spinner } from "@agency/ui";
import { formatDateTime } from "@agency/shared";
import { Check, X } from "lucide-react";
import { formatUsd } from "./status";

/** Approval Manager: kritiske handlinger kræver en eksplicit beslutning her. */
export function ApprovalList({ approvals }: { approvals: Approval[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const pending = approvals.filter((a) => a.status === "pending");
  const decided = approvals.filter((a) => a.status !== "pending").slice(0, 20);

  async function decide(id: string, decision: "approved" | "rejected") {
    setBusy(`${id}:${decision}`);
    setError(null);
    try {
      await apiFetch(`/api/aos/approvals/${id}`, { body: { decision, note: notes[id] || undefined } });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {error && <Alert variant="error" title="Beslutningen blev ikke gemt">{error}</Alert>}
      <Card>
        <CardHeader>
          <CardTitle>Afventer beslutning ({pending.length})</CardTitle>
          <CardDescription>Produktion, deployment, ændringer i kundesystemer, betalte handlinger, massehandlinger, destruktive databaseændringer, kundekommunikation og ændringer af agenter kræver godkendelse.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pending.length === 0 && <p className="text-sm text-muted-foreground" data-testid="approvals-empty">Ingen handlinger afventer godkendelse.</p>}
          {pending.map((a) => (
            <div key={a.id} className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-4" data-testid="approval-pending">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="warning">{APPROVAL_CATEGORY_LABELS[a.category]}</Badge>
                {a.mode === "demo" && <Badge variant="demo">Demo</Badge>}
                <span className="text-xs text-muted-foreground">{formatDateTime(a.requestedAt)}</span>
              </div>
              <p className="font-medium">{a.title}</p>
              <p className="text-sm text-muted-foreground">{a.description}</p>
              <ul className="list-disc pl-5 text-sm">
                {a.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              {a.estimatedCostUsd !== null && <p className="text-sm">Estimeret omkostning: {formatUsd(a.estimatedCostUsd)}</p>}
              {a.subject.aiJobId && (
                <Link href={`/aos/jobs/${a.subject.aiJobId}`} className="text-sm text-accent hover:underline">
                  Se opgaven
                </Link>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input aria-label="Bemærkning (valgfri)" placeholder="Bemærkning (valgfri)" value={notes[a.id] ?? ""} onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })} maxLength={500} />
                <Button onClick={() => decide(a.id, "approved")} disabled={busy !== null} data-testid="approval-approve">
                  {busy === `${a.id}:approved` ? <Spinner /> : <Check />} Godkend
                </Button>
                <Button variant="outline" onClick={() => decide(a.id, "rejected")} disabled={busy !== null} data-testid="approval-reject">
                  {busy === `${a.id}:rejected` ? <Spinner /> : <X />} Afvis
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      {decided.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Seneste beslutninger</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60 text-sm">
              {decided.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>{a.title}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={a.status === "approved" ? "success" : "muted"}>{a.status === "approved" ? "Godkendt" : "Afvist"}</Badge>
                    {a.decidedAt && formatDateTime(a.decidedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
