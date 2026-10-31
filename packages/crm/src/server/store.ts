import { createCollectionStore } from "@agency/core/server";
import { ActivitySchema, ContactSchema, CrmAccountSchema, CrmDemoStateSchema, OpportunitySchema } from "../contracts";

/** CRM-modulets samlinger i `public.documents` (modul "crm"). */
export const accountStore = createCollectionStore("crm", "accounts", CrmAccountSchema);
export const contactStore = createCollectionStore("crm", "contacts", ContactSchema);
export const opportunityStore = createCollectionStore("crm", "opportunities", OpportunitySchema);
export const activityStore = createCollectionStore("crm", "activities", ActivitySchema);
export const demoStateStore = createCollectionStore("crm", "demo-state", CrmDemoStateSchema);
