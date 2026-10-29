import type { AnalysisEngine, ClaimClassification, Complexity, Priority } from "@agency/core";
import { CLASSIFICATION_LABELS, COMPLEXITY_LABELS, PRIORITY_LABELS } from "@agency/core";
import { Badge } from "@agency/ui";
import { Bot, CheckCircle2, FlaskConical, HelpCircle, ListChecks, Scale } from "lucide-react";

export function ClassificationBadge({ classification }: { classification: ClaimClassification }) {
  if (classification === "fact")
    return (
      <Badge variant="success" title="Direkte observeret i en navngiven kilde">
        <CheckCircle2 /> {CLASSIFICATION_LABELS.fact}
      </Badge>
    );
  if (classification === "assessment")
    return (
      <Badge variant="info" title="Vurdering på baggrund af kilderne">
        <Scale /> {CLASSIFICATION_LABELS.assessment}
      </Badge>
    );
  if (classification === "unknown")
    return (
      <Badge variant="outline" title="Kan ikke afgøres ud fra de tilgængelige kilder">
        <HelpCircle /> {CLASSIFICATION_LABELS.unknown}
      </Badge>
    );
  return (
    <Badge variant="warning" title="Antagelse, der skal verificeres med virksomheden">
      <HelpCircle /> {CLASSIFICATION_LABELS.hypothesis}
    </Badge>
  );
}

export function EngineBadge({ engine, model }: { engine: AnalysisEngine; model?: string | null }) {
  if (engine === "claude")
    return (
      <Badge variant="info" title={model ?? undefined}>
        <Bot /> AI-analyse (Claude)
      </Badge>
    );
  if (engine === "demo")
    return (
      <Badge variant="demo">
        <FlaskConical /> Demo-analyse
      </Badge>
    );
  return (
    <Badge variant="secondary" title="Gennemsigtig regelbaseret analyse uden AI">
      <ListChecks /> Regelbaseret analyse
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const variant = priority === "high" ? "default" : priority === "medium" ? "secondary" : "muted";
  return <Badge variant={variant}>Prioritet: {PRIORITY_LABELS[priority]}</Badge>;
}

export function ComplexityBadge({ complexity }: { complexity: Complexity }) {
  return <Badge variant="outline">Kompleksitet: {COMPLEXITY_LABELS[complexity]}</Badge>;
}

export function ScoreRing({ score, size = 52 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 70 ? "hsl(var(--success))" : score >= 55 ? "hsl(var(--accent))" : "hsl(var(--muted-foreground))";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`AI Opportunity Score ${score} af 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--muted))" strokeWidth={5} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={5} fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} strokeLinecap="round" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums">{score}</span>
    </div>
  );
}
