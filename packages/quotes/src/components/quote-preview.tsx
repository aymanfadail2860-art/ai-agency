import type { Quote, QuoteVersion } from "@agency/core";
import { formatDate, formatDkk, formatPercent } from "@agency/shared";
import { calculateQuoteTotals } from "../pricing";
import { quoteRecipient } from "../recipient";

type DraftVersion = Pick<QuoteVersion, "lineItems" | "discount" | "vatRate" | "specialTerms" | "validityDays" | "content" | "versionNumber" | "updatedAt">;

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="space-y-1.5">
      {text.split("\n").map((line, i) =>
        line.trim() === "" ? <div key={i} className="h-2" /> : (
          <p key={i} className={line.trimStart().startsWith("–") ? "pl-4" : undefined}>
            {line}
          </p>
        ),
      )}
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid space-y-2">
      <h3 className="flex items-baseline gap-2 border-b border-slate-200 pb-1.5 text-[15px] font-semibold text-[#14244b]">
        <span className="text-xs font-bold text-[#2e6deb]">{String(n).padStart(2, "0")}</span> {title}
      </h3>
      <div className="text-[13px] leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

/** Live preview — samme struktur og beregninger som PDF-eksporten. */
export function QuotePreview({ quote, version, agencyName }: { quote: Quote; version: DraftVersion; agencyName: string }) {
  const totals = calculateQuoteTotals(version);
  const c = version.content;
  const isDemo = quote.mode === "demo";
  const recipient = quoteRecipient(quote);
  const validUntil = new Date(new Date(version.updatedAt).getTime() + version.validityDays * 86_400_000).toISOString();

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-card" data-testid="quote-preview">
      <div className="relative bg-[#14244b] px-8 pb-8 pt-7 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-200">{agencyName}</p>
        <p className="mt-10 text-xs font-bold uppercase tracking-[0.18em] text-blue-300">Tilbud</p>
        <h2 className="mt-1 text-2xl font-semibold leading-tight">{c.title}</h2>
        <p className="mt-3 text-sm text-blue-100" data-testid="preview-recipient">
          {recipient.displayName}
          {recipient.showLegalName && <span className="text-blue-200/80"> · {recipient.legalName}</span>}
        </p>
        {isDemo && <span className="absolute right-6 top-6 rounded-full bg-amber-300 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">Demo</span>}
      </div>
      <div className="space-y-7 px-8 py-7">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
          {[
            ["Kunde", recipient.displayName],
            ["Juridisk enhed", recipient.legalName ?? "Ikke bekræftet"],
            ["CVR", recipient.cvr ? (isDemo ? `${recipient.cvr} (fiktivt)` : recipient.cvr) : "—"],
            ["Adresse", recipient.address ?? recipient.website ?? "—"],
            ["Tilbudsnummer", `${quote.number} · v${version.versionNumber}`],
            ["Dato", formatDate(version.updatedAt)],
            ["Gyldigt til", formatDate(validUntil)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{k}</dt>
              <dd className="text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="grid grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          {[
            ["Implementering", totals.implementation.exclVat],
            ["Pr. måned", totals.monthly.exclVat],
            ["Første år", totals.firstYear.exclVat],
          ].map(([k, v]) => (
            <div key={k as string}>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">{k} ekskl. moms</p>
              <p className="text-base font-semibold tabular-nums text-[#14244b]">{formatDkk(v as number)}</p>
            </div>
          ))}
        </div>
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          {isDemo ? "DEMO: Virksomheden, researchen og priserne er fiktive." : "Bemærk: Priserne i platformens V1 er fiktive demopriser."}
        </p>

        <Section n={1} title="Introduktion"><Paragraphs text={c.introduction} /></Section>
        <Section n={2} title="Virksomhedens situation"><Paragraphs text={c.situation} /></Section>
        <Section n={3} title="Identificerede muligheder"><Paragraphs text={c.opportunities} /></Section>
        <Section n={4} title="Anbefalede løsninger"><Paragraphs text={c.solutions} /></Section>
        <Section n={5} title="Konkrete leverancer">
          <div className="space-y-3">
            {version.lineItems.map((item) => (
              <div key={item.id}>
                <p className="font-semibold text-[#14244b]">{item.name}</p>
                <ul className="ml-4 list-disc">
                  {item.deliverables.map((d) => <li key={d}>{d}</li>)}
                  {item.addOns.map((a) => <li key={a.id}>Tilvalg: {a.name}</li>)}
                </ul>
                <p className="text-xs text-slate-500">Estimeret implementeringstid: {item.estimatedWeeks.min}–{item.estimatedWeeks.max} uger</p>
              </div>
            ))}
          </div>
        </Section>
        <Section n={6} title="Implementeringsplan"><Paragraphs text={c.implementationPlan} /></Section>
        <Section n={7} title="Prisoversigt">
          <table className="w-full text-[13px]" data-testid="preview-price-table">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <th className="py-1.5 font-semibold">Service</th>
                <th className="py-1.5 text-right font-semibold">Engang/implementering</th>
                <th className="py-1.5 text-right font-semibold">Pr. måned</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {version.lineItems.map((item) => {
                const t = totals.lines.find((l) => l.id === item.id)!;
                return (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2">
                      {item.name}
                      {item.kind === "one_time" && <span className="text-slate-500"> (engangsydelse)</span>}
                      {item.quantity > 1 && ` (${item.quantity} stk.)`}
                      {item.addOns.length > 0 && <span className="text-slate-500"> + {item.addOns.map((a) => a.name).join(", ")}</span>}
                    </td>
                    <td className="py-1.5 text-right">{formatDkk(t.implementation)}</td>
                    <td className="py-1.5 text-right">{formatDkk(t.monthly)}</td>
                  </tr>
                );
              })}
              <tr className="font-semibold">
                <td className="pt-2">Subtotal</td>
                <td className="pt-2 text-right">{formatDkk(totals.implementation.subtotal)}</td>
                <td className="pt-2 text-right">{formatDkk(totals.monthly.subtotal)}</td>
              </tr>
              {(totals.implementation.discount > 0 || totals.monthly.discount > 0) && (
                <tr className="text-emerald-700">
                  <td>
                    Rabat{version.discount.label ? ` — ${version.discount.label}` : ""}
                    {version.discount.kind === "percent" ? ` (${formatPercent(version.discount.value)})` : ""}
                  </td>
                  <td className="text-right">−{formatDkk(totals.implementation.discount)}</td>
                  <td className="text-right">−{formatDkk(totals.monthly.discount)}</td>
                </tr>
              )}
              <tr className="font-semibold">
                <td>I alt ekskl. moms</td>
                <td className="text-right" data-testid="preview-impl-excl">{formatDkk(totals.implementation.exclVat)}</td>
                <td className="text-right" data-testid="preview-monthly-excl">{formatDkk(totals.monthly.exclVat)}</td>
              </tr>
              <tr className="text-slate-500">
                <td>Moms ({formatPercent(version.vatRate * 100)})</td>
                <td className="text-right">{formatDkk(totals.implementation.vat)}</td>
                <td className="text-right">{formatDkk(totals.monthly.vat)}</td>
              </tr>
              <tr className="border-t border-slate-200 font-semibold">
                <td className="pt-1.5">I alt inkl. moms</td>
                <td className="pt-1.5 text-right">{formatDkk(totals.implementation.inclVat)}</td>
                <td className="pt-1.5 text-right">{formatDkk(totals.monthly.inclVat)}</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-3 flex items-end justify-between rounded-lg bg-blue-50 px-4 py-3">
            <div>
              <p className="font-semibold text-[#14244b]">Samlet pris for første år</p>
              <p className="text-xs text-slate-500">
                Implementering {formatDkk(totals.firstYear.implementationPart)} + 12 × {formatDkk(totals.monthly.exclVat)}
              </p>
            </div>
            <div className="text-right tabular-nums">
              <p className="font-semibold text-[#14244b]" data-testid="preview-first-year-excl">{formatDkk(totals.firstYear.exclVat)} ekskl. moms</p>
              <p className="text-xs text-slate-500" data-testid="preview-first-year-incl">{formatDkk(totals.firstYear.inclVat)} inkl. moms</p>
            </div>
          </div>
        </Section>
        <Section n={8} title="Forventede fordele"><Paragraphs text={c.benefits} /></Section>
        <Section n={9} title="Forudsætninger og forbehold"><Paragraphs text={c.assumptions || "Forudsætninger afklares i fællesskab."} /></Section>
        <Section n={10} title="Vilkår">
          <Paragraphs text={c.terms} />
          {version.specialTerms.trim() && (
            <div className="mt-3">
              <p className="font-semibold text-[#14244b]">Særlige vilkår</p>
              <Paragraphs text={version.specialTerms} />
            </div>
          )}
        </Section>
        <Section n={11} title="Næste skridt"><Paragraphs text={c.nextSteps} /></Section>
      </div>
    </div>
  );
}
