import { PENDING_MODULE_MESSAGE } from "@agency/core";
import { PendingModuleNotice, PlaceholderLine, PreviewArea } from "@agency/ui";
import { Bot, FolderKanban, PackageCheck, Rocket, ShieldCheck, Workflow } from "lucide-react";

const STAGES = ["Modtaget", "Planlægning", "Udvikling", "Test & QA", "Kundegodkendelse", "Deployment", "Drift"];

export function ProductionPreview() {
  return (
    <div className="space-y-6">
      <PendingModuleNotice message={PENDING_MODULE_MESSAGE} />
      <div className="grid gap-4 lg:grid-cols-2">
        <PreviewArea icon={<FolderKanban />} title="Projektoversigt" description="Projekter oprettes automatisk fra accepterede tilbud.">
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-md bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <PlaceholderLine className="w-1/2" />
                  <PlaceholderLine className="w-1/3 bg-muted/60" />
                </div>
                <div className="h-5 w-16 rounded-full bg-muted" />
              </div>
            ))}
          </div>
        </PreviewArea>
        <PreviewArea icon={<Workflow />} title="Produktionspipeline" description="Servicespecifikke produktionsflows fra opstart til drift.">
          <ol className="flex flex-wrap items-center gap-1.5">
            {STAGES.map((s, i) => (
              <li key={s} className="flex items-center gap-1.5">
                <span className="rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">{s}</span>
                {i < STAGES.length - 1 && <span className="text-muted-foreground/60">›</span>}
              </li>
            ))}
          </ol>
        </PreviewArea>
        <PreviewArea icon={<Bot />} title="AI-agenter" description="Agenter, der udfører afgrænsede produktionsopgaver med menneskelig godkendelse.">
          <div className="grid grid-cols-3 gap-3">
            {["Byggeagent", "Testagent", "Dokumentationsagent"].map((a) => (
              <div key={a} className="rounded-lg border border-border p-3">
                <p className="text-xs font-medium text-muted-foreground">{a}</p>
                <PlaceholderLine className="mt-2 w-2/3" />
              </div>
            ))}
          </div>
        </PreviewArea>
        <PreviewArea icon={<PackageCheck />} title="Aktive leverancer" description="Status på leverancer pr. kunde og service.">
          <div className="space-y-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <PlaceholderLine className="w-1/3" />
                <div className="h-1.5 flex-1 rounded-full bg-muted" />
              </div>
            ))}
          </div>
        </PreviewArea>
        <PreviewArea icon={<ShieldCheck />} title="Kvalitetssikring" description="Tests, review og kundegodkendelse før levering.">
          <ul className="space-y-2 text-xs text-muted-foreground">
            {["Automatiske tests", "Sikkerheds- og GDPR-tjek", "Kundegodkendelse"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded border border-border" /> {t}
              </li>
            ))}
          </ul>
        </PreviewArea>
        <PreviewArea icon={<Rocket />} title="Deployment og vedligeholdelse" description="Udrulning, overvågning og løbende vedligeholdelse af aktive løsninger.">
          <div className="grid grid-cols-3 gap-3">
            {["Udrulninger", "Overvågning", "Service"].map((t) => (
              <div key={t} className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">{t}</p>
                <div className="mt-2 h-5 w-10 rounded bg-muted" />
              </div>
            ))}
          </div>
        </PreviewArea>
      </div>
    </div>
  );
}
