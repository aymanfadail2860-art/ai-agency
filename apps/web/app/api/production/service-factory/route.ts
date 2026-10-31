import { listServiceBases } from "@agency/production/server";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => json(await listServiceBases()));
