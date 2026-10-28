import type { Company, ResearchSource } from "@agency/core";
import { formatAddress } from "@agency/core/server";
import { newId, nowIso, truncate } from "@agency/shared";
import type { ParsedPage } from "./html";

export function registrySource(company: Company): ResearchSource {
  const lines = [
    `Navn: ${company.name}`,
    `CVR: ${company.cvr}`,
    `Adresse: ${formatAddress(company) ?? "ikke oplyst"}`,
    `Branche: ${company.industry ? `${company.industry.text} (${company.industry.code ?? "-"})` : "ikke oplyst"}`,
    `Virksomhedsform: ${company.companyForm?.text ?? "ikke oplyst"}`,
    `Status: ${company.status ?? "ikke oplyst"}`,
    `Stiftet: ${company.foundedAt ?? "ikke oplyst"}`,
    `Ansatte: ${company.employees?.count ?? company.employees?.interval ?? "ikke oplyst"}`,
    `Hjemmeside: ${company.contact.website ?? "ikke registreret"}`,
    `Reklamebeskyttet: ${company.adProtected ? "ja" : "nej"}`,
  ];
  const isDemo = company.mode === "demo";
  return {
    id: newId("researchSource"),
    kind: "registry",
    title: isDemo ? "Fiktive registeroplysninger (Demo)" : `CVR-registret via ${company.registrySource.provider}`,
    url: company.registrySource.reference,
    provider: company.registrySource.provider,
    retrievedAt: company.registrySource.retrievedAt,
    excerpt: lines.join("\n"),
    isDemo,
  };
}

export function pageSource(page: ParsedPage, kind: "website" | "competitor", retrievedAt: string, isDemo: boolean, provider: string): ResearchSource {
  const excerpt = [
    page.title && `Titel: ${page.title}`,
    page.description && `Beskrivelse: ${page.description}`,
    page.headings.length > 0 && `Overskrifter: ${page.headings.slice(0, 12).join(" | ")}`,
    `Tekst: ${truncate(page.text, 2400)}`,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    id: newId("researchSource"),
    kind,
    title: page.title || new URL(page.url).hostname,
    url: page.url,
    provider,
    retrievedAt,
    excerpt: truncate(excerpt, 3800),
    isDemo,
  };
}

export function textSource(input: { kind: ResearchSource["kind"]; title: string; url: string; text: string; provider: string; isDemo: boolean }): ResearchSource {
  return {
    id: newId("researchSource"),
    kind: input.kind,
    title: truncate(input.title, 200),
    url: input.url,
    provider: input.provider,
    retrievedAt: nowIso(),
    excerpt: truncate(input.text, 1500),
    isDemo: input.isDemo,
  };
}
