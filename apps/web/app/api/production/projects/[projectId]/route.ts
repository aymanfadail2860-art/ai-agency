import { getFinance, getProject, updateProject } from "@agency/production/server";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const bundle = await getProject((await params).projectId);
  return json({ ...bundle, finance: await getFinance(bundle) });
});

export const PATCH = route<Ctx>(async (req, { params }) => json(await updateProject((await params).projectId, await readJson(req))));
