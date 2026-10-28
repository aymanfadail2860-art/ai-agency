import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Dashboard — afventer. Kontrakten er dokumenteret, men ikke implementeret i V1. */
function notImplemented() {
  return json(
    {
      error: { code: "not_implemented", message: "Afventer — modulet udvikles i en kommende version." },
      contract: "dashboard.metric-datapoint@1",
      documentation: "docs/api-contracts.md",
    },
    501,
  );
}

export const GET = notImplemented;
export const POST = notImplemented;
