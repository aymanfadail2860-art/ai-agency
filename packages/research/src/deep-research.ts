import { z } from "zod";

/**
 * RESULTATFORMAT FOR DYB RESEARCH (Claude Code-rutine)
 * ----------------------------------------------------
 * Research-modulet ejer formatet; Job Center validerer resultatet mod det,
 * før det gemmes. Formatet håndhæver kildekritik i selve valideringen:
 *  - En påstand klassificeret som `fact` skal have mindst én kilde, der også
 *    står i `sources`. Ellers nedgraderes den til `assessment` / `unverified`.
 *  - Ukendte felter fjernes.
 */
const Classification = z.enum(["fact", "assessment", "hypothesis", "unknown"]);
const Verification = z.enum(["multiple_sources", "single_source", "unverified"]);
const Url = z.string().url().max(2000).refine((u) => /^https?:\/\//i.test(u), "Kun http(s)-adresser.");

const FindingSchema = z.object({
  statement: z.string().min(3).max(600),
  classification: Classification,
  sourceUrls: z.array(Url).max(10).default([]),
  verification: Verification.default("unverified"),
});

const OpportunitySchema = z.object({
  title: z.string().min(3).max(160),
  observed: z.string().max(600),
  potentialProblem: z.string().max(600),
  solution: z.string().max(600),
  classification: Classification,
  sourceUrls: z.array(Url).max(10).default([]),
});

export const DeepResearchResultSchema = z
  .object({
    brandName: z.string().min(1).max(200),
    findings: z.array(FindingSchema).min(1).max(40),
    opportunities: z.array(OpportunitySchema).max(12).default([]),
    competitors: z.array(z.object({ name: z.string().min(1).max(160), url: Url.nullable().default(null), note: z.string().max(400).default("") })).max(10).default([]),
    sources: z.array(z.object({ url: Url, title: z.string().max(300).default("") })).min(1).max(60),
    openQuestions: z.array(z.string().min(3).max(300)).max(15).default([]),
    limitations: z.array(z.string().min(3).max(400)).max(15).default([]),
  })
  .transform((result) => {
    const known = new Set(result.sources.map((s) => s.url));
    let downgraded = 0;
    const findings = result.findings.map((f) => {
      const sourced = f.sourceUrls.filter((u) => known.has(u));
      const verification = sourced.length >= 2 ? "multiple_sources" : sourced.length === 1 ? "single_source" : "unverified";
      if (f.classification === "fact" && sourced.length === 0) {
        downgraded++;
        return { ...f, classification: "assessment" as const, sourceUrls: sourced, verification: "unverified" as const };
      }
      return { ...f, sourceUrls: sourced, verification: verification as z.infer<typeof Verification> };
    });
    const limitations = downgraded
      ? [...result.limitations, `${downgraded} påstand(e) markeret som fakta uden gyldig kilde blev nedgraderet til vurdering.`]
      : result.limitations;
    return { ...result, findings, limitations };
  });

export type DeepResearchResult = z.output<typeof DeepResearchResultSchema>;

export const VERIFICATION_LABELS: Record<z.infer<typeof Verification>, string> = {
  multiple_sources: "Flere kilder",
  single_source: "Én kilde",
  unverified: "Ikke verificeret",
};
