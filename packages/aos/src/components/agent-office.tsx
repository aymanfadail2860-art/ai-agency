"use client";
import * as React from "react";
import Link from "next/link";
import { AGENT_STATUS_LABELS, ZONE_LABELS, engineLabel, type AgentRuntimeStatus, type AgentZone } from "@agency/orchestrator";
import type { AgentState, CommandCenterStats } from "@agency/orchestrator/server";
import { apiFetch, Badge, Card, CardContent, CardHeader, CardTitle } from "@agency/ui";
import { formatDateTime } from "@agency/shared";
import { AgentStatusBadge, EngineBadge, JobStatusBadge } from "./status";

/**
 * AGENT OFFICE — futuristisk 2D/isometrisk kontor.
 * Hver agent har en arbejdsstation i sin zone. Status, skærmlys og etiketter
 * udledes udelukkende af registrerede job (via /api/aos/overview). En agent
 * uden igangværende job vises som ledig — der er ingen dekorativ "aktivitet".
 *
 * Geometri: isometrisk projektion af et 12×12-flisegulv delt i 3×3 zoner.
 * Nye agenter placeres i ledige zoner; layoutet kan udvides med flere rækker.
 */

const TW = 44; // halv flisebredde
const TH = 22; // halv flisehøjde
const OX = 540;
const OY = 70;
const iso = (x: number, y: number, z = 0): [number, number] => [OX + (x - y) * TW, OY + (x + y) * TH - z];
const pts = (...p: Array<[number, number]>) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

const ZONE_SLOTS: Record<AgentZone, [number, number]> = {
  research: [0, 0],
  sales: [1, 0],
  engineering: [2, 0],
  quality: [0, 1],
  command: [1, 1],
  integrations: [2, 1],
  customers: [0, 2],
  intelligence: [1, 2],
};
const ALL_SLOTS: Array<[number, number]> = [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => [x, y] as [number, number]));

const STATUS_GLYPH: Record<AgentRuntimeStatus, string> = { working: "▶", waiting: "⏸", idle: "◦", error: "!", disabled: "×" };

function IsoBox({ x, y, w, d, h, z = 0, top, left, right, stroke }: { x: number; y: number; w: number; d: number; h: number; z?: number; top: string; left: string; right: string; stroke?: string }) {
  const a = iso(x, y, z + h);
  const b = iso(x + w, y, z + h);
  const c = iso(x + w, y + d, z + h);
  const e = iso(x, y + d, z + h);
  const c0 = iso(x + w, y + d, z);
  const e0 = iso(x, y + d, z);
  const b0 = iso(x + w, y, z);
  return (
    <g stroke={stroke ?? "none"} strokeWidth={stroke ? 1 : 0}>
      <polygon points={pts(e, c, c0, e0)} fill={left} />
      <polygon points={pts(c, b, b0, c0)} fill={right} />
      <polygon points={pts(a, b, c, e)} fill={top} />
    </g>
  );
}

function Workstation({ state, slot, selected, onSelect }: { state: AgentState; slot: [number, number]; selected: boolean; onSelect: () => void }) {
  const { agent, status, currentJob } = state;
  const [sx, sy] = slot;
  const bx = sx * 4;
  const by = sy * 4;
  const color = status === "disabled" ? "#5b6478" : agent.color;
  const active = status === "working";
  const floor = [iso(bx + 0.25, by + 0.25), iso(bx + 3.75, by + 0.25), iso(bx + 3.75, by + 3.75), iso(bx + 0.25, by + 3.75)];
  const [hx, hy] = iso(bx + 2.1, by + 2.75, 0);
  const label = iso(bx + 2, by + 2, 104);
  return (
    <g
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${agent.name}, ${agent.role}: ${AGENT_STATUS_LABELS[status]}${currentJob ? ` — ${currentJob.title}` : ""}`}
      data-testid={`office-agent-${agent.key}`}
      data-agent-status={status}
      className="aos-station cursor-pointer outline-none"
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <polygon points={pts(...floor)} fill={color} fillOpacity={selected ? 0.2 : 0.08} stroke={color} strokeOpacity={selected ? 0.9 : 0.35} strokeWidth={selected ? 2 : 1} className="aos-zone" />
      {/* skrivebord + skærm */}
      <IsoBox x={bx + 1.2} y={by + 1.35} w={1.9} d={0.9} h={16} top="#1e2a4a" left="#141d36" right="#18233f" stroke="#2a3a63" />
      <IsoBox x={bx + 1.55} y={by + 1.4} w={1.1} d={0.12} h={22} z={16} top="#0b1226" left="#0b1226" right="#0f1830" />
      <polygon
        points={pts(iso(bx + 1.62, by + 1.53, 19), iso(bx + 2.58, by + 1.53, 19), iso(bx + 2.58, by + 1.53, 36), iso(bx + 1.62, by + 1.53, 36))}
        fill={active ? color : status === "waiting" ? "#c98500" : "#1a2440"}
        fillOpacity={active ? 0.85 : status === "waiting" ? 0.55 : 1}
        className={active ? "aos-screen" : undefined}
      />
      {/* agent */}
      {active && <ellipse cx={hx} cy={hy + 2} rx={34} ry={16} fill="none" stroke={color} strokeWidth={2} className="aos-pulse" />}
      <ellipse cx={hx} cy={hy + 2} rx={19} ry={9} fill="#000" fillOpacity={0.25} />
      <rect x={hx - 11.5} y={hy - 33} width={23} height={33} rx={10} fill={color} fillOpacity={status === "idle" ? 0.8 : 1} />
      <circle cx={hx} cy={hy - 43} r={11} fill={color} fillOpacity={status === "idle" ? 0.8 : 1} />
      <circle cx={hx} cy={hy - 43} r={11} fill="url(#aos-head-shine)" />
      {/* navneskilt: navn + status, zone og evt. aktuel opgave */}
      <g transform={`translate(${label[0]}, ${label[1]})`}>
        <rect x={-84} y={-20} width={168} height={currentJob ? 58 : 42} rx={9} fill="#0b1226" fillOpacity={0.94} stroke={color} strokeOpacity={selected ? 1 : 0.6} />
        <text x={-72} y={-1} className="fill-[hsl(var(--foreground))] text-[16px] font-semibold">
          {agent.name}
        </text>
        <text x={72} y={-1} textAnchor="end" className="fill-[hsl(var(--muted-foreground))] text-[12.5px]">
          {STATUS_GLYPH[status]} {AGENT_STATUS_LABELS[status].split(" ")[0]}
        </text>
        <text x={-72} y={15} className="fill-[hsl(var(--muted-foreground))] text-[10.5px] uppercase tracking-[0.12em]">
          {ZONE_LABELS[agent.zone]}
        </text>
        {currentJob && (
          <text x={-72} y={31} className="fill-[hsl(var(--accent))] text-[12px]">
            {currentJob.title.length > 26 ? `${currentJob.title.slice(0, 25)}…` : currentJob.title}
          </text>
        )}
      </g>
    </g>
  );
}

function EmptySlot({ slot }: { slot: [number, number] }) {
  const bx = slot[0] * 4;
  const by = slot[1] * 4;
  const floor = [iso(bx + 0.25, by + 0.25), iso(bx + 3.75, by + 0.25), iso(bx + 3.75, by + 3.75), iso(bx + 0.25, by + 3.75)];
  const [cx, cy] = iso(bx + 2, by + 2);
  return (
    <g>
      <polygon points={pts(...floor)} fill="none" stroke="#3a4a73" strokeDasharray="6 6" />
      <text x={cx} y={cy + 4} textAnchor="middle" className="fill-[hsl(var(--muted-foreground))] text-[13px]">
        Ledig arbejdsstation
      </text>
    </g>
  );
}

export interface AgentOfficeProps {
  initial: { stats: CommandCenterStats; agents: AgentState[] };
  /** Kompakt visning (Command Center) uden detaljepanel. */
  compact?: boolean;
}

export function AgentOffice({ initial, compact = false }: AgentOfficeProps) {
  const [data, setData] = React.useState(initial);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = React.useState(() => new Date().toISOString());
  const [stale, setStale] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await apiFetch<typeof initial>("/api/aos/overview");
        if (cancelled) return;
        setData(next);
        setUpdatedAt(new Date().toISOString());
        setStale(false);
      } catch {
        if (!cancelled) setStale(true);
      }
    };
    const timer = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Tildel arbejdsstationer: zonens plads først, ellers første ledige.
  const placed = React.useMemo(() => {
    const used = new Set<string>();
    const out: Array<{ state: AgentState; slot: [number, number] }> = [];
    const overflow: AgentState[] = [];
    for (const state of data.agents) {
      const preferred = ZONE_SLOTS[state.agent.zone];
      const key = preferred.join(",");
      if (!used.has(key)) {
        used.add(key);
        out.push({ state, slot: preferred });
      } else overflow.push(state);
    }
    for (const state of overflow) {
      const free = ALL_SLOTS.find((s) => !used.has(s.join(",")));
      if (!free) continue;
      used.add(free.join(","));
      out.push({ state, slot: free });
    }
    const empty = ALL_SLOTS.filter((s) => !used.has(s.join(",")));
    return { stations: out.sort((a, b) => a.slot[0] + a.slot[1] - (b.slot[0] + b.slot[1])), empty, unplaced: data.agents.length - out.length };
  }, [data.agents]);

  const current = data.agents.find((a) => a.agent.id === selected) ?? null;
  const outer = [iso(-0.2, -0.2), iso(12.2, -0.2), iso(12.2, 12.2), iso(-0.2, 12.2)];

  return (
    <div className={compact ? "" : "grid gap-6 xl:grid-cols-[1fr_340px]"}>
      <div className="relative overflow-hidden rounded-2xl border border-border bg-[radial-gradient(ellipse_at_top,#14214a_0%,#0a1024_55%,#070c1c_100%)]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 text-xs text-muted-foreground">
          <span>
            Agent Office · {data.agents.filter((a) => a.status === "working").length} arbejder · {data.agents.filter((a) => a.status === "idle").length} ledige
          </span>
          <span data-testid="office-updated">
            {stale ? "Kunne ikke opdatere — viser seneste data" : `Opdateret ${new Date(updatedAt).toLocaleTimeString("da-DK")}`}
          </span>
        </div>
        <svg viewBox="0 0 1080 640" className="h-auto w-full" role="group" aria-label="Isometrisk agentkontor">
          <defs>
            <radialGradient id="aos-head-shine" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.45" />
              <stop offset="60%" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="aos-floor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16244d" />
              <stop offset="100%" stopColor="#0c1530" />
            </linearGradient>
          </defs>
          <polygon points={pts(...outer)} fill="url(#aos-floor)" stroke="#2b3d6e" />
          {Array.from({ length: 13 }, (_, i) => (
            <g key={i} stroke="#22325c" strokeOpacity={i % 4 === 0 ? 0.9 : 0.35} strokeWidth={1}>
              <line x1={iso(i, 0)[0]} y1={iso(i, 0)[1]} x2={iso(i, 12)[0]} y2={iso(i, 12)[1]} />
              <line x1={iso(0, i)[0]} y1={iso(0, i)[1]} x2={iso(12, i)[0]} y2={iso(12, i)[1]} />
            </g>
          ))}
          {placed.empty.map((slot) => (
            <EmptySlot key={slot.join(",")} slot={slot} />
          ))}
          {placed.stations.map(({ state, slot }) => (
            <Workstation key={state.agent.id} state={state} slot={slot} selected={selected === state.agent.id} onSelect={() => setSelected(state.agent.id === selected ? null : state.agent.id)} />
          ))}
        </svg>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-[11px] text-muted-foreground" aria-label="Forklaring">
          {(Object.keys(STATUS_GLYPH) as AgentRuntimeStatus[]).map((s) => (
            <li key={s}>
              {STATUS_GLYPH[s]} {AGENT_STATUS_LABELS[s]}
            </li>
          ))}
          <li>Lysende skærm = registreret job i gang</li>
        </ul>
        {placed.unplaced > 0 && <p className="px-4 pb-3 text-xs text-muted-foreground">+{placed.unplaced} agent(er) uden plads i kontoret — se Agent Library.</p>}
      </div>

      {!compact && (
        <Card data-testid="office-detail">
          {current ? (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: current.agent.color }} aria-hidden /> {current.agent.name}
                </CardTitle>
                <p className="text-sm text-muted-foreground">{current.agent.role}</p>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <AgentStatusBadge status={current.status} />
                <p>{current.agent.version.description}</p>
                {current.currentJob ? (
                  <div className="space-y-1 rounded-lg border border-border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Aktuel opgave</p>
                    <Link href={`/aos/jobs/${current.currentJob.id}`} className="font-medium text-accent hover:underline">
                      {current.currentJob.title}
                    </Link>
                    <div className="flex flex-wrap gap-1.5">
                      <JobStatusBadge status={current.currentJob.status} overdue={current.currentJob.overdue} />
                      <EngineBadge engine={current.currentJob.engine} />
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Ingen igangværende opgave.</p>
                )}
                {current.lastJob && (
                  <p className="text-xs text-muted-foreground">
                    Seneste afsluttede: <Link href={`/aos/jobs/${current.lastJob.id}`} className="text-accent hover:underline">{current.lastJob.title}</Link> ({formatDateTime(current.lastJob.finishedAt ?? current.lastJob.updatedAt)})
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline">v{current.agent.version.version}</Badge>
                  {current.agent.version.engines.map((e) => (
                    <Badge key={e} variant="secondary">
                      {engineLabel(e)}
                    </Badge>
                  ))}
                </div>
                <Link href={`/aos/agents/${current.agent.id}`} className="inline-block text-accent hover:underline" data-testid="office-open-agent">
                  Åbn agentens detaljer →
                </Link>
              </CardContent>
            </>
          ) : (
            <CardContent className="space-y-2 pt-6 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Vælg en agent</p>
              <p>Klik på en arbejdsstation (eller brug Tab + Enter) for at se agentens status, aktuelle opgave og version.</p>
              <p>Status opdateres hvert 5. sekund fra Job Center.</p>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
