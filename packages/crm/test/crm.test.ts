import { beforeAll, describe, expect, it } from "vitest";

beforeAll(async () => {
  const { updateSettings } = await import("@agency/core/server");
  await updateSettings({ mode: "demo" });
});

describe("Virksomheder", () => {
  it("genbruger samme virksomhed via domæne og navn — ingen dubletter, heller ikke ved samtidige oprettelser", async () => {
    const { createAccount } = await import("@agency/crm/server");
    const [a, b] = await Promise.all([
      createAccount({ name: "Café Test", website: "https://cafe-test.example" }, { mode: "demo" }),
      createAccount({ name: "Café Test ApS", website: "https://www.cafe-test.example/kontakt" }, { mode: "demo" }),
    ]);
    expect(b.account.id).toBe(a.account.id);
    const c = await createAccount({ name: "Ingen Hjemmeside" }, { mode: "demo" });
    const d = await createAccount({ name: "  ingen hjemmeside " }, { mode: "demo" });
    expect(d.created).toBe(false);
    expect(d.account.id).toBe(c.account.id);
    expect(c.account.id).toBe(`acc_${c.account.brandId.slice(4)}`);
  });

  it("CVR er valgfrit, men valideres når det angives", async () => {
    const { createAccount } = await import("@agency/crm/server");
    expect((await createAccount({ name: "Uden CVR" }, { mode: "demo" })).account.cvr).toBeNull();
    await expect(createAccount({ name: "Forkert CVR", cvr: "123" }, { mode: "demo" })).rejects.toThrow(/8 cifre/);
  });

  it("kontaktpersoner dubleres ikke på e-mail, og der er kun én primær", async () => {
    const { createAccount, createContact, getAccountCore } = await import("@agency/crm/server");
    const { account } = await createAccount({ name: "Kontakt Test" }, { mode: "demo" });
    await createContact(account.id, { name: "Anna", email: "anna@x.example" });
    const again = await createContact(account.id, { name: "Anna B.", email: "ANNA@x.example" });
    expect(again.created).toBe(false);
    await createContact(account.id, { name: "Bo", email: "bo@x.example", isPrimary: true });
    const core = await getAccountCore(account.id);
    expect(core.contacts).toHaveLength(2);
    expect(core.contacts.filter((c) => c.isPrimary).map((c) => c.name)).toEqual(["Bo"]);
  });
});

describe("Pipeline", () => {
  it("holder implementering og månedlig værdi adskilt og kræver årsag ved tabt", async () => {
    const { createAccount, createOpportunity, moveStage, getCrmDashboard } = await import("@agency/crm/server");
    const { account } = await createAccount({ name: "Pipeline Test" }, { mode: "demo" });
    const opp = await createOpportunity({ accountId: account.id, title: "AI-receptionist", implementationValue: 24500, monthlyValue: 2900, stage: "qualified" });
    expect(opp.probability).toBe(25);
    await expect(createOpportunity({ accountId: account.id, title: "X", stage: "won" })).rejects.toThrow(/vundet eller tabt/);
    await expect(moveStage(opp.id, { stage: "lost" })).rejects.toThrow(/hvorfor/);
    const moved = await moveStage(opp.id, { stage: "meeting_booked" });
    expect(moved.probability).toBe(35);
    expect(moved.history.at(-1)?.message).toContain("Kvalificeret → Møde booket");
    const dash = await getCrmDashboard("demo", null);
    expect(dash.pipeline.implementation).toBeGreaterThanOrEqual(24500);
    expect(dash.pipeline.monthly).toBeGreaterThanOrEqual(2900);
    const lost = await moveStage(opp.id, { stage: "lost", lostReason: "Valgte en anden løsning" });
    expect(lost.status).toBe("lost");
    expect(lost.closedAt).not.toBeNull();
  });

  it("tilbud → CRM: sendt flytter til 'Tilbud sendt', accept giver vundet, afvisning ændrer ikke stadiet", async () => {
    const { createAccount, createOpportunity, linkQuote, syncFromQuote, requireOpportunity } = await import("@agency/crm/server");
    const { account } = await createAccount({ name: "Sync Test" }, { mode: "demo" });
    const opp = await createOpportunity({ accountId: account.id, title: "Chatbot", stage: "needs_identified" });
    await linkQuote(opp.id, "qte_sync1", "T-1");
    await syncFromQuote({ id: "qte_sync1", number: "T-1", status: "draft" });
    expect((await requireOpportunity(opp.id)).stage).toBe("needs_identified");
    await syncFromQuote({ id: "qte_sync1", number: "T-1", status: "sent" });
    const sent = await requireOpportunity(opp.id);
    expect(sent.stage).toBe("quote_sent");
    expect(sent.status).toBe("open");
    await syncFromQuote({ id: "qte_sync1", number: "T-1", status: "rejected" });
    expect((await requireOpportunity(opp.id)).stage).toBe("quote_sent");
    await syncFromQuote({ id: "qte_sync1", number: "T-1", status: "accepted" });
    expect((await requireOpportunity(opp.id)).status).toBe("won");
  });

  it("vundet gør ikke i sig selv kunden aktiv — det sker ved overførsel til Produktion", async () => {
    const { createAccount, createOpportunity, moveStage, markAsCustomer, requireAccount } = await import("@agency/crm/server");
    const { account } = await createAccount({ name: "Status Test" }, { mode: "demo" });
    const opp = await createOpportunity({ accountId: account.id, title: "X", stage: "qualified" });
    await moveStage(opp.id, { stage: "won" });
    expect((await requireAccount(account.id)).status).toBe("qualified");
    await markAsCustomer(account.id, "Overført til Produktion");
    const customer = await requireAccount(account.id);
    expect(customer.status).toBe("customer");
    expect(customer.statusHistory.at(-1)?.note).toBe("Overført til Produktion");
  });
});

describe("Aktiviteter", () => {
  it("knyttes til virksomhed/kontakt/mulighed, og forsinkede og kommende vises korrekt", async () => {
    const { createAccount, createActivity, updateActivity, listActivities, createOpportunity } = await import("@agency/crm/server");
    const { account } = await createAccount({ name: "Aktivitet Test" }, { mode: "demo" });
    const other = await createAccount({ name: "Anden Virksomhed" }, { mode: "demo" });
    const opp = await createOpportunity({ accountId: other.account.id, title: "Andet" });
    await expect(createActivity({ accountId: account.id, opportunityId: opp.id, kind: "call", subject: "X" })).rejects.toThrow(/hører ikke til/);
    const late = await createActivity({ accountId: account.id, kind: "follow_up", subject: "For sent", dueAt: new Date(Date.now() - 86_400_000).toISOString() });
    await createActivity({ accountId: account.id, kind: "meeting", subject: "Snart", dueAt: new Date(Date.now() + 2 * 86_400_000).toISOString() });
    const note = await createActivity({ accountId: account.id, kind: "note", subject: "Note" });
    expect(note.status).toBe("done");
    expect((await listActivities({ mode: "demo", accountId: account.id, view: "overdue" })).map((a) => a.subject)).toEqual(["For sent"]);
    expect((await listActivities({ mode: "demo", accountId: account.id, view: "upcoming" })).map((a) => a.subject)).toEqual(["Snart"]);
    const done = await updateActivity(late.id, { status: "done", outcome: "Ringet op", nextStep: "Send materiale" });
    expect(done.completedAt).not.toBeNull();
    expect(await listActivities({ mode: "demo", accountId: account.id, view: "overdue" })).toHaveLength(0);
  });

  it("demodata kan kun slettes, når de er markeret som demo", async () => {
    const { createAccount, deleteDemoAccount, findAccountByBrand } = await import("@agency/crm/server");
    const real = await createAccount({ name: "Rigtig Kunde" }, { mode: "demo" });
    await expect(deleteDemoAccount(real.account.id)).rejects.toThrow(/demodata/);
    const demo = await createAccount({ name: "Demo Kunde" }, { mode: "demo", isDemo: true });
    await deleteDemoAccount(demo.account.id);
    expect(await findAccountByBrand(demo.account.brandId)).toBeNull();
  });
});
