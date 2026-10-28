import { getReport, updateReport } from "@agency/research/server";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ reportId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => json(await getReport((await params).reportId)));

/** Gemmer valg, redigerede beskrivelser og noter — bevares ved genindlæsning. */
export const PATCH = route<Ctx>(async (req, { params }) => json(await updateReport((await params).reportId, (await readJson(req)) as never)));
