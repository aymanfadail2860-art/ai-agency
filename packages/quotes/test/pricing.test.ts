import { describe, expect, it } from "vitest";
import type { Discount } from "@agency/core";
import { calculateQuoteTotals } from "../src/pricing";

const none: Discount = { kind: "none", value: 0, scope: "all", label: null };
const line = (id: string, impl: number, monthly: number, extra: Partial<{ quantity: number; addOns: Array<{ implementationPrice: number; monthlyPrice: number }> }> = {}) => ({
  id,
  implementationPrice: impl,
  monthlyPrice: monthly,
  quantity: extra.quantity ?? 1,
  addOns: (extra.addOns ?? []).map((a, i) => ({ id: `a${i}`, name: "Tilvalg", description: "", ...a })),
});

describe("calculateQuoteTotals", () => {
  it("summerer implementering, månedlig pris og første år uden rabat", () => {
    const t = calculateQuoteTotals({ vatRate: 0.25, discount: none, lineItems: [line("a", 24500, 2900), line("b", 16500, 1290), line("c", 14500, 1490)] });
    expect(t.implementation.subtotal).toBe(55500);
    expect(t.implementation.exclVat).toBe(55500);
    expect(t.implementation.vat).toBe(13875);
    expect(t.implementation.inclVat).toBe(69375);
    expect(t.monthly.exclVat).toBe(5680);
    expect(t.monthly.vat).toBe(1420);
    expect(t.monthly.inclVat).toBe(7100);
    expect(t.firstYear.implementationPart).toBe(55500);
    expect(t.firstYear.monthlyPart).toBe(68160);
    expect(t.firstYear.exclVat).toBe(123660);
    expect(t.firstYear.vat).toBe(30915);
    expect(t.firstYear.inclVat).toBe(154575);
  });

  it("medregner antal og tilvalg pr. linje", () => {
    const t = calculateQuoteTotals({
      vatRate: 0.25,
      discount: none,
      lineItems: [line("a", 1000, 100, { quantity: 3, addOns: [{ implementationPrice: 500, monthlyPrice: 50 }] })],
    });
    expect(t.lines[0]).toEqual({ id: "a", implementation: 4500, monthly: 450 });
    expect(t.implementation.exclVat).toBe(4500);
    expect(t.monthly.exclVat).toBe(450);
  });

  it("giver procentrabat på alle beløb", () => {
    const t = calculateQuoteTotals({ vatRate: 0.25, discount: { kind: "percent", value: 10, scope: "all", label: null }, lineItems: [line("a", 20000, 2000)] });
    expect(t.implementation.discount).toBe(2000);
    expect(t.implementation.exclVat).toBe(18000);
    expect(t.monthly.discount).toBe(200);
    expect(t.monthly.exclVat).toBe(1800);
    expect(t.firstYear.exclVat).toBe(18000 + 12 * 1800);
  });

  it("begrænser procentrabat til det valgte omfang", () => {
    const impl = calculateQuoteTotals({ vatRate: 0.25, discount: { kind: "percent", value: 15, scope: "implementation", label: null }, lineItems: [line("a", 10000, 1000)] });
    expect(impl.implementation.exclVat).toBe(8500);
    expect(impl.monthly.exclVat).toBe(1000);
    const monthly = calculateQuoteTotals({ vatRate: 0.25, discount: { kind: "percent", value: 15, scope: "monthly", label: null }, lineItems: [line("a", 10000, 1000)] });
    expect(monthly.implementation.exclVat).toBe(10000);
    expect(monthly.monthly.exclVat).toBe(850);
  });

  it("giver fast beløbsrabat og lader den aldrig gøre beløb negative", () => {
    const t = calculateQuoteTotals({ vatRate: 0.25, discount: { kind: "amount", value: 2500, scope: "implementation", label: null }, lineItems: [line("a", 10000, 1000)] });
    expect(t.implementation.exclVat).toBe(7500);
    const capped = calculateQuoteTotals({ vatRate: 0.25, discount: { kind: "amount", value: 99999, scope: "implementation", label: null }, lineItems: [line("a", 10000, 1000)] });
    expect(capped.implementation.discount).toBe(10000);
    expect(capped.implementation.exclVat).toBe(0);
    const allScope = calculateQuoteTotals({ vatRate: 0.25, discount: { kind: "amount", value: 1000, scope: "all", label: null }, lineItems: [line("a", 10000, 1000)] });
    expect(allScope.implementation.exclVat).toBe(9000);
    expect(allScope.monthly.exclVat).toBe(1000);
  });

  it("begrænser procent til maks. 100", () => {
    const t = calculateQuoteTotals({ vatRate: 0.25, discount: { kind: "percent", value: 150, scope: "all", label: null }, lineItems: [line("a", 10000, 1000)] });
    expect(t.implementation.exclVat).toBe(0);
    expect(t.firstYear.inclVat).toBe(0);
  });

  it("afrunder korrekt til hele øre uden flydende kommatalsfejl", () => {
    const t = calculateQuoteTotals({ vatRate: 0.25, discount: { kind: "percent", value: 12.5, scope: "all", label: null }, lineItems: [line("a", 0.1, 0.2), line("b", 0.2, 0.1), line("c", 999.99, 33.33)] });
    expect(t.implementation.subtotal).toBe(1000.29);
    expect(t.implementation.discount).toBe(125.04);
    expect(t.implementation.exclVat).toBe(875.25);
    expect(t.implementation.vat).toBe(218.81);
    expect(t.implementation.inclVat).toBe(1094.06);
    expect(t.monthly.subtotal).toBe(33.63);
  });

  it("lader engangsydelser indgå i engangsbeløbet uden abonnement", () => {
    const t = calculateQuoteTotals({ vatRate: 0.25, discount: none, lineItems: [line("a", 10000, 1000), { ...line("b", 5000, 999), kind: "one_time" as const }] });
    expect(t.implementation.exclVat).toBe(15000);
    expect(t.monthly.exclVat).toBe(1000);
    expect(t.lines[1]).toEqual({ id: "b", implementation: 5000, monthly: 0 });
  });

  it("håndterer tomt tilbud og 0 % moms", () => {
    const empty = calculateQuoteTotals({ vatRate: 0.25, discount: none, lineItems: [] });
    expect(empty.firstYear.inclVat).toBe(0);
    const noVat = calculateQuoteTotals({ vatRate: 0, discount: none, lineItems: [line("a", 1000, 100)] });
    expect(noVat.firstYear.vat).toBe(0);
    expect(noVat.firstYear.inclVat).toBe(2200);
  });
});
