"use client";
import * as React from "react";
import { engineLabel } from "@agency/orchestrator";
import type { PerformanceReport } from "@agency/orchestrator/server";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@agency/ui";
import { formatUsd } from "./status";

/** Serie-farve: valideret mod AOS' mørke flade (dataviz-validator: alle checks bestået). */
const SERIES = "#3987e5";
const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)} %`);

function DailyJobsChart({ daily }: { daily: PerformanceReport["daily"] }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const [table, setTable] = React.useState(false);
  const max = Math.max(1, ...daily.map((d) => d.jobs));
  const W = 640;
  const H = 180;
  const pad = { l: 28, r: 8, t: 12, b: 24 };
  const band = (W - pad.l - pad.r) / daily.length;
  const bar = Math.min(24, band * 0.6);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = Array.from(new Set([0, Math.ceil(max / 2), max]));
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Opgaver pr. dag</CardTitle>
          <CardDescription>Seneste {daily.length} dage · antal oprettede opgaver</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => setTable(!table)} aria-pressed={table}>
          {table ? "Vis graf" : "Vis tabel"}
        </Button>
      </CardHeader>
      <CardContent>
        {table ? (
          <table className="w-full text-sm" data-testid="daily-table">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-1.5 font-medium">Dag</th>
                <th className="py-1.5 text-right font-medium">Opgaver</th>
                <th className="py-1.5 text-right font-medium">Gennemført</th>
                <th className="py-1.5 text-right font-medium">Fejlet</th>
                <th className="py-1.5 text-right font-medium">API-omkostning</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {daily.map((d) => (
                <tr key={d.day} className="border-t border-border/60">
                  <td className="py-1.5">{d.day}</td>
                  <td className="py-1.5 text-right">{d.jobs}</td>
                  <td className="py-1.5 text-right">{d.succeeded}</td>
                  <td className="py-1.5 text-right">{d.failed}</td>
                  <td className="py-1.5 text-right">{formatUsd(d.apiCostUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Opgaver pr. dag: ${daily.map((d) => `${d.day} ${d.jobs}`).join(", ")}`}>
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="hsl(var(--border))" strokeWidth={1} />
                  <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="fill-[hsl(var(--muted-foreground))] text-[10px] tabular-nums">
                    {t}
                  </text>
                </g>
              ))}
              {daily.map((d, i) => {
                const cx = pad.l + band * i + band / 2;
                const h = H - pad.b - y(d.jobs);
                const r = Math.min(4, h);
                return (
                  <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${d.day}: ${d.jobs} opgaver`}>
                    <rect x={pad.l + band * i} y={pad.t} width={band} height={H - pad.t - pad.b} fill="transparent" />
                    {d.jobs > 0 && (
                      <path
                        d={`M${cx - bar / 2},${H - pad.b} V${y(d.jobs) + r} Q${cx - bar / 2},${y(d.jobs)} ${cx - bar / 2 + r},${y(d.jobs)} H${cx + bar / 2 - r} Q${cx + bar / 2},${y(d.jobs)} ${cx + bar / 2},${y(d.jobs) + r} V${H - pad.b} Z`}
                        fill={SERIES}
                        opacity={hover === null || hover === i ? 1 : 0.45}
                      />
                    )}
                    {(i % Math.ceil(daily.length / 7) === 0 || i === daily.length - 1) && (
                      <text x={cx} y={H - 8} textAnchor="middle" className="fill-[hsl(var(--muted-foreground))] text-[10px]">
                        {d.day.slice(8)}/{d.day.slice(5, 7)}
                      </text>
                    )}
                  </g>
                );
              })}
              <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
            </svg>
            {hover !== null && daily[hover] && (
              <div className="pointer-events-none absolute top-0 rounded-md border border-border bg-card px-3 py-2 text-xs shadow-lg" style={{ left: `${((pad.l + (W - pad.l - pad.r) / daily.length * (hover + 0.5)) / W) * 100}%`, transform: "translateX(-50%)" }} role="status">
                <p className="font-medium">{daily[hover].day}</p>
                <p className="tabular-nums">{daily[hover].jobs} opgaver · {daily[hover].succeeded} gennemført · {daily[hover].failed} fejlet</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EngineBars({ engines }: { engines: PerformanceReport["engines"] }) {
  const max = Math.max(1, ...engines.map((e) => e.jobs));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Motorfordeling</CardTitle>
        <CardDescription>Antal opgaver pr. eksekveringsmotor</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4" data-testid="engine-distribution">
        {engines.map((e) => (
          <div key={e.engine} className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span>{engineLabel(e.engine)}</span>
              <span className="tabular-nums text-muted-foreground">
                {e.jobs} · {e.engine === "claude_api" ? formatUsd(e.apiCostUsd) : e.engine === "claude_code" ? `${e.subscriptionRuns} kørsler (abonnement)` : "ingen AI-omkostning"}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted" aria-hidden>
              {e.jobs > 0 && <div className="h-2 rounded-full" style={{ width: `${Math.max(2, (e.jobs / max) * 100)}%`, background: SERIES }} />}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function PerformanceView({ report }: { report: PerformanceReport }) {
  const t = report.totals;
  return (
    <div className="space-y-6" data-testid="performance">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Opgaver i alt", t.jobs.toLocaleString("da-DK")],
          ["API-omkostning", formatUsd(t.apiCostUsd)],
          ["Tokens (ind/ud)", `${t.inputTokens.toLocaleString("da-DK")} / ${t.outputTokens.toLocaleString("da-DK")}`],
          ["Claude Code-kørsler", `${t.subscriptionRuns} (abonnement)`],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="space-y-1 p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold tabular-nums">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Claude Code-forbrug rapporteres som antal kørsler, fordi abonnementet ikke giver sammenlignelige forbrugsdata pr. kørsel. API-omkostninger er estimater ud fra registrerede tokens.</p>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <DailyJobsChart daily={report.daily} />
        <EngineBars engines={report.engines} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Agenter</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm" data-testid="agent-performance">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-medium">Agent</th>
                <th className="px-4 py-2.5 text-right font-medium">Opgaver</th>
                <th className="px-4 py-2.5 text-right font-medium">Gennemførelsesgrad</th>
                <th className="px-4 py-2.5 text-right font-medium">Fejlrate</th>
                <th className="px-4 py-2.5 text-right font-medium">Gns. tid</th>
                <th className="px-4 py-2.5 text-right font-medium">API-omkostning</th>
                <th className="px-4 py-2.5 text-right font-medium">Claude Code</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {report.agents.map((a) => (
                <tr key={a.agentId} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5 font-medium">{a.name}</td>
                  <td className="px-4 py-2.5 text-right">{a.total}</td>
                  <td className="px-4 py-2.5 text-right">{pct(a.completionRate)}</td>
                  <td className="px-4 py-2.5 text-right">{pct(a.errorRate)}</td>
                  <td className="px-4 py-2.5 text-right">{a.avgDurationSec === null ? "–" : `${a.avgDurationSec.toLocaleString("da-DK")} sek.`}</td>
                  <td className="px-4 py-2.5 text-right">{formatUsd(a.apiCostUsd)}</td>
                  <td className="px-4 py-2.5 text-right">{a.subscriptionRuns}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Omkostning pr. modul</CardTitle>
          </CardHeader>
          <CardContent>
            {report.modules.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ingen registrerede opgaver.</p>
            ) : (
              <ul className="divide-y divide-border/60 text-sm tabular-nums">
                {report.modules.map((m) => (
                  <li key={m.module} className="flex justify-between py-2">
                    <span className="capitalize">{m.module}</span>
                    <span className="text-muted-foreground">
                      {m.jobs} opgaver · {formatUsd(m.apiCostUsd)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Omkostning pr. kunde/brand</CardTitle>
          </CardHeader>
          <CardContent>
            {report.customers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ingen opgaver knyttet til kunder endnu.</p>
            ) : (
              <ul className="divide-y divide-border/60 text-sm tabular-nums">
                {report.customers.map((c) => (
                  <li key={c.customer} className="flex justify-between gap-3 py-2">
                    <span className="truncate">{c.customer}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {c.jobs} · {formatUsd(c.apiCostUsd)}
                      {c.subscriptionRuns > 0 && ` · ${c.subscriptionRuns} CC`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
