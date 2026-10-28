import * as React from "react";
import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert } from "lucide-react";
import { cn } from "./cn";

type AlertVariant = "info" | "warning" | "error" | "success";

const ALERT_STYLES: Record<AlertVariant, string> = {
  info: "border-accent/25 bg-accent/5 text-foreground [&>svg]:text-accent",
  warning: "border-warning/40 bg-warning/10 text-foreground [&>svg]:text-warning-foreground",
  error: "border-destructive/30 bg-destructive/5 text-foreground [&>svg]:text-destructive",
  success: "border-success/30 bg-success/5 text-foreground [&>svg]:text-success",
};

const ALERT_ICONS = { info: Info, warning: TriangleAlert, error: AlertCircle, success: CheckCircle2 };

export function Alert({ variant = "info", title, children, className }: { variant?: AlertVariant; title?: string; children?: React.ReactNode; className?: string }) {
  const Icon = ALERT_ICONS[variant];
  return (
    <div role={variant === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border p-4 text-sm", ALERT_STYLES[variant], className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} aria-hidden />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted-foreground">{icon}</div>}
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn("h-px w-full bg-border", className)} />;
}
