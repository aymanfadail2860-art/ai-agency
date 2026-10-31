import { updateTask } from "@agency/production/server";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const PATCH = route<{ params: Promise<{ projectId: string; taskId: string }> }>(async (req, { params }) => {
  const { projectId, taskId } = await params;
  return json(await updateTask(projectId, taskId, await readJson(req)));
});
