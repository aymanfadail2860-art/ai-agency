"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert, Badge, Button, Input, Label, Select } from "@agency/ui";
import { Banknote, Bot, Calculator, ChevronRight, Gauge, ListChecks, RotateCcw, TrendingUp, Truck } from "lucide-react";
import { CATEGORY_LABELS, DEFINITIONS, ENGINE_LABELS, type DashboardData, type Kpi } from "../analytics/compute";
import { PERIOD_LABELS, type PeriodKey } from "../analytics/filters";
import { fmtCount, fmtKr, fmtKrMonth, fmtUsd } from "./charts";

const SECTIONS = [
  { href: "/dashboard", label: "Executive Overview", icon: Gauge, exact: true },
  { href: "/dashboard/sales", label: "Salg", icon: TrendingUp },
  { href: "/dashboard/finance", label: "Økonomi", icon: Banknote },
  { href: "/dashboard/delivery", label: "Levering", icon: Truck },
  { href: "/dashboard/ai", label: "AI og agenter", icon: Bot },
  { href: "/dashboard/actions", label: "Action Center", icon: ListChecks },
];

/** Undernavigation. Filtrene følger med mellem områderne (samme URL-parametre). */
export function DashboardNav({ actionCount }: { actionCount: number }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const qs = params.toString();
  return (
    <nav aria-label="Dashboard" className="-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-border px-1" data-testid="dashboard-nav">
      {SECTIONS.map((s) => {
        const active = s.exact ? pathname === s.href : pathname.startsWith(s.href);
        return (
          <Link
            key={s.href}
            href={`${s.href}${qs ? `?${qs}` : ""}`}
            aria-current={active ? "page" : undefined}
            data-testid={`dash-nav-${s.href.split("/")[2] ?? "overview"}`}
            className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${active ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <s.icon className="h-4 w-4" /> {s.label}
            {s.href === "/dashboard/actions" && actionCount > 0 && <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{actionCount}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Globale filtre — én række over indholdet. Ændringer skrives i URL'en, og
 * serveren genberegner. Under genindlæsning beholdes visningen med reduceret
 * opacitet (ingen skeleton-flash).
 */
export function FilterBar({ data, error, children }: { data: DashboardData; error: string | null; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = React.useTransition();
  const f = data.filter;
  const [from, setFrom] = React.useState(f.from ?? "");
  const [to, setTo] = React.useState(f.to ?? "");
  const [custom, setCustom] = React.useState(f.period === "custom");

  function apply(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams();
    const merged = { period: f.period, from: f.from, to: f.to, customer: f.customer, category: f.category, projectStatus: f.projectStatus, agent: f.agent, engine: f.engine, ...patch };
    if (merged.period !== "custom") {
      merged.from = undefined;
      merged.to = undefined;
    }
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "period" && v === "30d")) next.set(k, v);
    start(() => router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  }

  const active = [f.customer, f.category, f.projectStatus, f.agent, f.engine].filter(Boolean).length;
  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-border bg-card p-3 shadow-card" data-testid="dashboard-filters">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center [&>select]:min-w-0 sm:[&>select]:w-[11.75rem]">
          <Select
            aria-label="Periode"
            value={custom ? "custom" : f.period}
            onChange={(e) => {
              const v = e.target.value as PeriodKey;
              if (v === "custom") setCustom(true);
              else {
                setCustom(false);
                apply({ period: v });
              }
            }}
            data-testid="filter-period"
          >
            {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((k) => (
              <option key={k} value={k}>
                {PERIOD_LABELS[k]}
              </option>
            ))}
          </Select>
          <Select aria-label="Kunde" value={f.customer ?? ""} onChange={(e) => apply({ customer: e.target.value || undefined })} data-testid="filter-customer">
            <option value="">Alle kunder</option>
            {data.options.customers.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
          <Select aria-label="Servicekategori" value={f.category ?? ""} onChange={(e) => apply({ category: e.target.value || undefined })} data-testid="filter-category">
            <option value="">Alle servicekategorier</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Select aria-label="Projektstatus" value={f.projectStatus ?? ""} onChange={(e) => apply({ projectStatus: e.target.value || undefined })} data-testid="filter-project-status">
            <option value="">Alle projektstatusser</option>
            <option value="active">Aktive</option>
            <option value="overdue">Forsinkede</option>
            <option value="on_hold">På pause</option>
            <option value="delivered">Leverede</option>
            <option value="maintenance">I drift</option>
            <option value="cancelled">Annullerede</option>
          </Select>
          <Select aria-label="AI-agent" value={f.agent ?? ""} onChange={(e) => apply({ agent: e.target.value || undefined })} data-testid="filter-agent">
            <option value="">Alle agenter</option>
            {data.options.agents.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
          <Select aria-label="AI-motor" value={f.engine ?? ""} onChange={(e) => apply({ engine: e.target.value || undefined })} data-testid="filter-engine">
            <option value="">Alle motorer</option>
            {Object.entries(ENGINE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Button variant="ghost" disabled={!active && f.period === "30d" && !custom} onClick={() => (setCustom(false), apply({ period: "30d", customer: undefined, category: undefined, projectStatus: undefined, agent: undefined, engine: undefined }))} data-testid="filter-reset">
            <RotateCcw /> Nulstil
          </Button>
        </div>
        {custom && (
          <form
            className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              apply({ period: "custom", from, to });
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="f-from">Fra</Label>
              <Input id="f-from" type="date" required value={from} onChange={(e) => setFrom(e.target.value)} data-testid="filter-from" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="f-to">Til</Label>
              <Input id="f-to" type="date" required value={to} onChange={(e) => setTo(e.target.value)} data-testid="filter-to" />
            </div>
            <Button type="submit" variant="outline" data-testid="filter-apply-range">
              Anvend interval
            </Button>
          </form>
        )}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{data.period.label}</span> · flow-tal tæller hændelser i perioden; beholdninger er status pr. nu.
          </span>
          {active > 0 && <Badge variant="info">{active} filter{active > 1 ? "e" : ""} aktiv{active > 1 ? "e" : ""}</Badge>}
        </p>
      </div>
      {error && <Alert variant="warning">Filteret kunne ikke anvendes: {error} Standardperioden vises.</Alert>}
      <div className={`transition-opacity duration-200 ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
        {children}
      </div>
    </div>
  );
}

export function formatKpi(k: Pick<Kpi, "value" | "unit">): string {
  if (k.value === null) return "–";
  switch (k.unit) {
    case "dkk":
      return fmtKr(k.value);
    case "dkk_month":
      return fmtKrMonth(k.value);
    case "usd":
      return fmtUsd(k.value);
    case "percent":
      return `${Math.round(k.value * 100)} %`;
    case "days":
      return `${k.value.toLocaleString("da-DK")} dage`;
    default:
      return fmtCount(k.value);
  }
}

export function KpiTile({ kpi }: { kpi: Kpi }) {
  const tone = kpi.tone === "danger" && kpi.value ? "text-destructive" : kpi.tone === "warning" && kpi.value ? "text-warning-foreground" : "text-foreground";
  return (
    <Link href={kpi.href} data-testid={`kpi-${kpi.key}`} className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex h-full flex-col justify-between gap-2 rounded-xl border border-border bg-card p-4 shadow-card transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-accent/40 group-hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <p className={`text-2xl font-semibold leading-none tracking-tight ${tone}`} data-testid={`kpi-${kpi.key}-value`}>
          {formatKpi(kpi)}
        </p>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${kpi.kind === "stock" ? "bg-foreground/40" : "bg-accent"}`} aria-hidden />
          <span className="truncate">
            {kpi.kind === "stock" ? "Pr. nu" : "Periode"} · {kpi.sub}
          </span>
        </p>
      </div>
    </Link>
  );
}

/** Beregningsmetoder for de viste nøgletal. */
export function Definitions({ keys }: { keys: string[] }) {
  const list = DEFINITIONS.filter((d) => keys.includes(d.key));
  return (
    <details className="rounded-xl border border-border bg-card p-4 text-sm shadow-card" data-testid="definitions">
      <summary className="flex cursor-pointer items-center gap-2 font-medium">
        <Calculator className="h-4 w-4 text-accent" /> Beregningsmetoder og datakilder
      </summary>
      <dl className="mt-3 grid gap-3 md:grid-cols-2">
        {list.map((d) => (
          <div key={d.key} className="space-y-0.5">
            <dt className="flex items-center gap-2 font-medium">
              {d.label}
              <Badge variant={d.kind === "estimate" ? "warning" : "outline"}>{d.kind === "stock" ? "Beholdning" : d.kind === "flow" ? "Periode" : "Estimat"}</Badge>
            </dt>
            <dd className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{d.source}.</span> {d.rule}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
