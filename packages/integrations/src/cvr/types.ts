import type { CompanyInput } from "@agency/core/server";
import type { Establishment } from "@agency/core";

/** Normaliseret registerresultat, uafhængigt af datakilde. */
export type CvrRecord = Omit<CompanyInput, "mode">;

/** V2: opslag inkl. binavne (mulige brands) og aktive P-numre. */
export interface CvrLookup {
  record: CvrRecord;
  /** Aktive binavne — kandidater til brands, aldrig automatisk bekræftet. */
  secondaryNames: string[];
  activePNumbers: string[];
  totalPNumbers: number;
}

export type EstablishmentRecord = Omit<Establishment, "id" | "legalEntityId" | "mode" | "createdAt" | "updatedAt">;

export interface CvrSearchHit {
  cvr: string;
  name: string;
  status: string | null;
  city: string | null;
  industry: string | null;
}

export interface CvrProvider {
  readonly key: "cvr.dev" | "virk.dk";
  readonly name: string;
  isConfigured(): boolean;
  /** Kaster AppError("upstream_not_found") hvis CVR-nummeret ikke findes. */
  lookup(cvr: string): Promise<CvrLookup>;
  /** Detaljer for et P-nummer (arbejdssted). Returnerer null hvis ukendt. */
  establishment(pNumber: string): Promise<EstablishmentRecord | null>;
  /** Navnesøgning — resultater er kun FORSLAG og skal bekræftes af brugeren. */
  searchByName(name: string, limit?: number): Promise<CvrSearchHit[]>;
}
