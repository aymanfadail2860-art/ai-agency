"use client";
import * as React from "react";
import type { ResearchSource } from "@agency/core";
import { SOURCE_KIND_LABELS } from "@agency/core";
import { Badge, Button } from "@agency/ui";
import { formatDateTime } from "@agency/shared";
import { ExternalLink, FlaskConical, X } from "lucide-react";

interface SourceCtx {
  sources: ResearchSource[];
  indexOf: (id: string) => number;
  open: (id: string) => void;
}

const Ctx = React.createContext<SourceCtx | null>(null);

/** Gør kilder tilgængelige for hele rapporten og viser en kildeoversigt i et panel. */
export function SourceProvider({ sources, children }: { sources: ResearchSource[]; children: React.ReactNode }) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const value = React.useMemo<SourceCtx>(
    () => ({ sources, indexOf: (id) => sources.findIndex((s) => s.id === id), open: setOpenId }),
    [sources],
  );
  const current = sources.find((s) => s.id === openId) ?? null;
  return (
    <Ctx.Provider value={value}>
      {children}
      {current && <SourceDialog source={current} index={value.indexOf(current.id) + 1} onClose={() => setOpenId(null)} />}
    </Ctx.Provider>
  );
}

export function SourceRefs({ ids }: { ids: string[] }) {
  const ctx = React.useContext(Ctx);
  if (!ctx || ids.length === 0) return null;
  const unique = Array.from(new Set(ids)).filter((id) => ctx.indexOf(id) >= 0);
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {unique.map((id) => {
        const source = ctx.sources[ctx.indexOf(id)];
        return (
          <button
            key={id}
            type="button"
            onClick={() => ctx.open(id)}
            title={`${SOURCE_KIND_LABELS[source.kind]}: ${source.title}`}
            className="rounded border border-border bg-muted/60 px-1.5 py-px text-[11px] font-medium tabular-nums text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
          >
            [{ctx.indexOf(id) + 1}]
          </button>
        );
      })}
    </span>
  );
}

export function useSources() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useSources kræver SourceProvider");
  return ctx;
}

function SourceDialog({ source, index, onClose }: { source: ResearchSource; index: number; onClose: () => void }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/30 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Kilde ${index}`} className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Kilde [{index}]</Badge>
              <Badge variant="secondary">{SOURCE_KIND_LABELS[source.kind]}</Badge>
              {source.isDemo && (
                <Badge variant="demo">
                  <FlaskConical /> Fiktiv demokilde
                </Badge>
              )}
            </div>
            <h3 className="text-lg font-semibold">{source.title}</h3>
            <p className="text-xs text-muted-foreground">
              {source.provider} · hentet {formatDateTime(source.retrievedAt)}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Luk">
            <X />
          </Button>
        </div>
        {source.url &&
          (source.isDemo ? (
            <p className="mb-4 break-all text-sm text-muted-foreground">{source.url} (fiktiv adresse)</p>
          ) : (
            <a href={source.url} target="_blank" rel="noopener noreferrer nofollow" className="mb-4 inline-flex items-center gap-1 break-all text-sm text-accent hover:underline">
              {source.url} <ExternalLink className="h-3 w-3" />
            </a>
          ))}
        <pre className="whitespace-pre-wrap rounded-lg bg-muted/60 p-4 font-sans text-sm leading-relaxed text-foreground">{source.excerpt}</pre>
      </div>
    </div>
  );
}
