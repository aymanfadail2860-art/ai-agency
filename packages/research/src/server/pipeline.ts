import {
  DEFAULT_SERVICE_CATALOG,
  INDUSTRY_SEGMENT_LABELS,
  type Brand,
  type Company,
  type IndustrySegment,
  type ResearchJob,
  type ResearchReport,
  type ResearchSource,
  type ResearchStep,
  type Website,
} from "@agency/core";
import { establishmentRegistry, formatAddress, publishEvent } from "@agency/core/server";
import {
  getSearchProvider,
  integrationConfig,
  isAiConfigured,
  safeFetch,
  type SearchResult,
} from "@agency/integrations";
import { AppError, isAppError, newId, nowIso } from "@agency/shared";
import { runClaudeAnalysis } from "./claude-analysis";
import { findDemoSiteByDomain } from "./demo-data";
import { parseHtmlPage, selectInternalPages, type ParsedPage } from "./html";
import { segmentForIndustryCode, segmentFromText } from "./industry";
import { buildMeetingQuestions, buildOpportunities, buildOverallRecommendation, buildRecommendations } from "./recommend";
import { buildRulesCompetitors, buildRulesProfile, buildRulesSummary } from "./rules-analysis";
import { detectSignals, type PageWithSource, type TextWithSource } from "./signals";
import { pageSource, registrySource, textSource } from "./sources";
import { jobStore, reportStore } from "./store";
import { assessDigitalMaturity, buildWebsiteAnalysis, classifyPage, type PageType } from "./website";

/**
 * RESEARCH ENGINE (V2, brand-first)
 * ---------------------------------
 * identity → website → search → competitors → signals → recommendations → analysis → report
 *
 * Datakilderne abstraheres i `ResearchDataSources`, så Demo Mode og Live Mode
 * kører de samme analysetrin. I Live Mode bruges kun rigtige, konfigurerede
 * integrationer — der er ingen fallback til fiktive data.
 */

export const RESEARCH_STEPS: Array<Pick<ResearchStep, "key" | "label">> = [
  { key: "identity", label: "Brand og juridisk identitet" },
  { key: "website", label: "Website Intelligence" },
  { key: "search", label: "Websøgning: anmeldelser, job, nyheder, profiler" },
  { key: "competitors", label: "Konkurrentanalyse" },
  { key: "signals", label: "Digitale funktioner og signaler" },
  { key: "recommendations", label: "Serviceanbefalinger og Opportunity Score" },
  { key: "analysis", label: "Forretningsanalyse" },
  { key: "report", label: "Kommerciel rapport" },
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
  search: ((query: string, kind: "jobs" | "reviews" | "news" | "social" | "competitors") => Promise<SearchResult[]>) | null;
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

/** Demo Mode: fiktive sider, søgeresultater og konkurrenter for brandets .example-domæne. */
export function demoDataSources(websites: string[]): ResearchDataSources {
  const datasets = websites.map((w) => findDemoSiteByDomain(new URL(w).hostname)).filter((d): d is NonNullable<typeof d> => Boolean(d));
  const primary = datasets[0];
  return {
    isDemo: true,
    provider: "demo",
    fetchPage: async (url) => {
      const normalized = url.replace(/#.*$/, "");
      for (const ds of datasets) {
        const html = ds.pages[normalized] ?? ds.pages[normalized.replace(/\/$/, "")] ?? ds.pages[`${normalized.replace(/\/$/, "")}/`] ?? ds.competitors.find((c) => c.url === normalized)?.html;
        if (html) return { finalUrl: normalized, body: html, fetchedAt: nowIso() };
      }
      throw new AppError("integration_error", `Demo-siden ${url} findes ikke.`);
    },
    search: primary
      ? async (_query, kind) => {
          if (kind === "competitors") return primary.competitors.map((c) => ({ title: c.name, url: c.url, description: "Fiktiv konkurrent (Demo)", age: null }));
          return primary.search.filter((s) => s.kind === kind).map((s) => ({ title: s.title, url: s.url, description: s.text, age: null }));
        }
      : null,
    useAi: false,
  };
}

export function demoSummaryFor(websites: string[]): string | null {
  for (const w of websites) {
    const ds = findDemoSiteByDomain(new URL(w).hostname);
    if (ds) return ds.summary;
  }
  return null;
}

const DIRECTORY_HOSTS = /(^|\.)(krak|degulesider|proff|cvrapi|virk|facebook|linkedin|instagram|trustpilot|google|youtube|wikipedia|jobindex|ofir|bing|yelp|tripadvisor)\./i;

function nameCore(name: string): string {
  return name
    .replace(/\b(aps|a\/s|i\/s|ivs|k\/s|p\/s|holding|v\/.*)\b/gi, "")
    .replace(/[^\p{L}\p{N}\s&]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function mentionsAny(result: SearchResult, cores: string[]): boolean {
  const haystack = `${result.title} ${result.description}`.toLowerCase();
  return cores.some((c) => c.length >= 3 && haystack.includes(c));
}

async function setStep(jobId: string, key: string, status: ResearchStep["status"], detail: string | null = null) {
  await jobStore.update(jobId, (job) => ({
    ...job,
    status: job.status === "queued" ? "running" : job.status,
    steps: job.steps.map((s) => (s.key === key ? { ...s, status, detail } : s)),
    updatedAt: nowIso(),
  }));
}

export function newJob(brand: Brand, websiteUrl: string | null, legalEntityId: string | null): ResearchJob {
  const now = nowIso();
  return {
    id: newId("researchJob"),
    brandId: brand.id,
    companyId: legalEntityId,
    mode: brand.mode,
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

export interface BrandResearchInput {
  brand: Brand;
  websites: Website[];
  /** Kun BEKRÆFTEDE juridiske enheder bruges som fakta i analysen. */
  confirmedLegalEntities: Company[];
  /** Alle relationer (inkl. foreslåede) — vises i rapporten med status. */
  relationSnapshot: NonNullable<ResearchReport["legalEntities"]>;
}

function maxPages(): number {
  const v = Number(process.env.RESEARCH_MAX_PAGES);
  return Number.isFinite(v) && v >= 1 && v <= 15 ? Math.floor(v) : 8;
}

export async function runBrandResearch(job: ResearchJob, input: BrandResearchInput, ds: ResearchDataSources): Promise<ResearchReport> {
  const { brand } = input;
  await jobStore.update(job.id, (j) => ({ ...j, status: "running", startedAt: nowIso(), updatedAt: nowIso() }));
  const sources: ResearchSource[] = [];
  const limitations: string[] = [];
  if (ds.isDemo) limitations.push("Demo Mode: alle kilder, virksomheder og konkurrenter er fiktive.");

  // 1. Identitet — registerdata kun for bekræftede juridiske enheder
  await setStep(job.id, "identity", "running");
  const registrySources = new Map<string, ResearchSource>();
  for (const entity of input.confirmedLegalEntities) {
    const src = registrySource(entity);
    sources.push(src);
    registrySources.set(entity.id, src);
  }
  const primaryLegal = input.confirmedLegalEntities[0] ?? null;
  const primaryRegistrySourceId = primaryLegal ? registrySources.get(primaryLegal.id)!.id : null;
  const suggested = input.relationSnapshot.filter((r) => r.status === "suggested");
  if (input.confirmedLegalEntities.length === 0) {
    limitations.push(suggested.length > 0 ? `${suggested.length} juridisk(e) enhed(er) er foreslået, men ikke bekræftet — registerdata indgår ikke i analysen.` : "Ingen juridisk enhed er knyttet til brandet — analysen bygger på hjemmeside og øvrige kilder.");
  }
  if (input.confirmedLegalEntities.length > 1) limitations.push("Flere juridiske enheder er bekræftet; den første bruges som primær i analysen.");
  const snapshot = input.relationSnapshot.map((r) => ({ ...r, sourceId: registrySources.get(r.legalEntityId)?.id ?? null }));
  await setStep(job.id, "identity", "done", input.confirmedLegalEntities.length > 0 ? `${input.confirmedLegalEntities.map((e) => `CVR ${e.cvr}`).join(", ")} bekræftet` : "Brand uden bekræftet CVR");

  // 2. Website Intelligence
  const pages: Array<PageWithSource & { pageType: PageType }> = [];
  const blocked: Array<{ url: string; reason: string }> = [];
  const primarySite = input.websites.find((w) => w.isPrimary) ?? input.websites[0];
  const websiteUrl = job.websiteUrl ?? primarySite?.url ?? primaryLegal?.contact.website ?? null;
  let websiteAttempted = false;
  if (!websiteUrl) {
    await setStep(job.id, "website", "skipped", "Ingen hjemmeside kendt");
    limitations.push("Ingen hjemmeside er kendt for brandet — digitale funktioner er ukendte.");
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
      pages.push({ sourceId: homeSource.id, page: homePage, pageType: "home" });
      for (const url of selectInternalPages(homePage, maxPages() - 1)) {
        try {
          const doc = await ds.fetchPage(url);
          const parsed = parseHtmlPage(doc.body, doc.finalUrl);
          const src = pageSource(parsed, "website", doc.fetchedAt, ds.isDemo, ds.provider);
          sources.push(src);
          pages.push({ sourceId: src.id, page: parsed, pageType: classifyPage(parsed.url) });
        } catch (err) {
          blocked.push({ url, reason: isAppError(err) ? err.message : "ukendt fejl" });
        }
      }
      await setStep(job.id, "website", "done", `${pages.length} side(r) analyseret${blocked.length ? ` · ${blocked.length} kunne ikke hentes` : ""}`);
    } catch (err) {
      const message = isAppError(err) ? err.message : "ukendt fejl";
      blocked.push({ url: websiteUrl, reason: message });
      limitations.push(`Hjemmesiden (${websiteUrl}) kunne ikke hentes: ${message}`);
      await setStep(job.id, "website", "failed", message);
    }
    if (blocked.length > 0 && pages.length > 0) limitations.push(`${blocked.length} underside(r) kunne ikke hentes (fx pga. robots.txt eller timeout).`);
  }

  // 3. Websøgning
  const texts: TextWithSource[] = [];
  const competitorCandidates: SearchResult[] = [];
  const cores = Array.from(new Set([nameCore(brand.name), ...input.confirmedLegalEntities.map((e) => nameCore(e.name))])).filter(Boolean);
  if (!ds.search) {
    await setStep(job.id, "search", "skipped", "Websøgning ikke konfigureret");
    limitations.push("Websøgning er ikke konfigureret (BRAVE_SEARCH_API_KEY): anmeldelser, stillingsopslag, nyheder, sociale profiler og konkurrenter er ikke undersøgt eksternt.");
  } else {
    await setStep(job.id, "search", "running");
    const queries: Array<{ kind: "jobs" | "reviews" | "news" | "social"; query: string }> = [
      { kind: "reviews", query: `"${brand.name}" anmeldelser` },
      { kind: "jobs", query: `"${brand.name}" job stilling` },
      { kind: "news", query: `"${brand.name}" nyheder` },
      { kind: "social", query: `"${brand.name}" linkedin OR facebook OR instagram` },
    ];
    let count = 0;
    for (const q of queries) {
      try {
        const results = await ds.search(q.query, q.kind);
        // I Live Mode tilskrives et resultat kun brandet, hvis navnet optræder i det.
        for (const r of results.filter((x) => ds.isDemo || mentionsAny(x, cores)).slice(0, 4)) {
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
      const industry = primaryLegal?.industry?.text ?? (pages[0]?.page.description || "");
      const city = primaryLegal?.address?.city ?? "";
      if (industry) {
        const ownHosts = new Set(input.websites.map((w) => w.domain));
        const results = await ds.search(`${industry} ${city}`.trim().slice(0, 120), "competitors");
        competitorCandidates.push(
          ...results.filter((r) => {
            const host = new URL(r.url).hostname.replace(/^www\./, "");
            return !ownHosts.has(host) && (ds.isDemo || !DIRECTORY_HOSTS.test(host));
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
        const a = detectSignals({ company: null, pages: [{ sourceId: src.id, page: parsed }], texts: [], registrySourceId: null, websiteAttempted: true });
        competitorPages.push({ sourceId: src.id, name: candidate.title, url: doc.finalUrl, features: a.features });
      } catch (err) {
        limitations.push(`Konkurrentsiden ${candidate.url} kunne ikke hentes: ${isAppError(err) ? err.message : "ukendt fejl"}`);
      }
    }
    await setStep(job.id, "competitors", "done", `${competitorPages.length} konkurrent(er) analyseret`);
  }

  // 5. Signaler og website-analyse
  await setStep(job.id, "signals", "running");
  const analysis = detectSignals({ company: primaryLegal, pages, texts, registrySourceId: primaryRegistrySourceId, websiteAttempted });
  const websiteAnalysis = buildWebsiteAnalysis(pages, analysis.features, blocked);
  let digitalMaturity = assessDigitalMaturity(websiteAnalysis);
  await setStep(job.id, "signals", "done", `${analysis.features.length} funktioner observeret · ${analysis.signals.length} signaler`);

  // 6. Anbefalinger (deterministisk score)
  await setStep(job.id, "recommendations", "running");
  const registrySegment = segmentForIndustryCode(primaryLegal?.industry?.code);
  const textSegment: IndustrySegment = pages.length > 0 ? segmentFromText(pages.map((p) => `${p.page.title} ${p.page.description} ${p.page.headings.join(" ")} ${p.page.text}`).join(" ")) : "other";
  const segment: IndustrySegment = registrySegment !== "other" ? registrySegment : textSegment;
  const segmentBasis = registrySegment !== "other" ? ("registry" as const) : textSegment !== "other" ? ("website" as const) : ("unknown" as const);
  const basisSourceIds = segmentBasis === "registry" && primaryRegistrySourceId ? [primaryRegistrySourceId] : pages.slice(0, 1).map((p) => p.sourceId);
  const recommendations = buildRecommendations({
    brandName: brand.name,
    industryText: segmentBasis === "registry" ? (primaryLegal?.industry?.text ?? null) : segmentBasis === "website" ? INDUSTRY_SEGMENT_LABELS[segment] : null,
    segment,
    segmentBasis,
    catalog: DEFAULT_SERVICE_CATALOG,
    signals: analysis.signals,
    basisSourceIds,
    limitations: limitations.filter((l) => !l.startsWith("Demo Mode")),
  });
  const opportunities = buildOpportunities(recommendations, DEFAULT_SERVICE_CATALOG);
  if (recommendations.length < 5) limitations.push(`Datagrundlaget understøtter ${recommendations.length} anbefaling(er). Der er bevidst ikke fyldt op med generiske forslag.`);
  await setStep(job.id, "recommendations", "done", `${recommendations.length} services anbefalet`);

  // 7. Analyse
  await setStep(job.id, "analysis", "running", ds.useAi ? "Claude analyserer kilderne" : "Regelbaseret analyse");
  const rulesInput = { brandName: brand.name, company: primaryLegal, segment, segmentBasis, registrySourceId: primaryRegistrySourceId, pages, analysis, competitorPages };
  let profile = buildRulesProfile(rulesInput);
  let competitors = buildRulesCompetitors(rulesInput);
  let summary = buildRulesSummary(rulesInput, recommendations.length);
  const extraQuestions: string[] = [];
  if (input.confirmedLegalEntities.length === 0) extraQuestions.push("Hvilken juridisk enhed (CVR) skal et eventuelt samarbejde og tilbud udstedes til?");
  let meetingQuestions = buildMeetingQuestions(recommendations, extraQuestions);
  let overallRecommendation = buildOverallRecommendation(brand.name, recommendations);
  let engine: ResearchReport["analysisEngine"] = ds.isDemo ? "demo" : "rules";
  let model: string | null = null;

  if (ds.isDemo) {
    summary = demoSummaryFor(input.websites.map((w) => w.url)) ?? summary;
    await setStep(job.id, "analysis", "done", "Demo-analyse (regelbaseret på fiktive kilder)");
  } else if (ds.useAi) {
    try {
      const ai = await runClaudeAnalysis({ brandName: brand.name, websites: input.websites.map((w) => w.url), legalEntity: primaryLegal, sources, websiteAnalysis, signals: analysis.signals, recommendations });
      engine = "claude";
      model = ai.model;
      summary = ai.summary || summary;
      profile = Object.fromEntries(Object.entries(ai.profile).map(([k, v]) => [k, v.length > 0 ? v : profile[k as keyof typeof profile]])) as typeof profile;
      if (ai.competitors.length > 0) {
        const known = new Set(competitors.map((c) => c.name.toLowerCase()));
        competitors = [...competitors, ...ai.competitors.filter((c) => !known.has(c.name.toLowerCase()))];
      }
      for (const rec of recommendations) {
        const note = ai.notesByCatalogId.get(rec.catalogItemId);
        if (!note) continue;
        rec.relevance = note.relevance;
        if (note.proposedSolution) rec.proposedSolution = note.proposedSolution;
        if (note.businessBenefit) rec.businessBenefit = note.businessBenefit;
        if (note.customerQuestions.length) rec.customerQuestions = note.customerQuestions;
        rec.uncertainties = Array.from(new Set([...rec.uncertainties, ...note.uncertainties])).slice(0, 6);
      }
      for (const opp of opportunities) {
        const note = ai.opportunities.find((n) => n.area === opp.area);
        if (!note) continue;
        Object.assign(opp, {
          observed: note.observed,
          potentialProblem: note.potentialProblem,
          solution: note.solution,
          value: note.value,
          missingInformation: note.missingInformation,
          description: `${note.observed} ${note.potentialProblem}`,
          classification: note.classification,
          sourceIds: Array.from(new Set([...opp.sourceIds, ...note.sourceIds])),
        });
      }
      if (ai.digitalMaturityRationale && digitalMaturity.level !== "unknown") digitalMaturity = { ...digitalMaturity, rationale: `${digitalMaturity.rationale} ${ai.digitalMaturityRationale}` };
      if (ai.meetingQuestions.length > 0) meetingQuestions = Array.from(new Set([...extraQuestions, ...ai.meetingQuestions])).slice(0, 10);
      if (ai.overallRecommendation) overallRecommendation = ai.overallRecommendation;
      if (ai.downgraded > 0) limitations.push(`${ai.downgraded} AI-påstand(e) uden gyldig kilde blev nedgraderet fra fakta til vurdering.`);
      await setStep(job.id, "analysis", "done", `Claude (${model}) · est. ${ai.costUsd.toFixed(3)} USD`);
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
    schemaVersion: 2,
    brandId: brand.id,
    companyId: primaryLegal?.id ?? null,
    jobId: job.id,
    mode: brand.mode,
    researchBasis: ds.isDemo ? "demo" : "live",
    brandSnapshot: { brandId: brand.id, name: brand.name, websites: input.websites.map((w) => w.url) },
    legalEntities: snapshot,
    websiteAnalysis,
    digitalMaturity,
    meetingQuestions,
    overallRecommendation,
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
    mode: brand.mode,
    subject: { companyId: primaryLegal?.id, reportId: report.id, jobId: job.id },
    payload: { brandId: brand.id, engine, recommendations: recommendations.length, sources: sources.length },
  });
  return report;
}

/** Bygger relationssnapshot til rapporten (inkl. antal arbejdssteder). */
export async function buildRelationSnapshot(relations: Array<{ status: "suggested" | "confirmed" | "rejected"; legalEntity: Company }>): Promise<NonNullable<ResearchReport["legalEntities"]>> {
  const out: NonNullable<ResearchReport["legalEntities"]> = [];
  for (const r of relations) {
    if (r.status === "rejected") continue;
    const est = await establishmentRegistry.forLegalEntity(r.legalEntity.id);
    out.push({
      legalEntityId: r.legalEntity.id,
      cvr: r.legalEntity.cvr,
      name: r.legalEntity.name,
      status: r.status,
      industry: r.legalEntity.industry?.text ?? null,
      companyForm: r.legalEntity.companyForm?.text ?? null,
      address: formatAddress(r.legalEntity),
      establishments: est.length,
      sourceId: null,
    });
  }
  return out;
}
