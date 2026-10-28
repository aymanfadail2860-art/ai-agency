import * as React from "react";
import { Clock } from "lucide-react";
import { cn } from "./cn";

/** Fælles markering for moduler, der endnu ikke er implementeret. */
export function PendingModuleNotice({ message }: { message: string }) {
  return (
    <div role="status" data-testid="pending-notice" className="flex items-start gap-3 rounded-xl border border-border bg-card p-5 shadow-card">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Clock className="h-4 w-4" />
      </span>
      <div>
        <p className="font-semibold text-foreground">{message}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Nedenfor ses et visuelt preview af de områder, modulet skal dække. Der er ingen funktionalitet bag, og ingen data på siden repræsenterer rigtige kunder eller projekter.
        </p>
      </div>
    </div>
  );
}

/** Visuelt preview-kort for et kommende område (ikke interaktivt). */
export function PreviewArea({ icon, title, description, children, className }: { icon: React.ReactNode; title: string; description: string; children?: React.ReactNode; className?: string }) {
  return (
    <section aria-label={`${title} (preview)`} className={cn("rounded-xl border border-dashed border-border bg-card/70 p-5", className)}>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/5 text-primary [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div aria-hidden="true" className="select-none">{children}</div>
    </section>
  );
}

/** Neutral pladsholderlinje — signalerer layout uden at vise data. */
export function PlaceholderLine({ className }: { className?: string }) {
  return <div className={cn("h-2.5 rounded-full bg-muted", className)} />;
}
