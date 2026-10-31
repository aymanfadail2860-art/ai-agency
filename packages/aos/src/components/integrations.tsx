"use client";
import * as React from "react";
import type { IntegrationTestResult, ManagedIntegration } from "@agency/orchestrator/server";
import { apiFetch, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Spinner } from "@agency/ui";

const TIER_LABELS: Record<ManagedIntegration["tier"], { title: string; description: string }> = {
  core: { title: "Kerne", description: "AI-motorer og platformens infrastruktur." },
  research: { title: "Researchkilder", description: "Datakilder for Research-modulet." },
  priority: { title: "Prioriterede fremtidige integrationer", description: "Tilsluttes, når en udviklingsfase kræver det." },
  optional: { title: "Valgfrie integrationer", description: "Kan tilføjes senere efter behov." },
};

const STATE: Record<ManagedIntegration["state"], { label: string; variant: "success" | "warning" | "muted" | "info" }> = {
  connected: { label: "Tilsluttet", variant: "success" },
  not_configured: { label: "Mangler konfiguration", variant: "warning" },
  infrastructure: { label: "Infrastruktur", variant: "info" },
  planned: { label: "Planlagt", variant: "muted" },
};

/** Integration Manager — status, påkrævede miljøvariabler (navne) og omkostningsfri forbindelsestest. */
export function IntegrationList({ integrations }: { integrations: ManagedIntegration[] }) {
  const [results, setResults] = React.useState<Record<string, IntegrationTestResult>>({});
  const [busy, setBusy] = React.useState<string | null>(null);

  async function test(key: string) {
    setBusy(key);
    try {
      const r = await apiFetch<IntegrationTestResult>(`/api/aos/integrations/${key}/test`, { body: {} });
      setResults((prev) => ({ ...prev, [key]: r }));
    } catch (e) {
      setResults((prev) => ({ ...prev, [key]: { key, ok: false, message: (e as Error).message, testedAt: new Date().toISOString() } }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6" data-testid="integrations">
      {(Object.keys(TIER_LABELS) as ManagedIntegration["tier"][]).map((tier) => (
        <Card key={tier}>
          <CardHeader>
            <CardTitle>{TIER_LABELS[tier].title}</CardTitle>
            <CardDescription>{TIER_LABELS[tier].description}</CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border/60 p-0">
            {integrations
              .filter((i) => i.tier === tier)
              .map((i) => (
                <div key={i.key} className="grid gap-2 px-5 py-4 md:grid-cols-[220px_1fr_auto] md:items-start" data-testid={`integration-${i.key}`}>
                  <div className="space-y-1">
                    <p className="font-medium">{i.name}</p>
                    <Badge variant={STATE[i.state].variant}>{STATE[i.state].label}</Badge>
                  </div>
                  <div className="space-y-1 text-sm">
                    <p>{i.purpose}</p>
                    <p className="text-muted-foreground">{i.detail}</p>
                    {i.envVars.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Miljøvariabler: {i.envVars.map((v) => <code key={v} className="mr-1.5 rounded bg-muted px-1 py-0.5">{v}</code>)}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">{i.costNote}</p>
                    {results[i.key] && (
                      <p className={`text-xs ${results[i.key]!.ok ? "text-success" : "text-warning-foreground"}`} role="status" data-testid={`integration-result-${i.key}`}>
                        {results[i.key]!.ok ? "✓" : "!"} {results[i.key]!.message}
                      </p>
                    )}
                  </div>
                  {(i.testable || i.key === "claude_code") && (
                    <Button variant="outline" size="sm" onClick={() => test(i.key)} disabled={busy !== null} data-testid={`integration-test-${i.key}`}>
                      {busy === i.key && <Spinner />} {i.testable ? "Test forbindelse" : "Kontrollér opsætning"}
                    </Button>
                  )}
                </div>
              ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
