import { createVersion } from "@agency/quotes/server";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = route<{ params: Promise<{ quoteId: string }> }>(async (_req, { params }) => json(await createVersion((await params).quoteId), 201));
