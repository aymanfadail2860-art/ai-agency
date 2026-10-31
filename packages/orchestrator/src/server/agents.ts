import { z } from "zod";
import { createCollectionStore, getSettings, publishEvent } from "@agency/core/server";
import { AppError, nowIso } from "@agency/shared";
import { AGENT_DEFINITIONS, type AgentDefinition } from "../agent-definitions";
import { AgentSchema, AgentVersionSchema, EngineKindSchema, type Agent, type AgentVersion } from "../models";
import { TASK_TYPES, TOOL_KEYS } from "../task-types";
import { createApproval } from "./approvals";

/**
 * AGENT MANAGER
 * -------------
 * Agenter og deres versioner. Versioner er uforanderlige: en ændring giver en
 * ny version, som først bliver aktiv efter godkendelse. Grundversionerne
 * indlæses idempotent fra repositoriet med deterministiske id'er, så samtidige
 * serverinstanser ikke laver dubletter.
 */
const agentStore = createCollectionStore("aos", "agents", AgentSchema);
const versionStore = createCollectionStore("aos", "agent-versions", AgentVersionSchema);

const agentId = (key: string) => `agt_${key}`;
const versionId = (key: string, version: number) => `agv_${key}_v${version}`;

function versionFromDefinition(def: AgentDefinition, status: AgentVersion["status"]): AgentVersion {
  return {
    id: versionId(def.key, def.version),
    agentId: agentId(def.key),
    version: def.version,
    description: def.description,
    specialty: def.specialty,
    instructions: def.instructions,
    allowedTools: [...def.allowedTools],
    engines: [...def.engines],
    taskTypes: [...def.taskTypes],
    source: "repository",
    status,
    changeNote: def.version === 1 ? "Grundversion fra repositoriet." : `Ny grundversion ${def.version} fra repositoriet.`,
    createdAt: nowIso(),
  };
}

async function seedDefinition(def: AgentDefinition): Promise<void> {
  const id = agentId(def.key);
  const existing = await agentStore.get(id);
  const now = nowIso();
  if (!existing) {
    await versionStore.upsert(versionFromDefinition(def, "active"));
    await agentStore.upsert({ id, key: def.key, name: def.name, role: def.role, zone: def.zone, color: def.color, enabled: true, activeVersion: def.version, createdAt: now, updatedAt: now });
    return;
  }
  if (await versionStore.get(versionId(def.key, def.version))) return;
  // Ny grundversion i repositoriet. Den aktiveres kun automatisk, hvis den aktive version også stammer fra repositoriet.
  const active = await versionStore.get(versionId(def.key, existing.activeVersion));
  const autoActivate = !active || active.source === "repository";
  await versionStore.upsert(versionFromDefinition(def, autoActivate ? "active" : "superseded"));
  if (autoActivate) {
    if (active) await versionStore.update(active.id, (v) => ({ ...v, status: "superseded" }));
    await agentStore.update(id, (a) => ({ ...a, activeVersion: def.version, updatedAt: now }));
  }
}

let seeded: Promise<void> | null = null;
export function ensureAgentsSeeded(): Promise<void> {
  seeded ??= (async () => {
    for (const def of AGENT_DEFINITIONS) await seedDefinition(def);
  })().catch((err) => {
    seeded = null;
    throw err;
  });
  return seeded;
}

export type AgentWithVersion = Agent & { version: AgentVersion };

export const NewAgentVersionSchema = z.object({
  description: z.string().trim().min(1).max(600),
  specialty: z.string().trim().min(1).max(300),
  instructions: z.string().trim().min(20, "Instruktionerne skal være mindst 20 tegn.").max(8000),
  allowedTools: z.array(z.string()).max(30).refine((tools) => tools.every((t) => TOOL_KEYS.includes(t)), "Ukendt værktøj."),
  engines: z.array(EngineKindSchema).min(1, "Vælg mindst én motor."),
  taskTypes: z.array(z.string()).max(30).refine((types) => types.every((t) => TASK_TYPES.some((d) => d.key === t)), "Ukendt opgavetype."),
  changeNote: z.string().trim().min(3, "Beskriv kort ændringen.").max(500),
});
export type NewAgentVersion = z.infer<typeof NewAgentVersionSchema>;

export const agentRegistry = {
  async list(): Promise<AgentWithVersion[]> {
    await ensureAgentsSeeded();
    const [agents, versions] = await Promise.all([agentStore.list(), versionStore.list()]);
    const order = AGENT_DEFINITIONS.map((d) => agentId(d.key));
    return agents
      .map((a) => ({ ...a, version: versions.find((v) => v.id === versionId(a.key, a.activeVersion))! }))
      .filter((a) => a.version)
      .sort((a, b) => (order.indexOf(a.id) + 1 || 999) - (order.indexOf(b.id) + 1 || 999));
  },

  async get(id: string): Promise<AgentWithVersion | null> {
    await ensureAgentsSeeded();
    const agent = await agentStore.get(id);
    if (!agent) return null;
    const version = await versionStore.get(versionId(agent.key, agent.activeVersion));
    return version ? { ...agent, version } : null;
  },

  async require(id: string): Promise<AgentWithVersion> {
    const agent = await this.get(id);
    if (!agent) throw new AppError("not_found", "Agenten blev ikke fundet.");
    return agent;
  },

  async resolveForTask(key: string): Promise<AgentWithVersion | null> {
    return this.get(agentId(key));
  },

  async versions(id: string): Promise<AgentVersion[]> {
    await ensureAgentsSeeded();
    return (await versionStore.list()).filter((v) => v.agentId === id).sort((a, b) => b.version - a.version);
  },

  async setEnabled(id: string, enabled: boolean): Promise<Agent> {
    const agent = await this.require(id);
    const updated = await agentStore.update(agent.id, (a) => ({ ...a, enabled, updatedAt: nowIso() }));
    return updated!;
  },

  /** Opretter en ny version (afventer godkendelse). Aktiv version ændres ikke. */
  async proposeVersion(id: string, raw: NewAgentVersion): Promise<{ version: AgentVersion; approvalId: string }> {
    const input = NewAgentVersionSchema.parse(raw);
    const agent = await this.require(id);
    const all = await this.versions(id);
    if (all.some((v) => v.status === "pending_approval")) throw new AppError("conflict", "Der findes allerede en version, der afventer godkendelse.");
    const next = Math.max(...all.map((v) => v.version)) + 1;
    const version = await versionStore.upsert({
      id: versionId(agent.key, next),
      agentId: agent.id,
      version: next,
      ...input,
      source: "platform",
      status: "pending_approval",
      createdAt: nowIso(),
    });
    const { mode } = await getSettings();
    const changedTools = input.allowedTools.filter((t) => !agent.version.allowedTools.includes(t));
    const approval = await createApproval({
      category: "agent_change",
      title: `Aktivér ${agent.name} v${next}`,
      description: input.changeNote,
      reasons: [
        "Ændring af en agents instruktioner, værktøjer eller motorer kræver godkendelse.",
        ...(changedTools.length ? [`Nye værktøjer: ${changedTools.join(", ")}.`] : []),
      ],
      mode,
      subject: { agentVersionId: version.id },
      estimatedCostUsd: null,
    });
    await publishEvent({ type: "agent.version.created", source: "aos", mode, subject: {}, payload: { agentId: agent.id, version: next } });
    return { version, approvalId: approval.id };
  },

  async decideVersion(versionIdValue: string, approved: boolean): Promise<void> {
    const version = await versionStore.get(versionIdValue);
    if (!version || version.status !== "pending_approval") return;
    if (!approved) {
      await versionStore.update(version.id, (v) => ({ ...v, status: "rejected" }));
      return;
    }
    const agent = await agentStore.get(version.agentId);
    if (!agent) return;
    const previous = await versionStore.get(versionId(agent.key, agent.activeVersion));
    if (previous) await versionStore.update(previous.id, (v) => ({ ...v, status: "superseded" }));
    await versionStore.update(version.id, (v) => ({ ...v, status: "active" }));
    await agentStore.update(agent.id, (a) => ({ ...a, activeVersion: version.version, updatedAt: nowIso() }));
  },
};
