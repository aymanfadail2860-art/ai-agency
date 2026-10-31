"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@agency/ui";
import { Activity, BarChart3, Bot, Gauge, Building2, ListChecks, Plug, ShieldCheck } from "lucide-react";

const ITEMS = [
  { href: "/aos", label: "Command Center", Icon: Gauge, exact: true },
  { href: "/aos/office", label: "Agent Office", Icon: Building2 },
  { href: "/aos/agents", label: "Agent Library", Icon: Bot },
  { href: "/aos/jobs", label: "Job Center", Icon: ListChecks },
  { href: "/aos/activity", label: "Live Activity", Icon: Activity },
  { href: "/aos/approvals", label: "Godkendelser", Icon: ShieldCheck },
  { href: "/aos/performance", label: "Performance & Cost", Icon: BarChart3 },
  { href: "/aos/integrations", label: "Integrationer", Icon: Plug },
];

export function AosNav({ pendingApprovals = 0 }: { pendingApprovals?: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="AOS" className="-mx-1 mb-6 flex gap-x-1 overflow-x-auto border-b border-border pb-px xl:flex-wrap">
      {ITEMS.map(({ href, label, Icon, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            data-testid={`aos-nav-${href.split("/")[2] ?? "home"}`}
            className={cn(
              "flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors",
              active ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            {href === "/aos/approvals" && pendingApprovals > 0 && (
              <span className="rounded-full bg-warning/20 px-1.5 text-[10px] font-semibold text-warning-foreground">{pendingApprovals}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
