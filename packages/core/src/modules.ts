import type { ModuleKey } from "./events";

export type ModuleStatus = "active" | "pending";

export interface ModuleDescriptor {
  key: Exclude<ModuleKey, "platform">;
  name: string;
  route: string;
  status: ModuleStatus;
  /** Navn på Lucide-ikon (opløses i UI-laget). */
  icon: "search" | "file-text" | "factory" | "users" | "layout-dashboard";
  description: string;
}

/** Modulregister — én kilde til navigation, status og dokumentation. */
export const MODULES: readonly ModuleDescriptor[] = [
  {
    key: "research",
    name: "Research",
    route: "/research",
    status: "active",
    icon: "search",
    description: "Virksomhedsresearch, AI-analyse og serviceanbefalinger.",
  },
  {
    key: "quotes",
    name: "Tilbud",
    route: "/quotes",
    status: "active",
    icon: "file-text",
    description: "Servicevalg, prissætning, tilbudstekst og PDF.",
  },
  {
    key: "production",
    name: "Produktion & Levering",
    route: "/production",
    status: "pending",
    icon: "factory",
    description: "Udvikling, implementering, levering og vedligeholdelse af kundeløsninger.",
  },
  {
    key: "crm",
    name: "CRM",
    route: "/crm",
    status: "pending",
    icon: "users",
    description: "Kunder, kontaktpersoner, pipeline og opfølgning.",
  },
  {
    key: "dashboard",
    name: "Dashboard",
    route: "/dashboard",
    status: "pending",
    icon: "layout-dashboard",
    description: "KPI'er, omsætning, projekter og performance.",
  },
] as const;

export const PENDING_MODULE_MESSAGE = "Afventer — modulet udvikles i en kommende version.";

export function getModule(key: ModuleDescriptor["key"]): ModuleDescriptor {
  const mod = MODULES.find((m) => m.key === key);
  if (!mod) throw new Error(`Ukendt modul: ${key}`);
  return mod;
}
