import * as React from "react";
import Link from "next/link";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@agency/ui";
import { Boxes, GitBranch, Plug, Plus, Settings2, Sparkles } from "lucide-react";
import { AGENT_ROLE_LABELS, SERVICE_BASE_STATUS_LABELS, type ServiceBase } from "../contracts";
import { formatKr } from "./shared";

export interface ServiceFactoryProps {
  bases: Array<ServiceBase & { defaultPrice: { implementation: number; monthly: number } | null; projects: number }>;
  agentNames: Record<string, string>;
}

/** Service Factory: katalog over genbrugelige grundsystemer, der tilpasses den enkelte kunde. */
export function ServiceFactoryCatalog({ bases, agentNames }: ServiceFactoryProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2" data-testid="service-factory">
        {bases.map((b) => (
          <Card key={b.key} id={b.key} className="scroll-mt-24" data-testid={`service-base-${b.key}`}>
            <CardHeader className="gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <Boxes className="h-5 w-5" />
                  </span>
                  <div>
                    <CardTitle>{b.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{b.category}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant="outline">v{b.version}</Badge>
                  <Badge variant={b.status === "ready" ? "success" : b.status === "in_development" ? "info" : "muted"}>{SERVICE_BASE_STATUS_LABELS[b.status]}</Badge>
                </div>
              </div>
              <CardDescription>{b.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" /> Standardfunktioner
                  </p>
                  <ul className="ml-4 list-disc space-y-0.5">
                    {b.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Plug className="h-3.5 w-3.5" /> Mulige integrationer
                    </p>
                    <p className="text-muted-foreground">{b.integrations.join(" · ")}</p>
                  </div>
                  <div>
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Settings2 className="h-3.5 w-3.5" /> Tilpasning
                    </p>
                    <p className="text-muted-foreground">{b.customization.join(" · ")}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {b.stack.map((s) => (
                  <Badge key={s} variant="secondary">
                    {s}
                  </Badge>
                ))}
              </div>
              <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-xs">
                {b.repositories.map((r) => (
                  <p key={r.label} className="flex items-center gap-1.5">
                    <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{r.label}:</span>
                    <span className="break-all font-mono text-muted-foreground">{r.ref}</span>
                    <Badge variant={r.status === "exists" ? "success" : "muted"}>{r.status === "exists" ? "Findes" : "Planlagt"}</Badge>
                  </p>
                ))}
                <p className="text-muted-foreground">
                  Standardteam: {b.defaultAgents.map((a) => `${agentNames[`agt_${a.key}`] ?? a.key} (${AGENT_ROLE_LABELS[a.role].toLowerCase()})`).join(", ")}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {b.defaultPrice ? `Standardpris: ${formatKr(b.defaultPrice.implementation)} + ${formatKr(b.defaultPrice.monthly)}/md. (demopris)` : "Pris efter aftale"} · {b.projects} projekt(er)
                </span>
                <Link href={`/production/new?base=${b.key}`} className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
                  <Plus className="h-4 w-4" /> Nyt projekt på basen
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Grundbaserne er versionsstyret i repositoriet (packages/production/src/service-factory.ts). I denne etape er kataloget og projektskabelonerne funktionelle; selve grundsystemerne er endnu ikke udviklet (status "Koncept").
      </p>
    </div>
  );
}
