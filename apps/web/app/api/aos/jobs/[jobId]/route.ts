import { getJob } from "@agency/orchestrator/server";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route<{ params: Promise<{ jobId: string }> }>(async (_req, { params }) => json(await getJob((await params).jobId)));
