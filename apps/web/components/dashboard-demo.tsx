"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, apiFetch, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Spinner } from "@agency/ui";
import { CheckCircle2, Circle, Database, FlaskConical, PlayCircle, RotateCcw, Workflow } from "lucide-react";
import type { DashboardDemoStatus } from "@/lib/dashboard-demo";

const MODULE_TONE: Record<string, string> = {
  Research: "bg-sky-500/10 text-sky-700",
  CRM: "bg-violet-500/10 text-violet-700",
  Tilbud: "bg-amber-500/15 text-amber-800",
  Produktion: "bg-emerald-500/10 text-emerald-700",
  AOS: "bg-slate-500/10 text-slate-700",
  Dashboard: "bg-accent/10 text-accent",
};

/** Dashboard Demo Mode: indlæs/nulstil demo-porteføljen og kør det samlede seks-moduls forløb. */
export function DashboardDemoPanel({ status }: { status: DashboardDemoStatus }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const done = status.flow.filter((s) => s.done).length;

  async function run(action: "load" | "flow" | "reset") {
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      const res = await apiFetch<{ message: string }>("/api/dashboard/demo", { body: { action } });
      setMessage(res.message);
      setConfirmReset(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="border-warning/50 bg-gradient-to-br from-warning/10 via-card to-card" data-testid="dashboard-demo">
      <CardHeader className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-warning-foreground" /> Dashboard Demo Mode
          </CardTitle>
          <Badge variant="demo">DEMO</Badge>
        </div>
        <CardDescription>
          Et realistisk eksempel på bureauets drift — bygget på de eksisterende demodata i Research, CRM og Produktion. Der sendes ingen e-mails, foretages ingen opkald, deployes intet og startes ingen betalte AI-opgaver.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => run("load")} disabled={busy !== null} data-testid="demo-load">
            {busy === "load" ? <Spinner /> : <Database />} {status.loaded ? "Opdatér demo-portefølje" : "Indlæs demo-portefølje"}
          </Button>
          <Button variant="outline" onClick={() => run("flow")} disabled={busy !== null} data-testid="demo-flow">
            {busy === "flow" ? <Spinner /> : <PlayCircle />} Kør hele forløbet
          </Button>
          {confirmReset ? (
            <span className="flex flex-wrap items-center gap-2">
              <Button variant="destructive" size="sm" onClick={() => run("reset")} disabled={busy !== null} data-testid="demo-reset-confirm">
                {busy === "reset" && <Spinner />} Bekræft nulstilling
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
                Annullér
              </Button>
            </span>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmReset(true)} disabled={busy !== null} data-testid="demo-reset">
              <RotateCcw /> Nulstil demo
            </Button>
          )}
          <span className="text-xs text-muted-foreground" data-testid="demo-status">
            {status.loaded ? `${status.accounts} demo-virksomheder · ${status.projects} demoprojekter` : "Ikke indlæst"}
          </span>
        </div>
        {confirmReset && <p className="text-xs text-muted-foreground">Nulstilling sletter kun demo-markerede poster (CRM-demoen, Dashboard-demoens virksomheder og Produktions demoprojekter) og genindlæser Produktions grundportefølje. Rigtige data røres ikke.</p>}
        {message && (
          <Alert variant="success">
            <span data-testid="demo-message">{message}</span>
          </Alert>
        )}
        {error && <Alert variant="error">{error}</Alert>}

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Workflow className="h-4 w-4 text-accent" /> Samlet forløb: Research → CRM → Tilbud → Produktion → AOS → Dashboard
            </h3>
            <span className="text-xs text-muted-foreground" data-testid="flow-progress">
              {done} af {status.flow.length} trin
            </span>
          </div>
          <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0" data-testid="six-module-flow">
            {status.flow.map((s, i) => (
              <li key={s.key} className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm ${s.done ? "border-success/30 bg-success/5" : "border-border bg-card"}`} data-flow-step={s.key} data-done={s.done}>
                {s.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">
                      {i + 1}. {s.title}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${MODULE_TONE[s.module] ?? ""}`}>{s.module}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{s.detail}</span>
                  {s.href && s.done && (
                    <Link href={s.href} className="text-xs text-accent hover:underline">
                      Åbn
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
