import { createCollectionStore } from "@agency/core/server";
import { CostEntrySchema, ProductionProjectSchema, ProductionTaskSchema, ProjectEventSchema, ProjectFileSchema, ServiceBaseSchema, TestCaseSchema } from "../contracts";

/** Produktionsmodulets samlinger i `public.documents` (modul "production"). */
export const projectStore = createCollectionStore("production", "projects", ProductionProjectSchema);
export const taskStore = createCollectionStore("production", "tasks", ProductionTaskSchema);
export const testStore = createCollectionStore("production", "tests", TestCaseSchema);
export const fileStore = createCollectionStore("production", "files", ProjectFileSchema);
export const eventStore = createCollectionStore("production", "events", ProjectEventSchema);
export const costStore = createCollectionStore("production", "costs", CostEntrySchema);
export const serviceBaseStore = createCollectionStore("production", "service-bases", ServiceBaseSchema);
