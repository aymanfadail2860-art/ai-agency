import type { Metadata } from "next";
import { CONTRACT_REGISTRY, MODULES } from "@agency/core";
import { getSettings, getStorageBackend, listEvents } from "@agency/core/server";
import { getIntegrationStatus } from "@agency/integrations";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Table, TBody, TD, TH, THead, TR } from "@agency/ui";
import { formatDateTime } from "@agency/shared";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";

export const metadata: Metadata = { title: "Indstillinger" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, events] = await Promise.all([getSettings(), listEvents(15)]);
  const integrations = getIntegrationStatus();
  return (
    <>
      <PageHeader eyebrow="Platform" title="Indstillinger" description="Tilstand, integrationsstatus, modulkontrakter og hændelseslog." />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Tilstand</CardTitle>
            <CardDescription>Vælg om platformen arbejder med fiktive demodata eller rigtige integrationer.</CardDescription>
          </CardHeader>
          <CardContent>
            <ModeToggle mode={settings.mode} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Integrationer</CardTitle>
            <CardDescription>
              API-nøgler konfigureres server-side (<code>.env.local</code> eller Vercel) og vises aldrig i browseren. Datalagring:{" "}
              <strong data-testid="storage-backend">{getStorageBackend() === "supabase" ? "Supabase (database)" : "lokale JSON-filer"}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <THead>
                <TR>
                  <TH>Integration</TH>
                  <TH>Udbyder</TH>
                  <TH>Status</TH>
                  <TH>Bruges til / mangler</TH>
                </TR>
              </THead>
              <TBody>
                {integrations.map((i) => (
                  <TR key={i.key} data-testid={`integration-${i.key}`}>
                    <TD className="font-medium">{i.name}</TD>
                    <TD className="text-muted-foreground">{i.provider}</TD>
                    <TD>
                      {i.configured ? (
                        <Badge variant="success">
                          <CheckCircle2 /> Konfigureret
                        </Badge>
                      ) : (
                        <Badge variant="muted">
                          <CircleDashed /> Ikke konfigureret
                        </Badge>
                      )}
                    </TD>
                    <TD className="max-w-md text-sm text-muted-foreground">
                      {i.usedFor}
                      {i.missing && <p className="mt-1 text-warning-foreground">{i.missing}</p>}
                      <p className="mt-1 font-mono text-[11px]">{i.envVars.join(", ")}</p>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Moduler</CardTitle>
              <CardDescription>Fem selvstændige forretningsmoduler forbundet via platformkernen.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {MODULES.map((m) => (
                  <li key={m.key} className="flex items-start justify-between gap-3 text-sm">
                    <div>
                      <p className="font-medium">{m.name}</p>
                      <p className="text-muted-foreground">{m.description}</p>
                    </div>
                    <Badge variant={m.status === "active" ? "success" : "muted"}>{m.status === "active" ? "Aktiv" : "Afventer"}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>API-kontrakter</CardTitle>
              <CardDescription>Moduler kommunikerer kun via versionerede kontrakter. Se docs/api-contracts.md.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {CONTRACT_REGISTRY.map((c) => (
                  <li key={c.name} className="text-sm">
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-xs">
                        {c.name}@{c.version}
                      </code>
                      <Badge variant={c.status === "active" ? "success" : "muted"}>{c.status === "active" ? "Aktiv" : "Planlagt"}</Badge>
                    </div>
                    <p className="text-muted-foreground">
                      {c.from} → {c.to} · {c.endpoint}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Seneste hændelser</CardTitle>
            <CardDescription>Fælles hændelsesmodel — grundlag for fremtidige workflows i CRM og Dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ingen hændelser endnu.</p>
            ) : (
              <ul className="space-y-1.5 font-mono text-xs">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-wrap gap-x-3 text-muted-foreground">
                    <span>{formatDateTime(e.occurredAt)}</span>
                    <span className="text-foreground">{e.type}</span>
                    <span>{e.source}</span>
                    {e.mode && <span>[{e.mode}]</span>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
