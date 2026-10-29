import { z } from "zod";
import { nowIso } from "@agency/shared";
import { ModeSchema, type Mode } from "../models";
import { PlatformSettingsSchema, type PlatformSettings } from "../settings";
import { createCollectionStore } from "./json-store";
import { publishEvent } from "./events";

/** Platformindstillinger gemmes som ét dokument i platformens lagring (fil eller Supabase). */
const SETTINGS_ID = "settings";
const StoredSettingsSchema = PlatformSettingsSchema.extend({ id: z.literal(SETTINGS_ID) });
const store = createCollectionStore("platform", "settings", StoredSettingsSchema);

function defaultMode(): Mode {
  const parsed = ModeSchema.safeParse(process.env.PLATFORM_DEFAULT_MODE);
  return parsed.success ? parsed.data : "demo";
}

export async function getSettings(): Promise<PlatformSettings> {
  const stored = await store.get(SETTINGS_ID);
  return stored ? { mode: stored.mode, updatedAt: stored.updatedAt } : { mode: defaultMode(), updatedAt: null };
}

export async function updateSettings(update: { mode: Mode }): Promise<PlatformSettings> {
  const next: PlatformSettings = { mode: update.mode, updatedAt: nowIso() };
  await store.upsert({ id: SETTINGS_ID, ...next });
  await publishEvent({ type: "settings.updated", source: "platform", mode: next.mode, subject: {}, payload: { mode: next.mode } });
  return next;
}
