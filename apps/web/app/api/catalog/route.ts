import { getCatalog } from "@agency/quotes/server";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => json({ items: await getCatalog() }));
