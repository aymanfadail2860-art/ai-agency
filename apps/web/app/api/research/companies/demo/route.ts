import { z } from "zod";
import { registerDemoCompany } from "@agency/research/server";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

const Body = z.object({ key: z.string().min(1).max(64) });

/** Demo Mode: registrerer en fiktiv virksomhed. */
export const POST = route(async (req) => {
  const { key } = Body.parse(await readJson(req));
  return json(await registerDemoCompany(key), 201);
});
