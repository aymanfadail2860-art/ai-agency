import { describe, expect, it } from "vitest";
import { companyRegistry } from "@agency/core/server";
import { DEMO_DATASETS, demoDataSources, newJob, registerDemoCompany, runResearchJob } from "@agency/research/server";
import { jobStore } from "../src/server/store";

describe("researchpipeline i Demo Mode", () => {
  it.each(DEMO_DATASETS.map((d) => d.key))("genererer en komplet rapport for %s", async (key) => {
    const company = await registerDemoCompany(key);
    const job = await jobStore.upsert(newJob(company, null));
    const report = await runResearchJob(job, company, demoDataSources(company));

    expect(report.mode).toBe("demo");
    expect(report.analysisEngine).toBe("demo");
    expect(report.sources.every((s) => s.isDemo)).toBe(true);
    expect(report.recommendations.length).toBeGreaterThanOrEqual(3);
    expect(report.competitors.length).toBeGreaterThanOrEqual(1);
    expect(report.limitations[0]).toMatch(/Demo Mode/);

    // Alle fakta skal have mindst én gyldig kilde.
    const ids = new Set(report.sources.map((s) => s.id));
    const findings = [...Object.values(report.profile).flat(), ...report.recommendations.flatMap((r) => r.findings)];
    for (const f of findings) {
      for (const id of f.sourceIds) expect(ids.has(id)).toBe(true);
      if (f.classification === "fact") expect(f.sourceIds.length).toBeGreaterThan(0);
    }
    for (const rec of report.recommendations) {
      expect(rec.score.total).toBeGreaterThanOrEqual(0);
      expect(rec.score.total).toBeLessThanOrEqual(100);
      expect(rec.score.criteria).toHaveLength(4);
    }
    const finished = await jobStore.get(job.id);
    expect(finished?.status).toBe("completed");
    expect(finished?.steps.every((s) => s.status !== "pending" && s.status !== "running")).toBe(true);
    console.log(key, report.recommendations.map((r) => `${r.serviceName}:${r.score.total}`).join(", "));
  });

  it("genbruger samme virksomheds-id ved gentagen registrering", async () => {
    const a = await registerDemoCompany("nordlys-vvs");
    const b = await registerDemoCompany("nordlys-vvs");
    expect(a.id).toBe(b.id);
    expect((await companyRegistry.list()).filter((c) => c.cvr === "00000001")).toHaveLength(1);
  });
});
