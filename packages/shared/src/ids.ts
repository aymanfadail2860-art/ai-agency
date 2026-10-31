/**
 * Stabile, præfiksede identifikatorer (fx `cmp_3f2a…`).
 * Præfikset gør det muligt at se entitetstypen direkte i logs og URL'er.
 */
export const ID_PREFIXES = {
  company: "cmp",
  brand: "brd",
  website: "web",
  establishment: "est",
  brandRelation: "blr",
  researchJob: "rjob",
  researchReport: "rrep",
  researchSource: "src",
  finding: "fnd",
  opportunity: "opp",
  competitor: "cmpt",
  recommendation: "rec",
  quote: "qte",
  quoteVersion: "qver",
  quoteLineItem: "qli",
  handoff: "hnd",
  event: "evt",
  aiJob: "aij",
  productionProject: "prj",
  productionTask: "ptk",
  deliverable: "dlv",
  testCase: "ptc",
  projectFile: "pfl",
  projectEvent: "pev",
  costEntry: "pco",
  productionIntake: "pin",
  approval: "apr",
  crmAccount: "acc",
  crmContact: "con",
  salesOpportunity: "sop",
  crmActivity: "act",
  crmQuoteRequest: "crq",
} as const;

export type IdKind = keyof typeof ID_PREFIXES;

export function newId(kind: IdKind): string {
  const raw = globalThis.crypto.randomUUID().replace(/-/g, "");
  return `${ID_PREFIXES[kind]}_${raw.slice(0, 20)}`;
}

export function hasPrefix(id: string, kind: IdKind): boolean {
  return id.startsWith(`${ID_PREFIXES[kind]}_`);
}

export function nowIso(): string {
  return new Date().toISOString();
}
