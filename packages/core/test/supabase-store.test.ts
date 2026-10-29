import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createSupabaseStore } from "@agency/core/server";

/** Minimal falsk PostgREST for tabellen documents — nok til at teste lagringslogikken. */
function fakePostgrest(secret: string) {
  const rows = new Map<string, { module: string; collection: string; id: string; data: unknown; rev: number }>();
  let interfere: (() => void) | null = null;
  const calls: string[] = [];

  const fetchImpl = (async (input: string, init: RequestInit) => {
    const url = new URL(input);
    const headers = init.headers as Record<string, string>;
    calls.push(`${init.method} ${url.search}`);
    if (headers["x-agency-secret"] !== secret) return new Response(JSON.stringify({ message: "RLS" }), { status: 401 });
    const eq = (k: string) => url.searchParams.get(k)?.replace(/^eq\./, "");
    const match = (r: { module: string; collection: string; id: string; rev: number }) =>
      r.module === eq("module") && r.collection === eq("collection") && (!eq("id") || r.id === eq("id")) && (!eq("rev") || r.rev === Number(eq("rev")));
    const key = (r: { module: string; collection: string; id: string }) => `${r.module}/${r.collection}/${r.id}`;
    const body = init.body ? JSON.parse(init.body as string) : null;
    switch (init.method) {
      case "GET":
        return new Response(JSON.stringify([...rows.values()].filter(match)), { status: 200 });
      case "POST": {
        const existing = rows.get(key(body));
        rows.set(key(body), { ...body, rev: existing ? existing.rev + 1 : 1 });
        return new Response(null, { status: 201 });
      }
      case "PATCH": {
        if (interfere) {
          const f = interfere;
          interfere = null;
          f();
        }
        const hit = [...rows.values()].filter(match);
        for (const r of hit) rows.set(key(r), { ...r, data: body.data, rev: body.rev });
        return new Response(JSON.stringify(hit.map((r) => ({ ...r, ...body }))), { status: 200 });
      }
      case "DELETE": {
        const hit = [...rows.values()].filter(match);
        for (const r of hit) rows.delete(key(r));
        return new Response(JSON.stringify(hit), { status: 200 });
      }
    }
    return new Response(null, { status: 405 });
  }) as unknown as typeof fetch;

  return { fetchImpl, rows, calls, setInterference: (f: () => void) => (interfere = f) };
}

const Item = z.object({ id: z.string(), value: z.number() });

describe("Supabase-lagring", () => {
  it("gemmer, læser, opdaterer og sletter dokumenter i modulets egen samling", async () => {
    const pg = fakePostgrest("s3cret");
    const store = createSupabaseStore({ url: "https://x.supabase.co", key: "pk", secret: "s3cret", fetch: pg.fetchImpl }, "quotes", "items", Item);
    const other = createSupabaseStore({ url: "https://x.supabase.co", key: "pk", secret: "s3cret", fetch: pg.fetchImpl }, "research", "items", Item);
    await store.upsert({ id: "a", value: 1 });
    await store.upsert({ id: "b", value: 2 });
    await other.upsert({ id: "a", value: 99 });
    expect((await store.list()).map((i) => i.id).sort()).toEqual(["a", "b"]);
    expect(await store.get("a")).toEqual({ id: "a", value: 1 });
    expect(await other.get("a")).toEqual({ id: "a", value: 99 });
    expect(await store.update("a", (i) => ({ ...i, value: 5 }))).toEqual({ id: "a", value: 5 });
    expect(await store.update("missing", (i) => i)).toBeNull();
    expect(await store.remove("b")).toBe(true);
    expect(await store.remove("b")).toBe(false);
    expect(await store.list()).toEqual([{ id: "a", value: 5 }]);
    await expect(store.upsert({ id: "c", value: "x" } as never)).rejects.toThrow();
  });

  it("prøver igen ved samtidige ændringer (optimistisk låsning)", async () => {
    const pg = fakePostgrest("s3cret");
    const store = createSupabaseStore({ url: "https://x.supabase.co", key: "pk", secret: "s3cret", fetch: pg.fetchImpl }, "research", "jobs", Item);
    await store.upsert({ id: "j", value: 1 });
    // En anden skrivning sker lige før vores PATCH → første forsøg rammer forkert rev.
    pg.setInterference(() => {
      const r = pg.rows.get("research/jobs/j")!;
      pg.rows.set("research/jobs/j", { ...r, data: { id: "j", value: 10 }, rev: r.rev + 1 });
    });
    const result = await store.update("j", (i) => ({ ...i, value: i.value + 1 }));
    expect(result).toEqual({ id: "j", value: 11 });
  });

  it("fejler tydeligt, hvis hemmeligheden mangler eller er forkert", async () => {
    const pg = fakePostgrest("s3cret");
    const store = createSupabaseStore({ url: "https://x.supabase.co", key: "pk", secret: "forkert", fetch: pg.fetchImpl }, "platform", "events", Item);
    await expect(store.list()).rejects.toThrow(/Supabase-lagring fejlede \(401\)/);
  });
});
