import { json, readJson, route } from "@/lib/http";
import { crmFromReport } from "@/lib/crm";

export const dynamic = "force-dynamic";

/** Research → CRM: opret lead, start salgsmulighed eller tilknyt rapporten til en eksisterende virksomhed. */
export const POST = route(async (req) => json(await crmFromReport(await readJson(req))));
