import type { Activity, Contact, CrmAccount, Opportunity } from "./contracts";

/**
 * 360-graders kundevisning. Research-, tilbuds-, projekt- og AOS-data læses
 * fra deres egne moduler i app'ens kompositionslag og samles her til visning —
 * CRM gemmer ingen kopier af dem.
 */
export interface Account360 {
  account: CrmAccount;
  contacts: Contact[];
  opportunities: Opportunity[];
  activities: Activity[];
  research: {
    brandReports: Array<{ id: string; createdAt: string; analysisEngine: string; status: string }>;
    linkedReports: Array<{ id: string; createdAt: string; name: string }>;
    recommendations: Array<{ catalogItemId: string; serviceName: string; score: number; priority: string; selected: boolean; reportId: string }>;
  };
  quotes: Array<{ id: string; number: string; status: string; versions: number; currentVersion: number; implementation: number; monthly: number; updatedAt: string }>;
  projects: Array<{ id: string; name: string; phase: string; status: string; isDemo: boolean; pendingApproval: boolean; deliverables: { done: number; total: number }; implementationPrice: number; monthlyPrice: number; registeredCosts: number; aiApiCostUsd: number; maintenance: string; blockers: string[] }>;
  documents: Array<{ title: string; url: string; source: string; addedAt: string }>;
  echo: { status: string; jobs: Array<{ id: string; title: string; status: string; taskType: string }> };
}
