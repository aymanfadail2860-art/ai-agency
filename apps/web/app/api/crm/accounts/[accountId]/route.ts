import { updateAccount } from "@agency/crm/server";
import { json, readJson, route } from "@/lib/http";
import { getAccount360 } from "@/lib/crm";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ accountId: string }> };

/** 360-graders profil: CRM-data + Research, Tilbud, Produktion og AOS (læst fra modulerne, ikke kopieret). */
export const GET = route<Ctx>(async (_req, { params }) => json(await getAccount360((await params).accountId)));
export const PATCH = route<Ctx>(async (req, { params }) => json(await updateAccount((await params).accountId, await readJson(req))));
