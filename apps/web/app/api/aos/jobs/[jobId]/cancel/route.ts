import { cancelJob } from "@agency/orchestrator/server";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = route<{ params: Promise<{ jobId: string }> }>(async (_req, { params }) => json(await cancelJob((await params).jobId)));
