import { integrationConfig } from "../config";
import { createCvrDevProvider } from "./cvrdev";
import { createVirkProvider } from "./virk";
import type { CvrProvider } from "./types";

export * from "./types";
export { mapVrvirksomhed, mapVrvirksomhedLookup, mapProduktionsenhed, mapSearchHit } from "./mapper";
export { createCvrDevProvider, createVirkProvider };

/** Vælger CVR-adapter ud fra CVR_PROVIDER (standard: cvrdev). */
export function getCvrProvider(): CvrProvider {
  return integrationConfig.cvrProvider() === "virk" ? createVirkProvider() : createCvrDevProvider();
}
