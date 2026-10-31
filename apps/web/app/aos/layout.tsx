import { getSettings } from "@agency/core/server";
import { AosNav } from "@agency/aos";
import { listApprovals } from "@agency/orchestrator/server";

export const dynamic = "force-dynamic";

/** AOS bruger et mørkt kontrolcenter-tema (se `[data-theme-scope="aos"]` i globals.css). */
export default async function AosLayout({ children }: { children: React.ReactNode }) {
  const { mode } = await getSettings();
  const pending = await listApprovals({ status: "pending", mode });
  return (
    <div data-theme-scope="aos">
      <AosNav pendingApprovals={pending.length} />
      {children}
    </div>
  );
}
