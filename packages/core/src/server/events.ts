import { newId, nowIso } from "@agency/shared";
import { DomainEventSchema, type DomainEvent } from "../events";
import { createCollectionStore } from "./json-store";

/**
 * Hændelseslog + in-process abonnement. I V1 bruges loggen til sporbarhed;
 * fremtidige moduler (CRM, Dashboard) kan abonnere uden at kende afsenderen.
 */
const store = createCollectionStore("platform", "events", DomainEventSchema);

type Handler = (event: DomainEvent) => void | Promise<void>;
const handlers = new Set<Handler>();

export type PublishInput = Omit<DomainEvent, "id" | "occurredAt" | "version">;

export async function publishEvent(input: PublishInput): Promise<DomainEvent> {
  const event = DomainEventSchema.parse({ ...input, id: newId("event"), version: 1, occurredAt: nowIso() });
  await store.upsert(event);
  for (const handler of handlers) {
    try {
      await handler(event);
    } catch (err) {
      console.error(`[events] handler fejlede for ${event.type}`, err);
    }
  }
  return event;
}

export function subscribe(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export async function listEvents(limit = 50): Promise<DomainEvent[]> {
  return (await store.list()).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, limit);
}
