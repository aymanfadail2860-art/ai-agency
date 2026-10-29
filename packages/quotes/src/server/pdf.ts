import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import type { Quote, QuoteVersion } from "@agency/core";
import { formatDate, formatDkk, formatPercent } from "@agency/shared";
import { calculateQuoteTotals } from "../pricing";
import { quoteRecipient } from "../recipient";

/**
 * PDF-EKSPORT
 * -----------
 * Genererer et professionelt A4-tilbud direkte fra den aktuelle (redigerede)
 * version. Bruger PDF-standardskrifttyper (WinAnsi), så der ikke kræves
 * fontfiler; tegn uden for WinAnsi erstattes.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 56;
const NAVY = rgb(0.078, 0.141, 0.294);
const BLUE = rgb(0.18, 0.43, 0.92);
const INK = rgb(0.12, 0.14, 0.2);
const MUTED = rgb(0.42, 0.45, 0.52);
const LINE = rgb(0.87, 0.88, 0.91);
const AMBER = rgb(0.72, 0.47, 0.05);
const AMBER_BG = rgb(1, 0.96, 0.86);

const WINANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const REPLACEMENTS: Record<string, string> = { "→": "->", "←": "<-", "≈": "~", "≤": "<=", "≥": ">=", "✓": "v", " ": " ", " ": " " };

export function toWinAnsi(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (REPLACEMENTS[ch]) out += REPLACEMENTS[ch];
    else if (ch === "\n" || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WINANSI_EXTRA.has(ch)) out += ch;
    else if (code === 0x09) out += "  ";
    else if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) continue;
    else out += "?";
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of toWinAnsi(text).split("\n")) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    const indent = paragraph.match(/^\s*/)?.[0] ?? "";
    let line = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : `${indent}${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        // Meget lange ord deles hårdt.
        let rest = `${indent}${word}`;
        while (font.widthOfTextAtSize(rest, size) > maxWidth) {
          let cut = rest.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
          lines.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

class Writer {
  page!: PDFPage;
  y = 0;
  readonly pages: PDFPage[] = [];
  constructor(
    readonly doc: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
    readonly isDemo: boolean,
  ) {}

  addPage() {
    this.page = this.doc.addPage([A4.width, A4.height]);
    this.pages.push(this.page);
    this.y = A4.height - MARGIN;
    if (this.isDemo) {
      this.page.drawText("DEMO", { x: 150, y: 330, size: 140, font: this.bold, color: rgb(0.95, 0.9, 0.78), opacity: 0.35, rotate: degrees(35) });
    }
  }

  ensure(height: number) {
    if (this.y - height < MARGIN + 30) this.addPage();
  }

  text(text: string, opts: { size?: number; font?: PDFFont; color?: RGB; x?: number; width?: number; lineGap?: number } = {}) {
    const size = opts.size ?? 10.5;
    const font = opts.font ?? this.regular;
    const x = opts.x ?? MARGIN;
    const width = opts.width ?? A4.width - x - MARGIN;
    const leading = size * (opts.lineGap ?? 1.45);
    for (const line of wrap(text, font, size, width)) {
      this.ensure(leading);
      if (line) this.page.drawText(line, { x, y: this.y - size, size, font, color: opts.color ?? INK });
      this.y -= leading;
    }
  }

  heading(number: number, title: string) {
    this.ensure(60);
    this.y -= 14;
    this.page.drawText(toWinAnsi(`${String(number).padStart(2, "0")}`), { x: MARGIN, y: this.y - 13, size: 10, font: this.bold, color: BLUE });
    this.page.drawText(toWinAnsi(title), { x: MARGIN + 26, y: this.y - 14, size: 14, font: this.bold, color: NAVY });
    this.y -= 24;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: A4.width - MARGIN, y: this.y }, thickness: 0.6, color: LINE });
    this.y -= 12;
  }

  gap(h = 8) {
    this.y -= h;
  }
}

export async function renderQuotePdf(quote: Quote, version: QuoteVersion): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(toWinAnsi(`${version.content.title} — ${quote.number} v${version.versionNumber}`));
  doc.setAuthor(toWinAnsi(process.env.AGENCY_NAME ?? "AI Agency"));
  const recipient = quoteRecipient(quote);
  doc.setSubject(toWinAnsi(`Tilbud til ${recipient.displayName}`));
  doc.setCreator("AI Agency Platform V1");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const isDemo = quote.mode === "demo";
  const w = new Writer(doc, regular, bold, isDemo);
  const totals = calculateQuoteTotals(version);
  const agency = process.env.AGENCY_NAME ?? "AI Agency";
  const issued = version.updatedAt;
  const validUntil = new Date(new Date(issued).getTime() + version.validityDays * 86_400_000).toISOString();

  /* ---------------------------- 1. Forside ---------------------------- */
  w.addPage();
  const cover = w.page;
  cover.drawRectangle({ x: 0, y: A4.height - 330, width: A4.width, height: 330, color: NAVY });
  cover.drawText(toWinAnsi(agency.toUpperCase()), { x: MARGIN, y: A4.height - 70, size: 10, font: bold, color: rgb(0.75, 0.82, 0.95) });
  cover.drawText("TILBUD", { x: MARGIN, y: A4.height - 150, size: 12, font: bold, color: rgb(0.55, 0.7, 1) });
  let ty = A4.height - 180;
  for (const line of wrap(version.content.title, bold, 26, A4.width - 2 * MARGIN)) {
    cover.drawText(line, { x: MARGIN, y: ty, size: 26, font: bold, color: rgb(1, 1, 1) });
    ty -= 34;
  }
  cover.drawText(toWinAnsi(recipient.displayName), { x: MARGIN, y: A4.height - 300, size: 13, font: regular, color: rgb(0.85, 0.89, 0.97) });

  const meta: Array<[string, string]> = [
    ["Kunde", recipient.displayName],
    ["Juridisk enhed", recipient.legalName ?? "Ikke bekræftet"],
    ["CVR", recipient.cvr ? (isDemo ? `${recipient.cvr} (fiktivt)` : recipient.cvr) : "—"],
    ["Adresse", recipient.address ?? recipient.website ?? "—"],
    ["Tilbudsnummer", `${quote.number} · version ${version.versionNumber}`],
    ["Dato", formatDate(issued)],
    ["Gyldigt til", formatDate(validUntil)],
  ];
  let my = A4.height - 390;
  for (const [label, value] of meta) {
    cover.drawText(toWinAnsi(label.toUpperCase()), { x: MARGIN, y: my, size: 8, font: bold, color: MUTED });
    cover.drawText(toWinAnsi(value), { x: MARGIN + 120, y: my, size: 11, font: regular, color: INK });
    my -= 26;
  }
  const boxY = 150;
  cover.drawRectangle({ x: MARGIN, y: boxY, width: A4.width - 2 * MARGIN, height: 92, color: rgb(0.96, 0.97, 0.99), borderColor: LINE, borderWidth: 0.6 });
  const kpis: Array<[string, string]> = [
    ["Implementering ekskl. moms", formatDkk(totals.implementation.exclVat)],
    ["Pr. måned ekskl. moms", formatDkk(totals.monthly.exclVat)],
    ["Første år ekskl. moms", formatDkk(totals.firstYear.exclVat)],
  ];
  kpis.forEach(([label, value], i) => {
    const x = MARGIN + 18 + i * ((A4.width - 2 * MARGIN - 36) / 3);
    cover.drawText(toWinAnsi(label), { x, y: boxY + 60, size: 8, font: regular, color: MUTED });
    cover.drawText(toWinAnsi(value), { x, y: boxY + 34, size: 14, font: bold, color: NAVY });
  });
  const notice = isDemo
    ? "DEMO: Virksomheden, researchen og priserne i dette tilbud er fiktive."
    : "Bemærk: Priserne i platformens V1 er fiktive demopriser.";
  cover.drawRectangle({ x: MARGIN, y: 96, width: A4.width - 2 * MARGIN, height: 32, color: AMBER_BG });
  cover.drawText(toWinAnsi(notice), { x: MARGIN + 12, y: 108, size: 9.5, font: bold, color: AMBER });

  /* -------------------------- 2.–11. Indhold -------------------------- */
  w.addPage();
  const c = version.content;
  w.text(toWinAnsi(recipient.showLegalName ? `${recipient.displayName} · ${recipient.legalName}` : recipient.displayName), { size: 9, font: bold, color: MUTED });
  w.gap(4);
  const sections: Array<[string, () => void]> = [
    ["Introduktion", () => w.text(c.introduction)],
    ["Virksomhedens situation", () => w.text(c.situation)],
    ["Identificerede muligheder", () => w.text(c.opportunities)],
    ["Anbefalede løsninger", () => w.text(c.solutions)],
    [
      "Konkrete leverancer",
      () => {
        for (const item of version.lineItems) {
          w.ensure(40);
          w.text(item.name, { font: bold, size: 11, color: NAVY });
          const list = [...item.deliverables, ...item.addOns.map((a) => `Tilvalg: ${a.name} — ${a.description}`)];
          w.text(list.length ? list.map((d) => `• ${d}`).join("\n") : "Leverancer afklares.", { x: MARGIN + 10 });
          w.text(`Estimeret implementeringstid: ${item.estimatedWeeks.min}–${item.estimatedWeeks.max} uger`, { size: 9, color: MUTED, x: MARGIN + 10 });
          w.gap(6);
        }
      },
    ],
    ["Implementeringsplan", () => w.text(c.implementationPlan)],
    ["Prisoversigt", () => drawPriceTable(w, quote, version, totals)],
    ["Forventede fordele", () => w.text(c.benefits)],
    ["Forudsætninger og forbehold", () => w.text(c.assumptions || "Forudsætninger afklares i fællesskab.")],
    [
      "Vilkår",
      () => {
        w.text(c.terms);
        if (version.specialTerms.trim()) {
          w.gap(6);
          w.text("Særlige vilkår", { font: bold, color: NAVY });
          w.text(version.specialTerms);
        }
      },
    ],
    ["Næste skridt", () => w.text(c.nextSteps)],
  ];
  sections.forEach(([title, render], i) => {
    w.heading(i + 1, title);
    render();
  });

  /* ------------------------------ Sidefod ------------------------------ */
  w.pages.forEach((p, i) => {
    if (i === 0) return;
    p.drawLine({ start: { x: MARGIN, y: 40 }, end: { x: A4.width - MARGIN, y: 40 }, thickness: 0.5, color: LINE });
    p.drawText(toWinAnsi(`${agency} · Tilbud ${quote.number} · version ${version.versionNumber}${isDemo ? " · DEMO" : ""}`), { x: MARGIN, y: 26, size: 8, font: regular, color: MUTED });
    const label = `Side ${i + 1} af ${w.pages.length}`;
    p.drawText(label, { x: A4.width - MARGIN - regular.widthOfTextAtSize(label, 8), y: 26, size: 8, font: regular, color: MUTED });
  });

  return doc.save();
}

function drawPriceTable(w: Writer, quote: Quote, version: QuoteVersion, totals: ReturnType<typeof calculateQuoteTotals>) {
  const colImpl = A4.width - MARGIN - 190;
  const colMonth = A4.width - MARGIN - 80;
  const right = (text: string, xRight: number, font = w.regular, size = 10, color: RGB = INK) => {
    const t = toWinAnsi(text);
    w.page.drawText(t, { x: xRight - font.widthOfTextAtSize(t, size), y: w.y - size, size, font, color });
  };
  const row = (label: string, impl: string, month: string, opts: { bold?: boolean; muted?: boolean; line?: boolean } = {}) => {
    const font = opts.bold ? w.bold : w.regular;
    const color = opts.muted ? MUTED : INK;
    const labelLines = wrap(label, font, 10, colImpl - MARGIN - 110);
    const height = Math.max(1, labelLines.length) * 14 + 6;
    w.ensure(height);
    labelLines.forEach((l, i) => w.page.drawText(l, { x: MARGIN, y: w.y - 10 - i * 14, size: 10, font, color }));
    right(impl, colImpl + 80, font, 10, color);
    right(month, colMonth + 80, font, 10, color);
    w.y -= height;
    if (opts.line) w.page.drawLine({ start: { x: MARGIN, y: w.y + 2 }, end: { x: A4.width - MARGIN, y: w.y + 2 }, thickness: 0.5, color: LINE });
  };

  w.ensure(30);
  w.page.drawRectangle({ x: MARGIN - 6, y: w.y - 20, width: A4.width - 2 * MARGIN + 12, height: 22, color: rgb(0.95, 0.96, 0.98) });
  w.page.drawText("Service", { x: MARGIN, y: w.y - 14, size: 9, font: w.bold, color: MUTED });
  right("Engang/implementering", colImpl + 80, w.bold, 9, MUTED);
  right("Pr. måned", colMonth + 80, w.bold, 9, MUTED);
  w.y -= 28;

  for (const item of version.lineItems) {
    const line = totals.lines.find((l) => l.id === item.id)!;
    const label = `${item.name}${item.kind === "one_time" ? " (engangsydelse)" : ""}${item.quantity > 1 ? ` (${item.quantity} stk.)` : ""}${item.addOns.length ? ` + ${item.addOns.map((a) => a.name).join(", ")}` : ""}`;
    row(label, formatDkk(line.implementation), formatDkk(line.monthly), { line: true });
  }
  row("Subtotal", formatDkk(totals.implementation.subtotal), formatDkk(totals.monthly.subtotal), { bold: true });
  if (totals.implementation.discount > 0 || totals.monthly.discount > 0) {
    const d = version.discount;
    const label = `Rabat${d.label ? ` — ${d.label}` : ""}${d.kind === "percent" ? ` (${formatPercent(d.value)})` : ""}`;
    row(label, `-${formatDkk(totals.implementation.discount)}`, `-${formatDkk(totals.monthly.discount)}`);
  }
  row("I alt ekskl. moms", formatDkk(totals.implementation.exclVat), formatDkk(totals.monthly.exclVat), { bold: true });
  row(`Moms (${formatPercent(version.vatRate * 100)})`, formatDkk(totals.implementation.vat), formatDkk(totals.monthly.vat), { muted: true });
  row("I alt inkl. moms", formatDkk(totals.implementation.inclVat), formatDkk(totals.monthly.inclVat), { bold: true, line: true });
  w.gap(10);

  w.ensure(70);
  w.page.drawRectangle({ x: MARGIN - 6, y: w.y - 58, width: A4.width - 2 * MARGIN + 12, height: 60, color: rgb(0.93, 0.95, 0.99) });
  w.page.drawText("Samlet pris for første år", { x: MARGIN, y: w.y - 16, size: 10, font: w.bold, color: NAVY });
  w.page.drawText(toWinAnsi(`Implementering ${formatDkk(totals.firstYear.implementationPart)} + 12 × ${formatDkk(totals.monthly.exclVat)}`), { x: MARGIN, y: w.y - 32, size: 9, font: w.regular, color: MUTED });
  right(`${formatDkk(totals.firstYear.exclVat)} ekskl. moms`, A4.width - MARGIN, w.bold, 11, NAVY);
  w.y -= 18;
  right(`${formatDkk(totals.firstYear.inclVat)} inkl. moms`, A4.width - MARGIN, w.regular, 10, MUTED);
  w.y -= 50;
  w.text(quote.mode === "demo" ? "Alle priser er fiktive demopriser (Demo Mode)." : "Priserne i platformens V1 er demopriser og skal kvalitetssikres før afsendelse.", { size: 8.5, color: AMBER });
}
