import { getSettings } from "@agency/core/server";
import { listApprovals } from "@agency/orchestrator/server";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => json(await listApprovals({ mode: (await getSettings()).mode })));
