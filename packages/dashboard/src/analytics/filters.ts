import { z } from "zod";

/** Globale filtre. Valideres server-side (URL-parametre → zod). */
export const PeriodKeySchema = z.enum(["7d", "30d", "90d", "ytd", "all", "custom"]);
export type PeriodKey = z.infer<typeof PeriodKeySchema>;

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dato skal være ÅÅÅÅ-MM-DD.");

export const DashboardFilterSchema = z
  .object({
    period: PeriodKeySchema.default("30d"),
    from: DateOnly.optional(),
    to: DateOnly.optional(),
    customer: z.string().startsWith("brd_").optional(),
    category: z.enum(["customer_contact", "sales_marketing", "automation", "data_software"]).optional(),
    projectStatus: z.enum(["active", "on_hold", "delivered", "maintenance", "cancelled", "overdue"]).optional(),
    agent: z.string().startsWith("agt_").optional(),
    engine: z.enum(["internal", "claude_api", "claude_code", "none"]).optional(),
  })
  .superRefine((f, ctx) => {
    if (f.period !== "custom") return;
    if (!f.from || !f.to) ctx.addIssue({ code: "custom", message: "Vælg både start- og slutdato for et valgfrit interval.", path: ["from"] });
    else if (f.from > f.to) ctx.addIssue({ code: "custom", message: "Startdatoen skal ligge før slutdatoen.", path: ["from"] });
    else if (daysBetween(f.from, f.to) > 3 * 366) ctx.addIssue({ code: "custom", message: "Intervallet må højst være tre år.", path: ["to"] });
  });
export type DashboardFilter = z.infer<typeof DashboardFilterSchema>;

/** Tolker URL-parametre robust: ugyldige værdier falder tilbage til standard i stedet for at vælte siden. */
export function parseFilter(params: Record<string, string | string[] | undefined>): { filter: DashboardFilter; error: string | null } {
  const raw = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = DashboardFilterSchema.safeParse(raw);
  if (parsed.success) return { filter: parsed.data, error: null };
  const fallback = DashboardFilterSchema.safeParse({ ...raw, period: raw.period === "custom" ? "30d" : raw.period, from: undefined, to: undefined });
  return { filter: fallback.success ? fallback.data : DashboardFilterSchema.parse({}), error: parsed.error.issues[0]?.message ?? "Ugyldigt filter." };
}

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  "7d": "Seneste 7 dage",
  "30d": "Seneste 30 dage",
  "90d": "Seneste 90 dage",
  ytd: "Indeværende år",
  all: "Hele perioden",
  custom: "Valgfrit interval",
};

export type Bucket = "day" | "week" | "month";

export interface ResolvedPeriod {
  key: PeriodKey;
  label: string;
  /** Inklusiv start (ISO), eksklusiv slut (ISO). `start` er null for "hele perioden". */
  start: string | null;
  end: string;
  bucket: Bucket;
}

const DAY = 86_400_000;
function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
}
const startOfUtcDay = (ms: number) => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/**
 * Perioden regnes i hele UTC-dage og slutter ved udgangen af "i dag".
 * Grafernes opløsning: ≤31 dage → dage, ≤120 dage → uger, ellers måneder.
 */
export function resolvePeriod(filter: DashboardFilter, nowIso: string, earliest?: string | null): ResolvedPeriod {
  const now = Date.parse(nowIso);
  const endOfToday = startOfUtcDay(now) + DAY;
  let start: number | null;
  let end = endOfToday;
  switch (filter.period) {
    case "7d":
      start = endOfToday - 7 * DAY;
      break;
    case "30d":
      start = endOfToday - 30 * DAY;
      break;
    case "90d":
      start = endOfToday - 90 * DAY;
      break;
    case "ytd":
      start = Date.UTC(new Date(now).getUTCFullYear(), 0, 1);
      break;
    case "custom":
      start = Date.parse(`${filter.from}T00:00:00Z`);
      end = Date.parse(`${filter.to}T00:00:00Z`) + DAY;
      break;
    default:
      start = null;
  }
  const spanStart = start ?? (earliest ? startOfUtcDay(Date.parse(earliest)) : endOfToday - 30 * DAY);
  const spanDays = (end - spanStart) / DAY;
  const bucket: Bucket = spanDays <= 31 ? "day" : spanDays <= 120 ? "week" : "month";
  const label = filter.period === "custom" ? `${filter.from} – ${filter.to}` : PERIOD_LABELS[filter.period];
  return { key: filter.period, label, start: start === null ? null : new Date(start).toISOString(), end: new Date(end).toISOString(), bucket };
}

export function inPeriod(iso: string | null | undefined, p: ResolvedPeriod): boolean {
  if (!iso) return false;
  const t = Date.parse(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return (p.start === null || t >= Date.parse(p.start)) && t < Date.parse(p.end);
}

/** Tidsakser for graferne: sammenhængende spande fra start (eller tidligste data) til slut. */
export function buckets(p: ResolvedPeriod, earliest: string | null): Array<{ key: string; label: string; start: string; end: string }> {
  const endMs = Date.parse(p.end);
  let cursor = p.start ? Date.parse(p.start) : earliest ? startOfUtcDay(Date.parse(earliest)) : endMs - 30 * DAY;
  if (p.bucket === "week") {
    const dow = (new Date(cursor).getUTCDay() + 6) % 7; // mandag = 0
    cursor -= dow * DAY;
  }
  if (p.bucket === "month") {
    const d = new Date(cursor);
    cursor = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  }
  const out: Array<{ key: string; label: string; start: string; end: string }> = [];
  for (let guard = 0; cursor < endMs && guard < 400; guard++) {
    const d = new Date(cursor);
    const next = p.bucket === "day" ? cursor + DAY : p.bucket === "week" ? cursor + 7 * DAY : Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    const key = d.toISOString().slice(0, p.bucket === "month" ? 7 : 10);
    const label =
      p.bucket === "month"
        ? d.toLocaleDateString("da-DK", { month: "short", year: "2-digit", timeZone: "UTC" })
        : d.toLocaleDateString("da-DK", { day: "numeric", month: "short", timeZone: "UTC" });
    out.push({ key, label: p.bucket === "week" ? `Uge fra ${label}` : label, start: new Date(cursor).toISOString(), end: new Date(Math.min(next, endMs)).toISOString() });
    cursor = next;
  }
  return out;
}

/** Filtrene som URL-søgestreng (til links og klikbare KPI'er). */
export function filterToQuery(filter: Partial<DashboardFilter>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== null && v !== "" && !(k === "period" && v === "30d")) params.set(k, String(v));
  const s = params.toString();
  return s ? `?${s}` : "";
}
