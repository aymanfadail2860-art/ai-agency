import * as React from "react";
import { AlertTriangle, Ban, CheckCircle2, Circle, CircleDot, FlaskConical, Hourglass, Loader2, Lock, PauseCircle } from "lucide-react";
import { Badge } from "@agency/ui";
import {
  PHASES,
  PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  TASK_STATUS_LABELS,
  phaseIndex,
  type Phase,
  type Priority,
  type ProductionProject,
  type ProjectStatus,
  type TaskStatus,
} from "../contracts";

export const formatKr = (n: number) => `${Math.round(n).toLocaleString("da-DK")} kr.`;
export const formatDate = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" }) : "–");

export function PriorityBadge({ priority }: { priority: Priority }) {
  const variant = priority === "critical" ? "destructive" : priority === "high" ? "warning" : priority === "low" ? "muted" : "secondary";
  return (
    <Badge variant={variant} data-priority={priority}>
      {priority === "critical" && <AlertTriangle />} {PRIORITY_LABELS[priority]}
    </Badge>
  );
}

const TASK_STYLE: Record<TaskStatus, { variant: "muted" | "info" | "destructive" | "warning" | "success"; Icon: React.ComponentType<{ className?: string }> }> = {
  todo: { variant: "muted", Icon: Circle },
  in_progress: { variant: "info", Icon: Loader2 },
  blocked: { variant: "destructive", Icon: Ban },
  review: { variant: "warning", Icon: CircleDot },
  done: { variant: "success", Icon: CheckCircle2 },
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const { variant, Icon } = TASK_STYLE[status];
  return (
    <Badge variant={variant} data-task-status={status}>
      <Icon /> {TASK_STATUS_LABELS[status]}
    </Badge>
  );
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const variant = status === "active" ? "info" : status === "delivered" || status === "maintenance" ? "success" : status === "cancelled" ? "muted" : "warning";
  return <Badge variant={variant}>{status === "on_hold" && <PauseCircle />} {PROJECT_STATUS_LABELS[status]}</Badge>;
}

export function SimulatedBadge({ label = "Demo-simulering" }: { label?: string }) {
  return (
    <Badge variant="demo" title="Simuleret i demoen — ikke udført af en AI-agent">
      <FlaskConical /> {label}
    </Badge>
  );
}

export function OverdueBadge() {
  return (
    <Badge variant="destructive" data-testid="overdue-badge">
      <Hourglass /> Forsinket
    </Badge>
  );
}

export function GateBadge() {
  return (
    <Badge variant="warning">
      <Lock /> Afventer godkendelse
    </Badge>
  );
}

/** Interaktiv faseproces: viser afsluttede, aktuelle og kommende faser; klik vælger en fase. */
export function PhaseTrack({
  project,
  selected,
  onSelect,
  taskCounts,
  compact = false,
}: {
  project: Pick<ProductionProject, "phase" | "pendingGate">;
  selected?: Phase | null;
  onSelect?: (phase: Phase) => void;
  taskCounts?: Partial<Record<Phase, { done: number; total: number }>>;
  compact?: boolean;
}) {
  const current = phaseIndex(project.phase);
  return (
    <ol className={compact ? "flex gap-1" : "grid grid-cols-3 gap-2 sm:grid-cols-6 xl:grid-cols-11"} data-testid="phase-track" aria-label="Projektfaser">
      {PHASES.map((p, i) => {
        const state = i < current ? "done" : i === current ? "current" : "upcoming";
        const counts = taskCounts?.[p.key];
        if (compact) {
          return (
            <li
              key={p.key}
              title={`${p.label}${state === "current" ? " (aktuel)" : state === "done" ? " (afsluttet)" : ""}`}
              className={`h-1.5 flex-1 rounded-full ${state === "done" ? "bg-success" : state === "current" ? (project.pendingGate ? "bg-warning" : "bg-accent") : "bg-muted"}`}
            />
          );
        }
        const body = (
          <>
            <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {state === "done" ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : state === "current" ? (project.pendingGate ? <Lock className="h-3.5 w-3.5 text-warning-foreground" /> : <CircleDot className="h-3.5 w-3.5 text-accent" />) : <Circle className="h-3.5 w-3.5" />}
              {i + 1}
            </span>
            <span className="text-left text-xs font-medium leading-tight text-foreground">{p.short}</span>
            {counts && counts.total > 0 && (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {counts.done}/{counts.total} opgaver
              </span>
            )}
          </>
        );
        const cls = `flex h-full w-full flex-col items-start gap-1 rounded-lg border p-2.5 transition-colors ${
          state === "current" ? "border-accent bg-accent/5 ring-1 ring-accent/30" : state === "done" ? "border-success/30 bg-success/5" : "border-border bg-card"
        } ${selected === p.key ? "ring-2 ring-ring" : ""}`;
        return (
          <li key={p.key} data-phase={p.key} data-phase-state={state}>
            {onSelect ? (
              <button type="button" onClick={() => onSelect(p.key)} className={`${cls} hover:border-accent/60`} aria-pressed={selected === p.key} aria-label={`${p.label}: ${state === "done" ? "afsluttet" : state === "current" ? "aktuel fase" : "kommende"}`}>
                {body}
              </button>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
