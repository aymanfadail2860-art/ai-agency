import { getBrandOverview } from "@agency/research/server";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route<{ params: Promise<{ brandId: string }> }>(async (_req, { params }) => json(await getBrandOverview((await params).brandId)));
