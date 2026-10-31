import type { AgentRuntimeStatus, ApprovalCategory, JobStatus } from "./models";

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  queued: "I kø",
  awaiting_approval: "Afventer godkendelse",
  dispatched: "Sendt til motor",
  running: "Kører",
  succeeded: "Gennemført",
  failed: "Fejlet",
  cancelled: "Annulleret",
  blocked: "Blokeret",
};

export const AGENT_STATUS_LABELS: Record<AgentRuntimeStatus, string> = {
  working: "Arbejder",
  waiting: "Afventer godkendelse",
  idle: "Ledig",
  error: "Fejl i seneste opgave",
  disabled: "Deaktiveret",
};

export const APPROVAL_CATEGORY_LABELS: Record<ApprovalCategory, string> = {
  agent_change: "Ændring af agent",
  paid_action: "Betalt handling",
  production: "Produktion",
  deployment: "Deployment",
  customer_system: "Ændring i kundesystem",
  mass_action: "Massehandling",
  destructive_database: "Destruktiv databaseændring",
  customer_communication: "Kommunikation til kunde",
};
