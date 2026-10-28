import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { nowIso } from "@agency/shared";
import { ModeSchema, type Mode } from "../models";
import { PlatformSettingsSchema, type PlatformSettings } from "../settings";
import { getDataDir } from "./json-store";
import { publishEvent } from "./events";

function settingsPath() {
  return path.join(getDataDir(), "platform", "settings.json");
}

function defaultMode(): Mode {
  const parsed = ModeSchema.safeParse(process.env.PLATFORM_DEFAULT_MODE);
  return parsed.success ? parsed.data : "demo";
}

export async function getSettings(): Promise<PlatformSettings> {
  try {
    const raw = JSON.parse(await readFile(settingsPath(), "utf8"));
    const parsed = PlatformSettingsSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
  } catch {
    // Ingen gemte indstillinger endnu.
  }
  return { mode: defaultMode(), updatedAt: null };
}

export async function updateSettings(update: { mode: Mode }): Promise<PlatformSettings> {
  const next: PlatformSettings = { mode: update.mode, updatedAt: nowIso() };
  await mkdir(path.dirname(settingsPath()), { recursive: true });
  await writeFile(settingsPath(), JSON.stringify(next, null, 2), "utf8");
  await publishEvent({ type: "settings.updated", source: "platform", mode: next.mode, subject: {}, payload: { mode: next.mode } });
  return next;
}
