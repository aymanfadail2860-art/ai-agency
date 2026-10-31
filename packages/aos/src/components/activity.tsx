"use client";
import * as React from "react";
import Link from "next/link";
import { engineLabel } from "@agency/orchestrator";
import type { ActivityItem } from "@agency/orchestrator/server";
import { apiFetch, Badge, Card, CardContent, CardHeader, CardTitle } from "@agency/ui";
import { EVENT_KIND_LABELS as KIND_LABEL } from "./status";


const KIND_VARIANT: Record<string, "success" | "destructive" | "warning" | "info" | "muted" | "outline"> = {
  completed: "success",
  failed: "destructive",
  callback_rejected: "destructive",
  approval_requested: "warning",
  rejected: "warning",
  dispatched: "info",
  tool_call: "info",
  test: "info",
  file: "info",
};

/**
 * LIVE ACTIVITY — registrerede hændelser fra Job Center, nyeste først. Polles hvert 4. sekund.
 * Detaljeniveauet afhænger af motoren: intern software og Claude API rapporterer arbejdstrin
 * direkte; Claude Code rapporterer kun det, sessionen selv sender tilbage.
 */
export function ActivityFeed({ initial, agentNames, limit }: { initial: ActivityItem[]; agentNames: Record<string, string>; limit?: number }) {
  const [items, setItems] = React.useState(initial);
  React.useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await apiFetch<{ items: ActivityItem[] }>("/api/aos/activity");
        setItems(res.items);
      } catch {
        /* behold seneste visning */
      }
    }, 4000);
    return () => clearInterval(timer);
  }, []);
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          Live Activity
        </CardTitle>
        {limit && (
          <Link href="/aos/activity" className="text-xs text-accent hover:underline">
            Se alt →
          </Link>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {shown.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground" data-testid="activity-empty">
            Ingen registreret aktivitet endnu. Hændelser vises her, så snart en opgave oprettes.
          </p>
        ) : (
          <ul className="divide-y divide-border/60" data-testid="activity-feed">
            {shown.map((e, i) => (
              <li key={`${e.jobId}-${e.at}-${i}`} className="flex gap-3 px-5 py-3 text-sm" data-testid="activity-item">
                <time dateTime={e.at} className="w-16 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                  {new Date(e.at).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </time>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={KIND_VARIANT[e.kind] ?? "outline"}>{KIND_LABEL[e.kind] ?? e.kind}</Badge>
                    {e.source === "engine" && <Badge variant="info">Rapporteret af motoren</Badge>}
                    <Link href={`/aos/jobs/${e.jobId}`} className="truncate text-xs text-accent hover:underline">
                      {e.jobTitle}
                    </Link>
                  </div>
                  <p className="break-words">{e.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.agentId ? (agentNames[e.agentId] ?? e.agentId) : "Ingen agent"} · {engineLabel(e.engine)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
