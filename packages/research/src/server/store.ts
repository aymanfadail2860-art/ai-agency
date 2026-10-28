import { ResearchJobSchema, ResearchReportSchema } from "@agency/core";
import { createCollectionStore } from "@agency/core/server";

/** Researchmodulets interne lagring — tilgås kun gennem modulets service. */
export const jobStore = createCollectionStore("research", "jobs", ResearchJobSchema);
export const reportStore = createCollectionStore("research", "reports", ResearchReportSchema);
