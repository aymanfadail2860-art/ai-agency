import { getSettings } from "@agency/core/server";
import { createProject, listProjects, type CreateProjectInput } from "@agency/production/server";
import { json, readJson, route } from "@/lib/http";
import { ensureProductionWiring } from "@/lib/production";

export const dynamic = "force-dynamic";

export const GET = route(async () => json(await listProjects((await getSettings()).mode)));

/** Opretter et produktionsprojekt i den aktuelle tilstand (opgaver og testplan fra servicebasen). */
export const POST = route(async (req) => {
  ensureProductionWiring();
  const { mode } = await getSettings();
  // Body valideres med CreateProjectSchema i createProject.
  return json(await createProject((await readJson(req)) as CreateProjectInput, { mode }), 201);
});
