import { getSettings } from "@agency/core/server";
import { DEMO_STEPS, type CrmDemoState } from "@agency/crm";
import {
  createAccount,
  createActivity,
  createContact,
  createOpportunity,
  deleteDemoAccount,
  demoStateStore,
  getAccountCore,
  linkProject,
  markAsCustomer,
  requireOpportunity,
  syncFromQuote,
  updateActivity,
  updateAccount,
} from "@agency/crm/server";
import { createFromIntake, deleteDemoProject, markProjectAsDemo } from "@agency/production/server";
import { acceptQuote, buildProductionIntake, getCatalog, getQuote, removeDemoQuote } from "@agency/quotes/server";
import { getBrandOverview, getJob, getReport } from "@agency/research/server";
import { AppError } from "@agency/shared";
import { createQuoteForOpportunity, setQuoteStatus } from "./crm";
import { startBrandResearchJob } from "./orchestrator";
import { ensureProductionWiring } from "./production";

/**
 * GUIDET CRM-DEMO (kun Demo Mode)
 * -------------------------------
 * Hvert trin bruger de rigtige funktioner (CRM, Research via Job Center,
 * Tilbud og Produktion) på tydeligt markerede eksempeldata. Der sendes ingen
 * e-mails, foretages ingen opkald og startes ingen betalte AI-opgaver.
 */
const DEMO_SITE = "https://bryggeriet-nordlys.example";
const at = (days: number, hour = 10) => {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setUTCHours(hour - 1, 0, 0, 0);
  return d.toISOString();
};
const date = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function requireDemoMode() {
  if ((await getSettings()).mode !== "demo") throw new AppError("mode_mismatch", "CRM-demoen kan kun køres i Demo Mode.");
}

export async function getDemoState(): Promise<CrmDemoState> {
  return (await demoStateStore.get("crm-demo")) ?? { id: "crm-demo", run: 1, step: 0, accountId: null, contactId: null, opportunityId: null, meetingId: null, quoteId: null, projectId: null, upsellId: null, updatedAt: new Date().toISOString() };
}

const need = <T>(value: T | null, what: string): T => {
  if (value === null) throw new AppError("conflict", `Demoen mangler ${what}. Nulstil demoen og start forfra.`);
  return value;
};

/** Udfører næste trin i demoen. */
export async function runNextDemoStep(): Promise<{ state: CrmDemoState; message: string }> {
  await requireDemoMode();
  ensureProductionWiring();
  const s = await getDemoState();
  if (s.step >= DEMO_STEPS.length) throw new AppError("conflict", "Demoen er gennemført. Nulstil for at starte forfra.");
  const step = DEMO_STEPS[s.step]!;
  let message: string = step.title;
  const next: CrmDemoState = { ...s };

  switch (step.key) {
    case "lead": {
      const { account } = await createAccount(
        { name: "Bryggeriet Nordlys", website: DEMO_SITE, industry: "Bryggeri og restaurant", size: "10-49", source: "network", phone: "+45 00 00 00 00", tags: ["demo", "bryggeri"], notes: "DEMO — fiktiv virksomhed med eksempeldata." },
        { mode: "demo", isDemo: true },
      );
      if (!account.isDemo) throw new AppError("conflict", "Bryggeriet Nordlys findes allerede som almindelig CRM-virksomhed (fx oprettet fra Research). Den guidede demo ændrer ikke eksisterende data — åbn virksomheden under Virksomheder i stedet.");
      next.accountId = account.id;
      message = `Lead oprettet: ${account.name} (kilde: netværk).`;
      break;
    }
    case "research": {
      const accountId = need(s.accountId, "virksomheden");
      const { account } = await getAccountCore(accountId);
      const overview = await getBrandOverview(account.brandId);
      let reportId = overview.latestReport?.id ?? null;
      if (!reportId) {
        // Kører den rigtige researchpipeline (demodata) gennem AOS' Job Center.
        const pending: Array<Promise<void>> = [];
        const { researchJob } = await startBrandResearchJob({ brandId: account.brandId }, (task) => void pending.push(task()));
        await Promise.all(pending);
        reportId = researchJob ? ((await getJob(researchJob.id)).reportId ?? null) : null;
      }
      need(reportId, "en researchrapport");
      await createActivity({ accountId, kind: "note", subject: "Research tilknyttet", description: `Brandresearch (rapport ${reportId}) er tilknyttet virksomheden.` });
      message = "Research tilknyttet — rapporten vises under fanen Research.";
      break;
    }
    case "contact": {
      const accountId = need(s.accountId, "virksomheden");
      const { contact } = await createContact(accountId, { name: "Mette Demo", title: "Driftschef", email: "mette@bryggeriet-nordlys.example", phone: "+45 00 00 00 01", isPrimary: true, marketingConsent: true, notes: "Fiktiv kontaktperson (demo). Samtykke registreret ved første kontakt." });
      next.contactId = contact.id;
      message = `Kontaktperson oprettet: ${contact.name}, ${contact.title}.`;
      break;
    }
    case "first_contact": {
      const accountId = need(s.accountId, "virksomheden");
      await createActivity({ accountId, contactId: s.contactId, kind: "call", status: "done", subject: "Første opkald", description: "Demo: opkaldet er registreret — der er ikke ringet.", outcome: "Interesse for at reducere ubesvarede opkald og bookinger i weekenden.", nextStep: "Book behovsmøde" });
      message = "Første kontakt registreret (opkald logget).";
      break;
    }
    case "meeting": {
      const accountId = need(s.accountId, "virksomheden");
      const meeting = await createActivity({ accountId, contactId: s.contactId, kind: "meeting", subject: "Behovsmøde på bryggeriet", description: "Gennemgang af telefonflow, booking og selskaber.", dueAt: at(3), priority: "high" });
      next.meetingId = meeting.id;
      message = "Behovsmøde planlagt om 3 dage.";
      break;
    }
    case "needs": {
      const accountId = need(s.accountId, "virksomheden");
      await updateActivity(need(s.meetingId, "mødet"), { status: "done", dueAt: new Date().toISOString(), outcome: "Behov: telefonen besvares ikke i travle perioder; selskabsforespørgsler kræver hurtig opfølgning; ønske om booking direkte i systemet.", nextStep: "Udarbejd tilbud" });
      await updateAccount(accountId, { status: "qualified", statusNote: "Behov afdækket på mødet." });
      message = "Behov afdækket — leadet er kvalificeret.";
      break;
    }
    case "opportunity": {
      const accountId = need(s.accountId, "virksomheden");
      const { account } = await getAccountCore(accountId);
      const overview = await getBrandOverview(account.brandId);
      const report = overview.latestReport ? (await getReport(overview.latestReport.id)).report : null;
      const catalog = await getCatalog();
      const recs = (report?.recommendations ?? []).slice(0, 2);
      const ids = recs.length ? recs.map((r) => r.catalogItemId) : ["svc_ai_receptionist"];
      const items = ids.map((id) => catalog.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
      const opp = await createOpportunity(
        {
          accountId,
          title: items.map((i) => i.name).join(" + "),
          services: items.map((i) => i.id),
          implementationValue: items.reduce((sum, i) => sum + i.implementationPrice, 0),
          monthlyValue: items.reduce((sum, i) => sum + i.monthlyPrice, 0),
          expectedCloseDate: date(21),
          stage: "needs_identified",
          primaryContactId: s.contactId,
          reportId: report?.id ?? null,
        },
        { isDemo: true },
      );
      next.opportunityId = opp.id;
      message = `Salgsmulighed oprettet: ${opp.title} (${opp.implementationValue.toLocaleString("da-DK")} kr. + ${opp.monthlyValue.toLocaleString("da-DK")} kr./md.).`;
      break;
    }
    case "quote": {
      const oppId = need(s.opportunityId, "salgsmuligheden");
      const { quoteId, quoteNumber } = await createQuoteForOpportunity(oppId, {}, { demoRun: s.run });
      await setQuoteStatus(quoteId, "sent");
      next.quoteId = quoteId;
      message = `Tilbud ${quoteNumber} oprettet og markeret som sendt — salgsmuligheden er nu i "Tilbud sendt" (ikke vundet).`;
      break;
    }
    case "won": {
      const quote = await acceptQuote(need(s.quoteId, "tilbuddet"));
      await syncFromQuote({ id: quote.id, number: quote.number, status: "accepted" });
      message = `Kunden har accepteret tilbud ${quote.number} — salgsmuligheden er vundet.`;
      break;
    }
    case "project": {
      const quote = await getQuote(need(s.quoteId, "tilbuddet"));
      const { project } = await createFromIntake(buildProductionIntake(quote));
      await markProjectAsDemo(project.id);
      await linkProject(need(s.opportunityId, "salgsmuligheden"), project.id, project.name);
      next.projectId = project.id;
      message = `Produktionsprojekt oprettet via kontrakten: ${project.name}.`;
      break;
    }
    case "customer": {
      const accountId = need(s.accountId, "virksomheden");
      await markAsCustomer(accountId, "Aftalen er overført til Produktion.");
      await createActivity({ accountId, contactId: s.contactId, kind: "call", subject: "Velkomstopkald", description: "Introduktion til projektforløbet og kontaktpersoner.", dueAt: at(2) });
      message = "Bryggeriet Nordlys er nu aktiv kunde. Velkomstopkald planlagt.";
      break;
    }
    case "upsell": {
      const accountId = need(s.accountId, "virksomheden");
      const opp = await requireOpportunity(need(s.opportunityId, "salgsmuligheden"));
      const catalog = await getCatalog();
      const candidate = catalog.find((c) => !opp.services.includes(c.id) && c.id === "svc_ai_chatbot") ?? catalog.find((c) => !opp.services.includes(c.id))!;
      await createActivity({ accountId, contactId: s.contactId, kind: "follow_up", subject: "Kvartalsopfølgning", description: "Gennemgå resultater og nye behov.", dueAt: at(30), nextStep: "Præsentér mersalg" });
      const upsell = await createOpportunity({ accountId, title: `Mersalg: ${candidate.name}`, services: [candidate.id], implementationValue: candidate.implementationPrice, monthlyValue: candidate.monthlyPrice, expectedCloseDate: date(60), stage: "qualified", primaryContactId: s.contactId }, { isDemo: true });
      next.upsellId = upsell.id;
      message = `Opfølgning planlagt og mersalg registreret: ${upsell.title}.`;
      break;
    }
  }
  next.step = s.step + 1;
  next.updatedAt = new Date().toISOString();
  await demoStateStore.upsert(next);
  return { state: next, message };
}

/** Nulstiller demoen: fjerner kun demoens egne poster (virksomhed, tilbud, projekt). */
export async function resetCrmDemo(): Promise<CrmDemoState> {
  await requireDemoMode();
  const s = await getDemoState();
  if (s.projectId) await deleteDemoProject(s.projectId).catch(() => undefined);
  if (s.quoteId) await removeDemoQuote(s.quoteId).catch(() => undefined);
  if (s.accountId) await deleteDemoAccount(s.accountId);
  const fresh: CrmDemoState = { id: "crm-demo", run: s.run + 1, step: 0, accountId: null, contactId: null, opportunityId: null, meetingId: null, quoteId: null, projectId: null, upsellId: null, updatedAt: new Date().toISOString() };
  await demoStateStore.upsert(fresh);
  return fresh;
}
