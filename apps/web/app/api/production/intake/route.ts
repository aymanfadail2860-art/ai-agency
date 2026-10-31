import { createFromIntake } from "@agency/production/server";
import { json, readJson, route } from "@/lib/http";
import { ensureProductionWiring } from "@/lib/production";

export const dynamic = "force-dynamic";

/** Kontrakt `quotes.production-intake@1/@2`: accepteret tilbud → produktionsprojekt. Idempotent pr. intakeId. */
export const POST = route(async (req) => {
  ensureProductionWiring();
  const { project, created } = await createFromIntake(await readJson(req));
  return json({ projectId: project.id, created }, created ? 201 : 200);
});
