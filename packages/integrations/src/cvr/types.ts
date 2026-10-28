import type { CompanyInput } from "@agency/core/server";

/** Normaliseret registerresultat, uafhængigt af datakilde. */
export type CvrRecord = Omit<CompanyInput, "mode">;

export interface CvrProvider {
  readonly key: "cvr.dev" | "virk.dk";
  readonly name: string;
  isConfigured(): boolean;
  /** Kaster AppError("upstream_not_found") hvis CVR-nummeret ikke findes. */
  lookup(cvr: string): Promise<CvrRecord>;
}
