"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CalendarClock, Kanban, LayoutDashboard } from "lucide-react";

const LINKS = [
  { href: "/crm", label: "Overblik", icon: LayoutDashboard, exact: true },
  { href: "/crm/companies", label: "Virksomheder", icon: Building2 },
  { href: "/crm/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/crm/activities", label: "Aktiviteter", icon: CalendarClock },
];

/** Undernavigation for CRM-modulet. */
export function CrmNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="CRM" className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-border px-1" data-testid="crm-nav">
      {LINKS.map((l) => {
        const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${active ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <l.icon className="h-4 w-4" /> {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
