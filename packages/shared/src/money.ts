/**
 * Beløb lagres i kroner (DKK) som tal med op til 2 decimaler.
 * Alle beregninger foretages i hele øre for at undgå afrundingsfejl.
 */
export function toOre(kr: number): number {
  return Math.round(kr * 100);
}

export function fromOre(ore: number): number {
  return Math.round(ore) / 100;
}

const dkk = new Intl.NumberFormat("da-DK", {
  style: "currency",
  currency: "DKK",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dkkWhole = new Intl.NumberFormat("da-DK", {
  style: "currency",
  currency: "DKK",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Formaterer et kronebeløb, fx `12.500,00 kr.` */
export function formatDkk(kr: number, opts: { whole?: boolean } = {}): string {
  const value = Number.isFinite(kr) ? kr : 0;
  return (opts.whole ? dkkWhole : dkk).format(value).replace(/ /g, " ");
}

export function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("da-DK", { maximumFractionDigits: 2 }).format(value)} %`;
}
