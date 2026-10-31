import { json, route } from "@/lib/http";
import { acceptQuoteAndCreateProject } from "@/lib/production";

export const dynamic = "force-dynamic";

/** Kunden har accepteret: tilbuddet låses som accepteret og overføres til Produktion via kontrakten. */
export const POST = route<{ params: Promise<{ quoteId: string }> }>(async (_req, { params }) => {
  const { project, created } = await acceptQuoteAndCreateProject((await params).quoteId);
  return json({ projectId: project.id, created }, created ? 201 : 200);
});
