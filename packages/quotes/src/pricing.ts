import type { Discount, QuoteLineItem, QuoteVersion } from "@agency/core";
import { fromOre, toOre } from "@agency/shared";

/**
 * PRISBEREGNING
 * -------------
 * Ren, deterministisk funktion — bruges ens i editor, live preview, PDF og API.
 * Alle beregninger foregår i hele øre og afrundes kun ét sted pr. trin.
 *
 *  linje           = (pris + valgte tilvalg) × antal
 *  subtotal        = Σ linjer (separat for implementering og månedlig)
 *  rabat           = procent af subtotal, eller fast beløb (kan ikke overstige subtotal)
 *  ekskl. moms     = subtotal − rabat
 *  moms            = ekskl. moms × momssats (afrundet til hele øre)
 *  første år       = implementering + 12 × månedlig
 */

export interface Amounts {
  exclVat: number;
  vat: number;
  inclVat: number;
}

export interface LineTotals {
  id: string;
  implementation: number;
  monthly: number;
}

export interface QuoteTotals {
  vatRate: number;
  lines: LineTotals[];
  implementation: Amounts & { subtotal: number; discount: number };
  monthly: Amounts & { subtotal: number; discount: number };
  firstYear: Amounts & { implementationPart: number; monthlyPart: number };
}

type PricingInput = Pick<QuoteVersion, "vatRate"> & {
  lineItems: Array<Pick<QuoteLineItem, "id" | "implementationPrice" | "monthlyPrice" | "quantity" | "addOns">>;
  discount: Discount;
};

function lineOre(item: PricingInput["lineItems"][number]) {
  const qty = Math.max(1, Math.floor(item.quantity || 1));
  const impl = toOre(item.implementationPrice) + item.addOns.reduce((s, a) => s + toOre(a.implementationPrice), 0);
  const monthly = toOre(item.monthlyPrice) + item.addOns.reduce((s, a) => s + toOre(a.monthlyPrice), 0);
  return { implementation: impl * qty, monthly: monthly * qty };
}

function discountOre(subtotal: number, discount: Discount, target: "implementation" | "monthly"): number {
  if (discount.kind === "none" || discount.value <= 0) return 0;
  // Faste beløb med omfang "alle" gives på implementeringen (engangsbeløb).
  const scope = discount.kind === "amount" && discount.scope === "all" ? "implementation" : discount.scope;
  if (scope !== "all" && scope !== target) return 0;
  const raw = discount.kind === "percent" ? Math.round((subtotal * Math.min(100, discount.value)) / 100) : toOre(discount.value);
  return Math.min(subtotal, Math.max(0, raw));
}

function amounts(exclOre: number, vatRate: number): { excl: number; vat: number } {
  return { excl: exclOre, vat: Math.round(exclOre * vatRate) };
}

export function calculateQuoteTotals(input: PricingInput): QuoteTotals {
  const vatRate = input.vatRate;
  const lines = input.lineItems.map((item) => ({ id: item.id, ...lineOre(item) }));
  const implSub = lines.reduce((s, l) => s + l.implementation, 0);
  const monthSub = lines.reduce((s, l) => s + l.monthly, 0);
  const implDisc = discountOre(implSub, input.discount, "implementation");
  const monthDisc = discountOre(monthSub, input.discount, "monthly");

  const impl = amounts(implSub - implDisc, vatRate);
  const month = amounts(monthSub - monthDisc, vatRate);
  const yearExcl = impl.excl + 12 * month.excl;
  const year = amounts(yearExcl, vatRate);

  return {
    vatRate,
    lines: lines.map((l) => ({ id: l.id, implementation: fromOre(l.implementation), monthly: fromOre(l.monthly) })),
    implementation: {
      subtotal: fromOre(implSub),
      discount: fromOre(implDisc),
      exclVat: fromOre(impl.excl),
      vat: fromOre(impl.vat),
      inclVat: fromOre(impl.excl + impl.vat),
    },
    monthly: {
      subtotal: fromOre(monthSub),
      discount: fromOre(monthDisc),
      exclVat: fromOre(month.excl),
      vat: fromOre(month.vat),
      inclVat: fromOre(month.excl + month.vat),
    },
    firstYear: {
      implementationPart: fromOre(impl.excl),
      monthlyPart: fromOre(12 * month.excl),
      exclVat: fromOre(year.excl),
      vat: fromOre(year.vat),
      inclVat: fromOre(year.excl + year.vat),
    },
  };
}

export const DEFAULT_VAT_RATE = 0.25;
