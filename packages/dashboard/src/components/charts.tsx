"use client";
import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@agency/ui";

/**
 * Lette, afhængighedsfrie grafer (SVG/HTML) efter dataviz-metoden:
 * tynde mærker (≤24px søjler, 2px linjer), 4px afrundet dataende, 2px fladegab,
 * hårfine gitterlinjer, én y-akse, legende ved ≥2 serier, hover + tastaturfokus
 * og altid en tabelvisning. Farver kommer fra CSS-variablerne --viz-1..3.
 */

export type Slot = 1 | 2 | 3;
export interface ChartSeries {
  key: string;
  label: string;
  slot: Slot;
}
export interface ChartPoint {
  key: string;
  label: string;
  values: Record<string, number>;
}
export type Formatter = (n: number) => string;

const color = (slot: Slot) => `var(--viz-${slot})`;
const COMPACT = new Intl.NumberFormat("da-DK", { notation: "compact", maximumFractionDigits: 1 });
/** Hele tal under en million (0 / 5.000 / 15.000); derover kompakt (1,2 mio.). */
export const compact: Formatter = (n) => (Math.abs(n) < 1_000_000 ? Math.round(n).toLocaleString("da-DK") : COMPACT.format(n));
export const fmtCount: Formatter = (n) => Math.round(n).toLocaleString("da-DK");
export const fmtKr: Formatter = (n) => `${Math.round(n).toLocaleString("da-DK")} kr.`;
export const fmtKrMonth: Formatter = (n) => `${Math.round(n).toLocaleString("da-DK")} kr./md.`;
export const fmtUsd: Formatter = (n) => `$${n.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
export const fmtPct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)} %`);

const useIsoLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/** Måler containeren før første paint; containeren er afgrænset, så en umålt graf aldrig giver vandret overløb. */
function useWidth<T extends HTMLElement>(fallback = 320): [React.RefObject<T | null>, number] {
  const ref = React.useRef<T>(null);
  const [width, setWidth] = React.useState(fallback);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(240, Math.floor(el.getBoundingClientRect().width)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Pæne akseværdier. Heltalsdata (antal) får aldrig brøkskridt, så etiketter ikke gentages. */
function niceMax(max: number, integer = false): { max: number; ticks: number[] } {
  if (max <= 0) return { max: 1, ticks: [0, 1] };
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(integer ? 1 : 0, [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!);
  const top = Math.ceil(max / step) * step;
  return { max: top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
}

/** Søjle med 4px afrundet dataende og firkantet basislinje. */
function columnPath(x: number, y: number, w: number, h: number, rounded: boolean) {
  if (h <= 0) return "";
  const r = rounded ? Math.min(4, w / 2, h) : 0;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function Legend({ series, kind = "rect" }: { series: ChartSeries[]; kind?: "rect" | "line" }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Forklaring">
      {series.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          {kind === "rect" ? <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color(s.slot) }} /> : <span className="h-0.5 w-3.5 rounded" style={{ background: color(s.slot) }} />}
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function Tooltip({ x, title, rows, width }: { x: number; title: string; rows: Array<{ label: string; value: string; slot: Slot }>; width: number }) {
  const left = Math.min(Math.max(x - 80, 0), Math.max(width - 168, 0));
  return (
    <div className="pointer-events-none absolute top-1 z-10 w-40 rounded-lg border border-border bg-card p-2 text-xs shadow-card" style={{ left }} role="status">
      <p className="mb-1 font-medium text-muted-foreground">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 shrink-0 rounded" style={{ background: color(r.slot) }} />
          <span className="font-semibold tabular-nums text-foreground">{r.value}</span>
          <span className="truncate text-muted-foreground">{r.label}</span>
        </p>
      ))}
    </div>
  );
}

/** Tabelvisningen — alle værdier kan læses uden hover. */
export function DataTable({ data, series, format, caption }: { data: ChartPoint[]; series: ChartSeries[]; format: Formatter; caption: string }) {
  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Vis som tabel</summary>
      <div className="mt-2 max-h-64 overflow-auto">
        <table className="w-full">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-1 pr-3 font-medium">Periode</th>
              {series.map((s) => (
                <th key={s.key} className="py-1 pr-3 text-right font-medium">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key} className="border-b border-border/60 last:border-0">
                <td className="py-1 pr-3">{d.label}</td>
                {series.map((s) => (
                  <td key={s.key} className="py-1 pr-3 text-right tabular-nums">
                    {format(d.values[s.key] ?? 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function ChartCard({ title, description, children, testId, action }: { title: string; description?: React.ReactNode; children: React.ReactNode; testId?: string; action?: React.ReactNode }) {
  return (
    <Card data-testid={testId} className="min-w-0">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const M = { top: 12, right: 12, bottom: 26, left: 60 };

/** Søjlediagram (grupperet eller stablet) med hover pr. søjle-bånd. */
export function ColumnChart({ data, series, stacked = false, format, axisFormat = compact, height = 200, caption }: { data: ChartPoint[]; series: ChartSeries[]; stacked?: boolean; format: Formatter; axisFormat?: Formatter; height?: number; caption: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);
  const plotW = width - M.left - M.right;
  const plotH = height - M.top - M.bottom;
  const totals = data.map((d) => (stacked ? series.reduce((s, x) => s + (d.values[x.key] ?? 0), 0) : Math.max(0, ...series.map((x) => d.values[x.key] ?? 0))));
  const { max, ticks } = niceMax(Math.max(0, ...totals), data.every((d) => series.every((x) => Number.isInteger(d.values[x.key] ?? 0))));
  const band = data.length ? plotW / data.length : plotW;
  const groupW = Math.min(24 * (stacked ? 1 : series.length) + (stacked ? 0 : 2 * (series.length - 1)), band * 0.72);
  const barW = stacked ? groupW : (groupW - 2 * (series.length - 1)) / series.length;
  const y = (v: number) => M.top + plotH - (v / max) * plotH;
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 64))));
  const allZero = totals.every((t) => t === 0);

  return (
    <div>
      <Legend series={series} />
      <div ref={ref} className="relative mt-2 w-full max-w-full overflow-x-clip" onPointerLeave={() => setHover(null)}>
        <svg width={width} height={height} role="img" aria-label={caption} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                {axisFormat(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = M.left + band * i + band / 2;
            let acc = 0;
            return (
              <g key={d.key} opacity={hover === null || hover === i ? 1 : 0.55}>
                {series.map((s, si) => {
                  const v = d.values[s.key] ?? 0;
                  if (stacked) {
                    const top = y(acc + v);
                    const h = y(acc) - top - (acc > 0 ? 2 : 0);
                    const isTop = series.slice(si + 1).every((n) => (d.values[n.key] ?? 0) === 0);
                    acc += v;
                    return v > 0 ? <path key={s.key} d={columnPath(cx - barW / 2, top, barW, Math.max(h, 0), isTop)} fill={color(s.slot)} /> : null;
                  }
                  const x0 = cx - groupW / 2 + si * (barW + 2);
                  return v > 0 ? <path key={s.key} d={columnPath(x0, y(v), barW, y(0) - y(v), true)} fill={color(s.slot)} /> : null;
                })}
                {i % labelEvery === 0 && (
                  <text x={cx} y={height - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                    {d.label}
                  </text>
                )}
                <rect
                  x={M.left + band * i}
                  y={M.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`${d.label}: ${series.map((s) => `${s.label} ${format(d.values[s.key] ?? 0)}`).join(", ")}`}
                  onPointerEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="cursor-default outline-none focus-visible:stroke-[var(--viz-axis)]"
                />
              </g>
            );
          })}
        </svg>
        {allZero && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">Ingen registreringer i perioden</p>}
        {hover !== null && data[hover] && (
          <Tooltip x={M.left + band * hover + band / 2} width={width} title={data[hover]!.label} rows={series.map((s) => ({ label: s.label, value: format(data[hover]!.values[s.key] ?? 0), slot: s.slot }))} />
        )}
      </div>
      <DataTable data={data} series={series} format={format} caption={caption} />
    </div>
  );
}

/** Linjediagram for beholdninger over tid (fx MRR). Krydshår finder X; slutværdien er direkte mærket. */
export function LineChart({ data, series, format, axisFormat = compact, height = 200, caption }: { data: ChartPoint[]; series: ChartSeries[]; format: Formatter; axisFormat?: Formatter; height?: number; caption: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);
  const right = 64;
  const plotW = width - M.left - right;
  const plotH = height - M.top - M.bottom;
  const all = data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0));
  const { max, ticks } = niceMax(Math.max(0, ...all), all.every(Number.isInteger));
  const x = (i: number) => M.left + (data.length <= 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v: number) => M.top + plotH - (v / max) * plotH;
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 64))));
  const last = data.length - 1;

  function nearest(clientX: number) {
    const rect = ref.current!.getBoundingClientRect();
    const rel = clientX - rect.left - M.left;
    return Math.max(0, Math.min(last, Math.round((rel / Math.max(plotW, 1)) * last)));
  }

  return (
    <div>
      <Legend series={series} kind="line" />
      <div ref={ref} className="relative mt-2 w-full max-w-full overflow-x-clip" onPointerLeave={() => setHover(null)}>
        <svg width={width} height={height} role="img" aria-label={caption} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                {axisFormat(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) =>
            i % labelEvery === 0 ? (
              <text key={d.key} x={x(i)} y={height - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                {d.label}
              </text>
            ) : null,
          )}
          {series.map((s) => {
            const pts = data.map((d, i) => `${x(i)},${y(d.values[s.key] ?? 0)}`);
            return (
              <g key={s.key}>
                {series.length === 1 && data.length > 1 && <path d={`M${x(0)},${y(0)}L${pts.join("L")}L${x(last)},${y(0)}Z`} fill={color(s.slot)} opacity={0.1} />}
                {data.length > 1 && <path d={`M${pts.join("L")}`} fill="none" stroke={color(s.slot)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
                {last >= 0 && (
                  <>
                    <circle cx={x(last)} cy={y(data[last]!.values[s.key] ?? 0)} r={4} fill={color(s.slot)} stroke="var(--viz-surface)" strokeWidth={2} />
                    <text x={x(last) + 8} y={y(data[last]!.values[s.key] ?? 0)} dy="0.32em" className="fill-foreground text-[11px] font-medium tabular-nums">
                      {axisFormat(data[last]!.values[s.key] ?? 0)}
                    </text>
                  </>
                )}
              </g>
            );
          })}
          {hover !== null && data[hover] && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + plotH} stroke="var(--viz-axis)" strokeWidth={1} />
              {series.map((s) => (
                <circle key={s.key} cx={x(hover)} cy={y(data[hover]!.values[s.key] ?? 0)} r={4} fill={color(s.slot)} stroke="var(--viz-surface)" strokeWidth={2} />
              ))}
            </g>
          )}
          <rect
            x={M.left - 8}
            y={M.top}
            width={plotW + 16}
            height={plotH}
            fill="transparent"
            tabIndex={0}
            aria-label={`${caption}. Brug piletasterne for at gennemgå værdierne.`}
            onPointerMove={(e) => setHover(nearest(e.clientX))}
            onFocus={() => setHover(last)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? last) - 1));
              if (e.key === "ArrowRight") setHover((h) => Math.min(last, (h ?? 0) + 1));
            }}
            className="outline-none"
          />
        </svg>
        {hover !== null && data[hover] && <Tooltip x={x(hover)} width={width} title={data[hover]!.label} rows={series.map((s) => ({ label: s.label, value: format(data[hover]!.values[s.key] ?? 0), slot: s.slot }))} />}
      </div>
      <DataTable data={data} series={series} format={format} caption={caption} />
    </div>
  );
}

export interface BarRow {
  key: string;
  label: string;
  values: Record<string, number>;
  href?: string;
  sub?: string;
}

/** Vandrette søjler (HTML) — værdien står altid ved søjleenden, så intet kræver hover. */
export function BarList({ rows, series, format, caption, emptyText = "Ingen data", testId }: { rows: BarRow[]; series: ChartSeries[]; format: Formatter; caption: string; emptyText?: string; testId?: string }) {
  const max = Math.max(0, ...rows.flatMap((r) => series.map((s) => r.values[s.key] ?? 0)));
  if (!rows.length || max === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <div>
      <Legend series={series} />
      <ul className="mt-2 space-y-2.5" aria-label={caption} data-testid={testId}>
        {rows.map((r) => {
          const body = (
            <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
              <span className="min-w-0 text-sm">
                <span className="block truncate">{r.label}</span>
                {r.sub && <span className="block truncate text-xs text-muted-foreground">{r.sub}</span>}
              </span>
              <span className="space-y-0.5">
                {series.map((s) => {
                  const v = r.values[s.key] ?? 0;
                  return (
                    <span key={s.key} className="flex items-center gap-2" title={`${s.label}: ${format(v)}`}>
                      <span className="h-2.5 rounded-r-[4px] transition-[width] duration-500" style={{ width: v > 0 ? `max(2px, calc((100% - 6.5rem) * ${v / max}))` : 0, background: color(s.slot) }} />
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{format(v)}</span>
                    </span>
                  );
                })}
              </span>
            </div>
          );
          return (
            <li key={r.key}>
              {r.href ? (
                <Link href={r.href} className="block rounded-md px-1 py-0.5 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {body}
                </Link>
              ) : (
                <div className="px-1 py-0.5">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Tynd segmenteret bjælke (én helhed delt i dele) — fx jobstatus. */
export function SegmentBar({ parts, caption }: { parts: Array<{ key: string; label: string; value: number; slot: Slot | "muted" }>; caption: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <p className="text-sm text-muted-foreground">Ingen registreringer i perioden.</p>;
  return (
    <div>
      <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${caption}: ${parts.map((p) => `${p.label} ${p.value}`).join(", ")}`}>
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <span key={p.key} className="h-full first:rounded-l-full last:rounded-r-full" title={`${p.label}: ${p.value}`} style={{ width: `${(p.value / total) * 100}%`, background: p.slot === "muted" ? "var(--viz-axis)" : color(p.slot) }} />
          ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {parts.map((p) => (
          <li key={p.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.slot === "muted" ? "var(--viz-axis)" : color(p.slot) }} />
            {p.label} <span className="font-medium tabular-nums text-foreground">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
