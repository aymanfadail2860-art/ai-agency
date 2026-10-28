import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import type { ModuleKey } from "../events";

/**
 * PERSISTENS (lokal demo)
 * -----------------------
 * Enkel, persistent JSON-fillagring pr. modul: `<DATA_DIR>/<modul>/<samling>.json`.
 * Hvert modul opretter kun samlinger i sit eget navnerum, og andre moduler
 * tilgår data via modulets offentlige service-API — aldrig via filerne.
 *
 * Skrivninger serialiseres pr. fil (in-process lås) og skrives atomisk
 * (tmp-fil + rename). Erstattes af PostgreSQL/Supabase i en senere version;
 * `CollectionStore`-interfacet er designet til at kunne implementeres oven på en database.
 */

export interface CollectionStore<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  find(predicate: (item: T) => boolean): Promise<T | null>;
  upsert(item: T): Promise<T>;
  update(id: string, mutate: (current: T) => T): Promise<T | null>;
  remove(id: string): Promise<boolean>;
}

export function getDataDir(): string {
  return path.resolve(process.env.DATA_DIR ?? path.join(findRepoRoot(), ".data"));
}

function findRepoRoot(): string {
  // Next.js kører med cwd = apps/web; tests kører fra repo-roden.
  const cwd = process.cwd();
  return cwd.endsWith(path.join("apps", "web")) ? path.resolve(cwd, "..", "..") : cwd;
}

const locks = new Map<string, Promise<unknown>>();

async function withLock<R>(key: string, fn: () => Promise<R>): Promise<R> {
  const previous = locks.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(fn);
  locks.set(key, next);
  try {
    return await next;
  } finally {
    if (locks.get(key) === next) locks.delete(key);
  }
}

export function createCollectionStore<T extends { id: string }>(
  module: ModuleKey,
  collection: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): CollectionStore<T> {
  if (!/^[a-z][a-z0-9-]*$/.test(collection)) throw new Error(`Ugyldigt samlingsnavn: ${collection}`);
  const filePath = () => path.join(getDataDir(), module, `${collection}.json`);

  async function readAll(): Promise<T[]> {
    try {
      const raw = await readFile(filePath(), "utf8");
      const parsed = JSON.parse(raw) as unknown[];
      // Ugyldige poster springes over i stedet for at vælte hele samlingen.
      return parsed.flatMap((entry) => {
        const result = schema.safeParse(entry);
        return result.success ? [result.data] : [];
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  async function writeAll(items: T[]): Promise<void> {
    const target = filePath();
    await mkdir(path.dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(items, null, 2), "utf8");
    await rename(tmp, target);
  }

  const lockKey = () => filePath();

  return {
    list: () => readAll(),
    async get(id) {
      return (await readAll()).find((item) => item.id === id) ?? null;
    },
    async find(predicate) {
      return (await readAll()).find(predicate) ?? null;
    },
    upsert(item) {
      const valid = schema.parse(item);
      return withLock(lockKey(), async () => {
        const items = await readAll();
        const index = items.findIndex((existing) => existing.id === valid.id);
        if (index >= 0) items[index] = valid;
        else items.push(valid);
        await writeAll(items);
        return valid;
      });
    },
    update(id, mutate) {
      return withLock(lockKey(), async () => {
        const items = await readAll();
        const index = items.findIndex((existing) => existing.id === id);
        if (index < 0) return null;
        const next = schema.parse(mutate(items[index]));
        items[index] = next;
        await writeAll(items);
        return next;
      });
    },
    remove(id) {
      return withLock(lockKey(), async () => {
        const items = await readAll();
        const next = items.filter((existing) => existing.id !== id);
        if (next.length === items.length) return false;
        await writeAll(next);
        return true;
      });
    },
  };
}
