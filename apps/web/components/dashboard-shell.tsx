import { DashboardNav, DataBasis, EmptyDashboard, FilterBar, type DashboardData } from "@agency/dashboard";
import { ModeBadge, PageHeader } from "@agency/ui";

/** Fælles ramme for Dashboardets seks områder: overskrift, undernavigation, globale filtre og datagrundlag. */
export function DashboardShell({ title, description, data, error, children, after }: { title: string; description: string; data: DashboardData; error: string | null; children: React.ReactNode; after?: React.ReactNode }) {
  return (
    <>
      <PageHeader eyebrow="Modul 5 · Executive Command Center" title={title} badges={<ModeBadge mode={data.mode} />} description={description} />
      <DashboardNav actionCount={data.actions.length} />
      <div className="space-y-6">
        <DataBasis data={data} />
        <FilterBar data={data} error={error}>
          {data.basis.empty ? <EmptyDashboard mode={data.mode} /> : children}
        </FilterBar>
        {/* Fast plads (uanset datastatus), så panelets tilstand bevares ved genindlæsning. */}
        {after}
      </div>
    </>
  );
}
