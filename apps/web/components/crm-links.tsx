"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, apiFetch, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Select, Spinner } from "@agency/ui";
import { ArrowRight, Contact, Link2, Send, Trophy, UserPlus, XCircle } from "lucide-react";

/**
 * Research → CRM: opret lead, start salgsmulighed med anbefalede services,
 * eller knyt rapporten til en eksisterende virksomhed. Dubletter undgås via
 * den fælles kundeidentitet (brandet).
 */
export function ReportCrmPanel({
  reportId,
  account,
  accounts,
  recommendations,
}: {
  reportId: string;
  account: { id: string; name: string; status: string } | null;
  accounts: Array<{ id: string; name: string }>;
  recommendations: Array<{ catalogItemId: string; serviceName: string; score: number; priority: string; selected: boolean }>;
}) {
  const router = useRouter();
  const [picked, setPicked] = React.useState<string[]>(() => {
    const sel = recommendations.filter((r) => r.selected).map((r) => r.catalogItemId);
    return sel.length ? sel : recommendations.slice(0, 2).map((r) => r.catalogItemId);
  });
  const [attachTo, setAttachTo] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function run(action: "lead" | "opportunity" | "attach") {
    setBusy(action);
    setError(null);
    try {
      const res = await apiFetch<{ account: { id: string }; created: boolean }>("/api/crm/from-report", {
        body: { reportId, action, ...(action === "opportunity" ? { catalogItemIds: picked } : {}), ...(action === "attach" ? { accountId: attachTo } : {}) },
      });
      router.push(`/crm/companies/${res.account.id}${action === "opportunity" ? "?tab=opportunities" : action === "attach" ? "?tab=research" : ""}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  const others = accounts.filter((a) => a.id !== account?.id);
  return (
    <Card className="mb-6" data-testid="report-crm-panel">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Contact className="h-4 w-4 text-accent" /> CRM
          {account ? <Badge variant="success">I CRM</Badge> : <Badge variant="outline">Ikke i CRM endnu</Badge>}
        </CardTitle>
        <CardDescription>
          {account ? (
            <Link href={`/crm/companies/${account.id}`} className="inline-flex items-center gap-1 text-accent hover:underline" data-testid="open-crm-account">
              Åbn {account.name} i CRM <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            "Opret virksomheden som lead — rapporten og anbefalingerne vises automatisk i kundeprofilen."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {recommendations.length > 0 && (
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Anbefalede services til salgsmuligheden</legend>
            <div className="flex flex-wrap gap-2">
              {recommendations.map((r) => (
                <label key={r.catalogItemId} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${picked.includes(r.catalogItemId) ? "border-accent bg-accent/10" : "border-border"}`}>
                  <input type="checkbox" className="sr-only" checked={picked.includes(r.catalogItemId)} onChange={() => setPicked(picked.includes(r.catalogItemId) ? picked.filter((x) => x !== r.catalogItemId) : [...picked, r.catalogItemId])} />
                  {r.serviceName} <span className="tabular-nums text-muted-foreground">{r.score}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="flex flex-wrap gap-2">
          {!account && (
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run("lead")} data-testid="report-create-lead">
              {busy === "lead" ? <Spinner /> : <UserPlus />} Opret lead
            </Button>
          )}
          <Button size="sm" disabled={busy !== null || !picked.length} onClick={() => run("opportunity")} data-testid="report-start-opportunity">
            {busy === "opportunity" ? <Spinner /> : <Trophy />} {account ? "Start salgsmulighed" : "Opret lead og start salgsmulighed"}
          </Button>
        </div>
        {others.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center">
            <Select aria-label="Knyt til eksisterende virksomhed" value={attachTo} onChange={(e) => setAttachTo(e.target.value)} className="sm:max-w-xs" data-testid="report-attach-select">
              <option value="">Knyt rapporten til en anden virksomhed…</option>
              {others.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="outline" disabled={busy !== null || !attachTo} onClick={() => run("attach")} data-testid="report-attach">
              {busy === "attach" ? <Spinner /> : <Link2 />} Knyt til
            </Button>
          </div>
        )}
        {error && <Alert variant="error">{error}</Alert>}
      </CardContent>
    </Card>
  );
}

/** Tilbud ↔ CRM: tilknyttede salgsmuligheder og manuel statusmarkering (platformen sender intet). */
export function QuoteCrmPanel({ quoteId, status, opportunities }: { quoteId: string; status: string; opportunities: Array<{ id: string; title: string; accountId: string; stageLabel: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  if (!opportunities.length && status !== "draft" && status !== "sent") return null;

  async function set(next: "sent" | "rejected") {
    setBusy(next);
    setError(null);
    try {
      await apiFetch(`/api/quotes/${quoteId}/status`, { body: { status: next } });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mb-6" data-testid="quote-crm-panel">
      <CardContent className="flex flex-col gap-3 p-4 text-sm md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <Contact className="h-4 w-4 text-accent" /> Status: {status === "draft" ? "Udkast" : status === "sent" ? "Sendt" : status === "accepted" ? "Accepteret" : "Afvist"}
          </p>
          {opportunities.length ? (
            <p className="text-muted-foreground">
              CRM:{" "}
              {opportunities.map((o, i) => (
                <React.Fragment key={o.id}>
                  {i > 0 && ", "}
                  <Link href={`/crm/companies/${o.accountId}?tab=opportunities`} className="text-accent hover:underline" data-testid="quote-crm-opportunity">
                    {o.title}
                  </Link>{" "}
                  ({o.stageLabel})
                </React.Fragment>
              ))}
            </p>
          ) : (
            <p className="text-muted-foreground">Ikke knyttet til en salgsmulighed i CRM.</p>
          )}
          <p className="text-xs text-muted-foreground">Platformen sender ikke tilbud. Markér som sendt, når du selv har sendt det — salgsmuligheden følger med. Et tilbud vinder ikke aftalen; det gør kundens accept.</p>
        </div>
        {(status === "draft" || status === "sent") && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {status === "draft" && (
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => set("sent")} data-testid="quote-mark-sent">
                {busy === "sent" ? <Spinner /> : <Send />} Markér som sendt
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => set("rejected")} data-testid="quote-mark-rejected">
              {busy === "rejected" ? <Spinner /> : <XCircle />} Afvist af kunden
            </Button>
          </div>
        )}
        {error && <Alert variant="error">{error}</Alert>}
      </CardContent>
    </Card>
  );
}
