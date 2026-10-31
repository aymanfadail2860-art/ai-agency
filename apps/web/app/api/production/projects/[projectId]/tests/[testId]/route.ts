import { recordTest } from "@agency/production/server";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Registrér et testresultat (status, note og evt. fejl). */
export const PATCH = route<{ params: Promise<{ projectId: string; testId: string }> }>(async (req, { params }) => {
  const { projectId, testId } = await params;
  return json(await recordTest(projectId, testId, await readJson(req)));
});
