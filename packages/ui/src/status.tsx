import * as React from "react";
import { Clock, FlaskConical, ShieldCheck } from "lucide-react";
import { Badge } from "./badge";

/** Tydelig markering af demo- og live-data — bruges overalt i platformen. */
export function ModeBadge({ mode }: { mode: "demo" | "live" }) {
  return mode === "demo" ? (
    <Badge variant="demo" data-testid="mode-badge">
      <FlaskConical /> Demo
    </Badge>
  ) : (
    <Badge variant="success" data-testid="mode-badge">
      <ShieldCheck /> Live
    </Badge>
  );
}

export function PendingBadge() {
  return (
    <Badge variant="muted">
      <Clock /> Afventer
    </Badge>
  );
}

export function ActiveBadge() {
  return <Badge variant="success">Aktiv</Badge>;
}
