import type { Metadata } from "next";
import Link from "next/link";
import { AGENT_STATUS_LABELS } from "@agency/orchestrator";
import { getAgentStates, getApproval } from "@agency/orchestrator/server";
import { ProjectDetail, PriorityBadge, ProjectStatusBadge, SimulatedBadge, getServiceBaseDefinition } from "@agency/production";
import { blockersFor, getFinance, getProject, jobsForProject, summarize } from "@agency/production/server";
import { ModeBadge, PageHeader } from "@agency/ui";
import { findAccountByBrand } from "@agency/crm/server";
import { orNotFound } from "@/lib/page";
import { ensureProductionWiring } from "@/lib/production";

export const metadata: Metadata = { title: "Produktionsprojekt" };
export const dynamic = "force-dynamic";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ tab?: string }> }) {
  ensureProductionWiring();
  const { projectId } = await params;
  const bundle = await orNotFound(getProject(projectId));
  const { project, tasks } = bundle;
  const [finance, jobs, states, approval] = await Promise.all([
    getFinance(bundle),
    jobsForProject(project),
    getAgentStates(project.mode),
    project.pendingGate ? getApproval(project.pendingGate.approvalId).catch(() => null) : Promise.resolve(null),
  ]);
  const crmAccount = project.customer.brandId ? await findAccountByBrand(project.customer.brandId) : null;
  const base = getServiceBaseDefinition(project.serviceBaseKey);
  return (
    <>
      <PageHeader
        eyebrow={`Produktion · ${project.customer.name}`}
        title={project.name}
        badges={
          <>
            <ModeBadge mode={project.mode} />
            <ProjectStatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
            {project.isDemo && <SimulatedBadge label="Demoprojekt" />}
          </>
        }
        description={
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/production" className="text-accent hover:underline">
              ← Produktionsoversigt
            </Link>
            {crmAccount && (
              <Link href={`/crm/companies/${crmAccount.id}?tab=projects`} className="text-accent hover:underline" data-testid="project-crm-link">
                Kundeprofil i CRM →
              </Link>
            )}
          </span>
        }
      />
      <ProjectDetail
        bundle={bundle}
        finance={finance}
        jobs={jobs}
        agents={states.map((s) => ({ id: s.agent.id, key: s.agent.key, name: s.agent.name, role: s.agent.role, color: s.agent.color, enabled: s.agent.enabled, status: s.status, statusLabel: AGENT_STATUS_LABELS[s.status] }))}
        serviceBase={base ? { key: base.key, name: base.name, version: base.version } : null}
        pendingApproval={approval && approval.status === "pending" ? { id: approval.id, title: approval.title, reasons: approval.reasons } : null}
        blockers={blockersFor(project, tasks)}
        mode={project.mode}
        overdue={summarize(project, tasks).overdue}
        initialTab={(await searchParams).tab}
      />
    </>
  );
}
