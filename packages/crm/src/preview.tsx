import { PENDING_MODULE_MESSAGE } from "@agency/core";
import { PendingModuleNotice, PlaceholderLine, PreviewArea } from "@agency/ui";
import { Building2, CalendarClock, Contact, FileClock, KanbanSquare, MessagesSquare, Receipt, Sparkles } from "lucide-react";

const PIPELINE = ["Lead", "Kvalificeret", "Tilbud sendt", "Forhandling", "Vundet"];

export function CrmPreview() {
  return (
    <div className="space-y-6">
      <PendingModuleNotice message={PENDING_MODULE_MESSAGE} />
      <PreviewArea icon={<KanbanSquare />} title="Salgspipeline" description="Leadstatus og muligheder fra første kontakt til vundet aftale.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {PIPELINE.map((stage) => (
            <div key={stage} className="rounded-lg bg-muted/40 p-3">
              <p className="mb-3 text-xs font-medium text-muted-foreground">{stage}</p>
              <div className="space-y-2">
                <div className="h-10 rounded-md border border-border bg-card" />
                <div className="h-10 rounded-md border border-border bg-card/60" />
              </div>
            </div>
          ))}
        </div>
      </PreviewArea>
      <div className="grid gap-4 lg:grid-cols-3">
        <PreviewArea icon={<Building2 />} title="Kundeoversigt" description="Alle kunder med fælles kundeidentitet på tværs af moduler.">
          <div className="space-y-2.5">{[0, 1, 2].map((i) => <PlaceholderLine key={i} className={i % 2 ? "w-2/3" : "w-full"} />)}</div>
        </PreviewArea>
        <PreviewArea icon={<Contact />} title="Kontaktpersoner" description="Roller, kontaktoplysninger og samtykke.">
          <div className="flex gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-9 w-9 rounded-full bg-muted" />)}</div>
        </PreviewArea>
        <PreviewArea icon={<CalendarClock />} title="Møder og opfølgninger" description="Planlagte møder og påmindelser.">
          <div className="space-y-2.5">{[0, 1].map((i) => <PlaceholderLine key={i} className="w-3/4" />)}</div>
        </PreviewArea>
        <PreviewArea icon={<FileClock />} title="Tilbudshistorik" description="Tilbud og versioner pr. kunde fra Tilbudsmodulet.">
          <div className="space-y-2.5">{[0, 1, 2].map((i) => <PlaceholderLine key={i} className="w-5/6" />)}</div>
        </PreviewArea>
        <PreviewArea icon={<MessagesSquare />} title="Kundekommunikation" description="Samlet kommunikationshistorik.">
          <div className="space-y-2">
            <div className="h-6 w-2/3 rounded-lg bg-muted" />
            <div className="ml-auto h-6 w-1/2 rounded-lg bg-primary/10" />
          </div>
        </PreviewArea>
        <PreviewArea icon={<Sparkles />} title="Aktive services" description="Services kunden har købt, koblet til Produktion & Levering.">
          <div className="flex flex-wrap gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="h-5 w-20 rounded-full bg-muted" />)}</div>
        </PreviewArea>
        <PreviewArea icon={<Receipt />} title="Kundeøkonomi" description="Implementering, abonnementer og fakturering pr. kunde." className="lg:col-span-3">
          <div className="grid grid-cols-3 gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-lg bg-muted/50" />)}</div>
        </PreviewArea>
      </div>
    </div>
  );
}
