import type { z } from "zod";
import type { ModuleKey } from "../events";
import type { CollectionStore } from "./json-store";

/**
 * SUPABASE-LAGRING
 * ----------------
 * Samme `CollectionStore`-interface som JSON-filerne, men gemt i tabellen
 * `public.documents` (se supabase/migrations). Kaldene går til Supabases
 * REST-API (PostgREST) og sker kun server-side. To adgangsformer:
 *
 *  1. Servernøgle (anbefalet på Vercel): `SUPABASE_SERVICE_ROLE_KEY` eller
 *     `SUPABASE_SECRET_KEY`, typisk sat automatisk af Supabases Vercel-integration.
 *  2. Offentlig nøgle + delt hemmelighed: `SUPABASE_PUBLISHABLE_KEY` og
 *     `AGENCY_DB_SECRET`; RLS kræver headeren `x-agency-secret`.
 *
 * Rækkesikkerhed (RLS) er altid slået til, så den offentlige nøgle alene
 * ikke giver adgang. Opdateringer bruger optimistisk låsning via `rev`.
 */

export interface SupabaseStoreConfig {
  url: string;
  key: string;
  /** Kun ved adgangsform 2. */
  secret: string | null;
  fetch?: typeof fetch;
}

export function getSupabaseStoreConfig(): SupabaseStoreConfig | null {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim().replace(/\/$/, "");
  if (!url) return null;
  const serverKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY)?.trim();
  if (serverKey) return { url, key: serverKey, secret: null };
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const secret = process.env.AGENCY_DB_SECRET?.trim();
  return key && secret ? { url, key, secret } : null;
}

/** Ældre JWT-nøgler sendes også som Bearer; nye nøgler (sb_…) kun som `apikey`. */
export function supabaseAuthHeaders(config: Pick<SupabaseStoreConfig, "key" | "secret">): Record<string, string> {
  return {
    apikey: config.key,
    ...(config.key.startsWith("eyJ") ? { authorization: `Bearer ${config.key}` } : {}),
    ...(config.secret ? { "x-agency-secret": config.secret } : {}),
  };
}

interface Row {
  id: string;
  data: unknown;
  rev: number;
}

const MAX_UPDATE_ATTEMPTS = 5;

export function createSupabaseStore<T extends { id: string }>(
  config: SupabaseStoreConfig,
  module: ModuleKey,
  collection: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): CollectionStore<T> {
  const doFetch = config.fetch ?? fetch;
  const base = `${config.url}/rest/v1/documents`;
  const scope = `module=eq.${encodeURIComponent(module)}&collection=eq.${encodeURIComponent(collection)}`;
  const byId = (id: string) => `${scope}&id=eq.${encodeURIComponent(id)}`;

  async function request(query: string, init: { method?: string; body?: unknown; prefer?: string } = {}): Promise<Row[]> {
    const res = await doFetch(`${base}?${query}`, {
      method: init.method ?? "GET",
      headers: {
        ...supabaseAuthHeaders(config),
        "content-type": "application/json",
        ...(init.prefer ? { prefer: init.prefer } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Supabase-lagring fejlede (${res.status}) for ${module}/${collection}: ${detail.slice(0, 300)}`);
    }
    if (res.status === 204) return [];
    const text = await res.text();
    return text ? (JSON.parse(text) as Row[]) : [];
  }

  const parseRows = (rows: Row[]): T[] =>
    rows.flatMap((row) => {
      const result = schema.safeParse(row.data);
      return result.success ? [result.data] : [];
    });

  async function getRow(id: string): Promise<Row | null> {
    const rows = await request(`${byId(id)}&select=id,data,rev`);
    return rows[0] ?? null;
  }

  return {
    async list() {
      return parseRows(await request(`${scope}&select=id,data,rev&order=updated_at.asc`));
    },
    async get(id) {
      const row = await getRow(id);
      return row ? (parseRows([row])[0] ?? null) : null;
    },
    async find(predicate) {
      return (await this.list()).find(predicate) ?? null;
    },
    async upsert(item) {
      const valid = schema.parse(item);
      await request("on_conflict=module,collection,id", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: { module, collection, id: valid.id, data: valid, updated_at: new Date().toISOString() },
      });
      return valid;
    },
    async update(id, mutate) {
      for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt++) {
        const row = await getRow(id);
        if (!row) return null;
        const current = schema.parse(row.data);
        const next = schema.parse(mutate(current));
        const updated = await request(`${byId(id)}&rev=eq.${row.rev}`, {
          method: "PATCH",
          prefer: "return=representation",
          body: { data: next, rev: row.rev + 1, updated_at: new Date().toISOString() },
        });
        if (updated.length > 0) return next;
        // En anden skrivning kom først — læs igen og prøv på ny.
      }
      throw new Error(`Kunne ikke opdatere ${module}/${collection}/${id} pga. samtidige ændringer.`);
    },
    async remove(id) {
      const deleted = await request(byId(id), { method: "DELETE", prefer: "return=representation" });
      return deleted.length > 0;
    },
  };
}
