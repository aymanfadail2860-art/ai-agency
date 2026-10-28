"use client";
import type { Finding } from "@agency/core";
import { ClassificationBadge } from "./badges";
import { SourceRefs } from "./source-context";

export function FindingList({ findings, empty = "Ingen fund." }: { findings: Finding[]; empty?: string }) {
  if (findings.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {findings.map((f) => (
        <li key={f.id} className="flex flex-col gap-1.5 text-sm sm:flex-row sm:items-start sm:gap-3">
          <span className="shrink-0 sm:w-[132px]">
            <ClassificationBadge classification={f.classification} />
          </span>
          <span className="leading-relaxed text-foreground">
            {f.text} <SourceRefs ids={f.sourceIds} />
          </span>
        </li>
      ))}
    </ul>
  );
}
