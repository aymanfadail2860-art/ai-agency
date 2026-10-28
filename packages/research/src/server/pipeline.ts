import {
  DEFAULT_SERVICE_CATALOG,
  type Company,
  type ResearchJob,
  type ResearchReport,
  type ResearchSource,
  type ResearchStep,
} from "@agency/core";
import { publishEvent } from "@agency/core/server";
import {
  getSearchProvider,
  integrationConfig,
  isAiConfigured,
  safeFetch,
  type SearchResult,
} from "@agency/integrations";
import { AppError, isAppError, newId, nowIso } from "@agency/shared";
import { runClaudeAnalysis } from "./claude-analysis";
import { getDemoDatasetByCvr } from "./demo-data";
import { parseHtmlPage, selectInternalPages, type ParsedPage } from "./html";
import { segmentForIndustryCode } from "./industry";
import { buildOpportunities, buildRecommendations } from "./recommend";
import { buildRulesCompetitors, buildRulesProfile, buildRulesSummary } from "./rules-analysis";
import { detectSignals, type PageWithSource, type TextWithSource } from "./signals";
import { pageSource, registrySource, textSource } from "./sources";
import { jobStore, reportStore } from "./store";

/**
 * RESEARCHPIPELINE
 * ----------------
 * registry → website → search → competitors → signals → recommendations → analysis → report
 *
 * Datakilderne abstraheres i `ResearchDataSources`, så Demo Mode og Live Mode
 * kører præcis de samme analysetrin. I Live Mode bruges kun rigtige,
 * konfigurerede integrationer — der er ingen fallback til fiktive data.
 */

export const RESEARCH_STEPS: Array<Pick<ResearchStep, "key" | "label">> = [
  { key: "registry", label: "Registerdata (CVR)" },
  { key: "website", label: "Officiel hjemmeside" },
  { key: "search", label: "Websøgning: nyheder, job, anmeldelser" },
  { key: "competitors", label: "Konkurrenter" },
  { key: "signals", label: "Digitale funktioner og signaler" },
  { key: "recommendations", label: "Serviceanbefalinger og score" },
  { key: "analysis", label: "Virksomhedsanalyse" },
  { key: "report", label: "Rapport" },
];

export interface FetchedDoc {
  finalUrl: string;
  body: string;
  fetchedAt: string;
}

export interface ResearchDataSources {
  isDemo: boolean;
  provider: string;
  fetchPage: (url: string) => Promise<FetchedDoc>;
  /** null = websøgning ikke tilgængelig. */
  search: ((query: string, kind: "jobs" | "reviews" | "news" | "competitors") => Promise<SearchResult[]>) | null;
  useAi: boolean;
}

export function liveDataSources(): ResearchDataSources {
  const search = getSearchProvider();
  return {
    isDemo: false,
    provider: "web",
    fetchPage: async (url) => {
      const res = await safeFetch(url);
      return { finalUrl: res.finalUrl, body: res.body, fetchedAt: res.fetchedAt };
    },
    search: search.isConfigured() ? (query) => search.search(query, { count: 5 }) : null,
    useAi: isAiConfigured(),
  };
}

export function demoDataSources(company: Company): ResearchDataSources {
  const dataset = getDemoDatasetByCvr(company.cvr);
  if (!dataset) throw new AppError("not_found", "Demo-datasættet for virksomheden blev ikke fundet.");
  return {
    isDemo: true,
    provider: "demo",
    fetchPage: async (url) => {
      const normalized = url.replace(/#.*$/, "");
      const html = dataset.pages[normalized] ?? dataset.pages[normalized.replace(/\/$/, "")] ?? dataset.competitors.find((c) => c.url === normalized)?.html;
      if (!html) throw new AppError("integration_error", `Demo-siden ${url} findes ikke.`);
      return { finalUrl: normalized, body: html, fetchedAt: nowIso() };
    },
    search: async (_query, kind) => {
      if (kind === "competitors") {
        return dataset.competitors.map((c) => ({ title: c.name, url: c.url, description: "Fiktiv konkurrent (Demo)", age: null }));
      }
      return dataset.search
        .filter((s) => s.kind === kind)
        .map((s) => ({ title: s.title, url: s.url, description: s.text, age: null }));
    },
    useAi: false,
  };
}

const DIRECTORY_HOSTS = /(^|\.)(krak|degulesider|proff|cvrapi|virk|facebook|linkedin|instagram|trustpilot|google|youtube|wikipedia|jobindex|ofir|bing|yelp|tripadvisor)\./i;

function companyNameCore(name: string): string {
  return name
    .replace(/\b(aps|a\/s|i\/s|ivs|k\/s|p\/s|holding|v\/.*)\b/gi, "")
    .replace(/[^\p{L}\p{N}\s&]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function mentionsCompany(result: SearchResult, core: string): boolean {
  const haystack = `${result.title} ${result.description}`.toLowerCase();
  return core.length >= 3 && haystack.includes(core);
}

async function setStep(jobId: string, key: string, status: ResearchStep["status"], detail: string | null = null) {
  await jobStore.update(jobId, (job) => ({
    ...job,
    status: job.status === "queued" ? "running" : job.status,
    steps: job.steps.map((s) => (s.key === key ? { ...s, status, detail } : s)),
    updatedAt: nowIso(),
  }));
}

export function newJob(company: Company, websiteUrl: string | null): ResearchJob {
  const now = nowIso();
  return {
    id: newId("researchJob"),
    companyId: company.id,
    mode: company.mode,
    status: "queued",
    steps: RESEARCH_STEPS.map((s) => ({ ...s, status: "pending", detail: null })),
    websiteUrl,
    startedAt: null,
    finishedAt: null,
    error: null,
    reportId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function runResearchJob(job: ResearchJob, company: Company, ds: ResearchDataSources): Promise<ResearchReport> {
  await jobStore.update(job.id, (j) => ({ ...j, status: "running", startedAt: nowIso(), updatedAt: nowIso() }));
  const sources: ResearchSource[] = [];
  const limitations: string[] = [];
  if (ds.isDemo) limitations.push("Demo Mode: alle kilder, virksomheder og konkurrenter er fiktive.");

  // 1. Registerdata
  await setStep(job.id, "registry", "running");
  const registry = registrySource(company);
  sources.push(registry);
  await setStep(job.id, "registry", "done", `${company.registrySource.provider} · ${company.registrySource.retrievedAt.slice(0, 10)}`);

  // 2. Officiel hjemmeside
  const pages: PageWithSource[] = [];
  const websiteUrl = job.websiteUrl ?? company.contact.website;
  let websiteAttempted = false;
  if (!websiteUrl) {
    await setStep(job.id, "website", "skipped", "Ingen hjemmeside registreret eller angivet");
    limitations.push("Ingen hjemmeside er registreret i CVR eller angivet — digitale funktioner er ikke undersøgt.");
  } else if (!ds.isDemo && !integrationConfig.websiteFetchEnabled()) {
    await setStep(job.id, "website", "skipped", "Webhentning er deaktiveret");
    limitations.push("Hentning af hjemmesider er deaktiveret (RESEARCH_WEBSITE_FETCH=false).");
  } else {
    websiteAttempted = true;
    await setStep(job.id, "website", "running", websiteUrl);
    try {
      const home = await ds.fetchPage(websiteUrl);
      const homePage = parseHtmlPage(home.body, home.finalUrl);
      const homeSource = pageSource(homePage, "website", home.fetchedAt, ds.isDemo, ds.provider);
      sources.push(homeSource);
      pages.push({ sourceId: homeSource.id, page: homePage });
      for (const url of selectInternalPages(homePage, 4)) {
        try {
          const doc = await ds.fetchPage(url);
          const parsed = parseHtmlPage(doc.body, doc.finalUrl);
          const src = pageSource(parsed, "website", doc.fetchedAt, ds.isDemo, ds.provider);
          sources.push(src);
          pages.push({ sourceId: src.id, page: parsed });
        } catch (err) {
          limitations.push(`Undersiden ${url} kunne ikke hentes: ${isAppError(err) ? err.message : "ukendt fejl"}`);
        }
      }
      await setStep(job.id, "website", "done", `${pages.length} side(r) analyseret`);
    } catch (err) {
      const message = isAppError(err) ? err.message : "ukendt fejl";
      limitations.push(`Hjemmesiden (${websiteUrl}) kunne ikke hentes: ${message}`);
      await setStep(job.id, "website", "failed", message);
    }
  }

  // 3. Websøgning
  const texts: TextWithSource[] = [];
  const competitorCandidates: SearchResult[] = [];
  if (!ds.search) {
    await setStep(job.id, "search", "skipped", "Websøgning ikke konfigureret");
    limitations.push("Websøgning er ikke konfigureret (BRAVE_SEARCH_API_KEY): nyheder, stillingsopslag, anmeldelser og konkurrenter er ikke undersøgt.");
  } else {
    await setStep(job.id, "search", "running");
    const core = companyNameCore(company.name);
    const queries: Array<{ kind: "jobs" | "reviews" | "news"; query: string }> = [
      { kind: "jobs", query: `"${company.name}" job stilling` },
      { kind: "reviews", query: `"${company.name}" anmeldelser` },
      { kind: "news", query: `"${company.name}" nyheder` },
    ];
    let count = 0;
    for (const q of queries) {
      try {
        const results = await ds.search(q.query, q.kind);
        // I Live Mode tilskrives et resultat kun virksomheden, hvis navnet optræder i det.
        for (const r of results.filter((x) => ds.isDemo || mentionsCompany(x, core)).slice(0, 4)) {
          const src = textSource({ kind: q.kind, title: r.title, url: r.url, text: r.description, provider: ds.isDemo ? "demo" : "Brave Search", isDemo: ds.isDemo });
          sources.push(src);
          texts.push({ sourceId: src.id, kind: q.kind, text: `${r.title} ${r.description}` });
          count++;
        }
      } catch (err) {
        limitations.push(`Søgningen "${q.query}" fejlede: ${isAppError(err) ? err.message : "ukendt fejl"}`);
      }
    }
    try {
      const industry = company.industry?.text ?? "";
      const city = company.address?.city ?? "";
      if (industry) {
        const ownHost = websiteUrl ? new URL(websiteUrl).hostname.replace(/^www\./, "") : null;
        const results = await ds.search(`${industry} ${city}`.trim(), "competitors");
        competitorCandidates.push(
          ...results.filter((r) => {
            const host = new URL(r.url).hostname.replace(/^www\./, "");
            return host !== ownHost && (ds.isDemo || !DIRECTORY_HOSTS.test(host));
          }),
        );
      }
    } catch (err) {
      limitations.push(`Konkurrentsøgningen fejlede: ${isAppError(err) ? err.message : "ukendt fejl"}`);
    }
    await setStep(job.id, "search", "done", `${count} relevante resultater`);
  }

  // 4. Konkurrenter — kun dem, der fremgår af søgeresultater; deres sider analyseres for observerbare funktioner.
  const competitorPages: Array<{ sourceId: string; name: string; url: string; features: ReturnType<typeof detectSignals>["features"] }> = [];
  if (competitorCandidates.length === 0) {
    await setStep(job.id, "competitors", "skipped", ds.search ? "Ingen konkurrenter fundet" : "Kræver websøgning");
  } else {
    await setStep(job.id, "competitors", "running");
    for (const candidate of competitorCandidates.slice(0, 3)) {
      try {
        const doc = await ds.fetchPage(candidate.url);
        const parsed: ParsedPage = parseHtmlPage(doc.body, doc.finalUrl);
        const src = pageSource(parsed, "competitor", doc.fetchedAt, ds.isDemo, ds.provider);
        sources.push(src);
        const analysis = detectSignals({ company, pages: [{ sourceId: src.id, page: parsed }], texts: [], registrySourceId: registry.id, websiteAttempted: true });
        competitorPages.push({ sourceId: src.id, name: candidate.title, url: doc.finalUrl, features: analysis.features });
      } catch (err) {
        limitations.push(`Konkurrentsiden ${candidate.url} kunne ikke hentes: ${isAppError(err) ? err.message : "ukendt fejl"}`);
      }
    }
    await setStep(job.id, "competitors", "done", `${competitorPages.length} konkurrent(er) analyseret`);
  }

  // 5. Signaler
  await setStep(job.id, "signals", "running");
  const analysis = detectSignals({ company, pages, texts, registrySourceId: registry.id, websiteAttempted });
  await setStep(job.id, "signals", "done", `${analysis.features.length} funktioner · ${analysis.signals.length} signaler`);

  // 6. Anbefalinger (deterministisk score)
  await setStep(job.id, "recommendations", "running");
  const segment = segmentForIndustryCode(company.industry?.code);
  const recommendations = buildRecommendations({
    company,
    segment,
    catalog: DEFAULT_SERVICE_CATALOG,
    signals: analysis.signals,
    registrySourceId: registry.id,
    limitations: limitations.filter((l) => !l.startsWith("Demo Mode")),
  });
  const opportunities = buildOpportunities(recommendations, DEFAULT_SERVICE_CATALOG);
  await setStep(job.id, "recommendations", "done", `${recommendations.length} services anbefalet`);

  // 7. Analyse
  await setStep(job.id, "analysis", "running", ds.useAi ? "Claude analyserer kilderne" : "Regelbaseret analyse");
  const rulesInput = { company, segment, registrySourceId: registry.id, pages, analysis, competitorPages };
  let profile = buildRulesProfile(rulesInput);
  let competitors = buildRulesCompetitors(rulesInput);
  let summary = buildRulesSummary(rulesInput, recommendations.length);
  let engine: ResearchReport["analysisEngine"] = ds.isDemo ? "demo" : "rules";
  let model: string | null = null;

  if (ds.isDemo) {
    summary = getDemoDatasetByCvr(company.cvr)?.summary ?? summary;
    await setStep(job.id, "analysis", "done", "Demo-analyse (regelbaseret på fiktive kilder)");
  } else if (ds.useAi) {
    try {
      const ai = await runClaudeAnalysis({ company, sources, features: analysis.features, signals: analysis.signals, recommendations });
      engine = "claude";
      model = ai.model;
      summary = ai.summary || summary;
      // AI-profil bruges, men felter uden indhold beholder de regelbaserede fund.
      profile = Object.fromEntries(
        Object.entries(ai.profile).map(([k, v]) => [k, v.length > 0 ? v : profile[k as keyof typeof profile]]),
      ) as typeof profile;
      if (ai.competitors.length > 0) {
        const known = new Set(competitors.map((c) => c.name.toLowerCase()));
        competitors = [...competitors, ...ai.competitors.filter((c) => !known.has(c.name.toLowerCase()))];
      }
      for (const rec of recommendations) {
        const relevance = ai.relevanceByCatalogId.get(rec.catalogItemId);
        if (relevance) rec.relevance = relevance;
      }
      for (const opp of opportunities) {
        const note = ai.opportunityNotes.find((n) => n.area === opp.area);
        if (note) {
          opp.description = note.description;
          opp.classification = note.classification;
          opp.sourceIds = Array.from(new Set([...opp.sourceIds, ...note.sourceIds]));
        }
      }
      if (ai.downgraded > 0) limitations.push(`${ai.downgraded} AI-påstand(e) uden gyldig kilde blev nedgraderet fra fakta til vurdering.`);
      await setStep(job.id, "analysis", "done", `Claude (${model})`);
    } catch (err) {
      const message = isAppError(err) ? err.message : "ukendt fejl";
      limitations.push(`AI-analysen fejlede (${message}) — rapporten bygger på regelbaseret analyse.`);
      await setStep(job.id, "analysis", "failed", `${message} · regelbaseret analyse anvendt`);
    }
  } else {
    limitations.push("AI-analyse er ikke konfigureret (ANTHROPIC_API_KEY) — rapporten bygger på en gennemsigtig, regelbaseret analyse.");
    await setStep(job.id, "analysis", "done", "Regelbaseret (AI ikke konfigureret)");
  }

  // 8. Rapport
  await setStep(job.id, "report", "running");
  const now = nowIso();
  const report: ResearchReport = {
    id: newId("researchReport"),
    companyId: company.id,
    jobId: job.id,
    mode: company.mode,
    analysisEngine: engine,
    analysisModel: model,
    summary,
    profile,
    opportunities,
    competitors,
    recommendations,
    sources,
    limitations: Array.from(new Set(limitations)),
    notes: "",
    status: "draft",
    handoffs: [],
    createdAt: now,
    updatedAt: now,
  };
  await reportStore.upsert(report);
  await setStep(job.id, "report", "done");
  await jobStore.update(job.id, (j) => ({ ...j, status: "completed", reportId: report.id, finishedAt: nowIso(), updatedAt: nowIso() }));
  await publishEvent({
    type: "research.completed",
    source: "research",
    mode: company.mode,
    subject: { companyId: company.id, reportId: report.id, jobId: job.id },
    payload: { engine, recommendations: recommendations.length, sources: sources.length },
  });
  return report;
}
