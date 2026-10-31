import * as React from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, CirclePause, Clock3, Cpu, Loader2, Lock, Send, Ban, XCircle } from "lucide-react";
import { AGENT_STATUS_LABELS, JOB_STATUS_LABELS, engineLabel, type AgentRuntimeStatus, type EngineKind, type JobStatus } from "@agency/orchestrator";
import { Badge } from "@agency/ui";

const JOB_STATUS_STYLE: Record<JobStatus, { variant: "success" | "warning" | "info" | "muted" | "destructive"; Icon: React.ComponentType<{ className?: string }> }> = {
  queued: { variant: "muted", Icon: CircleDashed },
  awaiting_approval: { variant: "warning", Icon: Lock },
  dispatched: { variant: "info", Icon: Send },
  running: { variant: "info", Icon: Loader2 },
  succeeded: { variant: "success", Icon: CheckCircle2 },
  failed: { variant: "destructive", Icon: XCircle },
  cancelled: { variant: "muted", Icon: Ban },
  blocked: { variant: "warning", Icon: AlertTriangle },
};

export function JobStatusBadge({ status, overdue }: { status: JobStatus; overdue?: boolean }) {
  if (overdue) {
    return (
      <Badge variant="warning" data-status="overdue">
        <Clock3 /> Forsinket
      </Badge>
    );
  }
  const { variant, Icon } = JOB_STATUS_STYLE[status];
  return (
    <Badge variant={variant} data-status={status}>
      <Icon className={status === "running" ? "animate-spin motion-reduce:animate-none" : undefined} /> {JOB_STATUS_LABELS[status]}
    </Badge>
  );
}

const AGENT_STATUS_STYLE: Record<AgentRuntimeStatus, { variant: "success" | "warning" | "info" | "muted" | "destructive"; Icon: React.ComponentType<{ className?: string }> }> = {
  working: { variant: "info", Icon: Loader2 },
  waiting: { variant: "warning", Icon: Lock },
  idle: { variant: "muted", Icon: CirclePause },
  error: { variant: "destructive", Icon: AlertTriangle },
  disabled: { variant: "muted", Icon: Ban },
};

export function AgentStatusBadge({ status }: { status: AgentRuntimeStatus }) {
  const { variant, Icon } = AGENT_STATUS_STYLE[status];
  return (
    <Badge variant={variant} data-agent-status={status}>
      <Icon className={status === "working" ? "animate-spin motion-reduce:animate-none" : undefined} /> {AGENT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function EngineBadge({ engine }: { engine: EngineKind | null }) {
  return (
    <Badge variant="outline">
      <Cpu /> {engineLabel(engine)}
    </Badge>
  );
}

export function DataBasisNote({ mode }: { mode: "demo" | "live" }) {
  return (
    <p className="text-xs text-muted-foreground" data-testid="aos-data-basis">
      {mode === "demo" ? (
        <>
          <Badge variant="demo" className="mr-1.5">Demo</Badge> Tal og aktivitet stammer fra registrerede job i Demo Mode (fiktive kunder).
        </>
      ) : (
        "Tal og aktivitet stammer udelukkende fra registrerede job i Live Mode."
      )}
    </p>
  );
}

export const formatUsd = (n: number) => `${n.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USD`;

export function formatDuration(ms: number | null): string {
  if (ms === null) return "–";
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 100) / 10;
  if (s < 90) return `${s.toLocaleString("da-DK")} sek.`;
  return `${Math.round(s / 6) / 10} min.`;
}

/** Danske etiketter for hændelsestyper i tidslinjer og aktivitetsstrøm. */
export const EVENT_KIND_LABELS: Record<string, string> = {
  created: "Oprettet",
  routed: "Routet",
  approval_requested: "Godkendelse anmodet",
  approved: "Godkendt",
  rejected: "Afvist",
  dispatched: "Sendt til motor",
  started: "Startet",
  step: "Arbejdstrin",
  tool_call: "Værktøjskald",
  file: "Fil",
  test: "Test",
  cost: "Omkostning",
  completed: "Afsluttet",
  failed: "Fejl",
  cancelled: "Annulleret",
  retry: "Genforsøg",
  callback_rejected: "Tilbagemelding afvist",
};
