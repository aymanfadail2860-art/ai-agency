"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MODULES } from "@agency/core";
import { cn } from "@agency/ui";
import { Bot, Factory, FileText, LayoutDashboard, Search, Settings, Sparkles, Users } from "lucide-react";

const ICONS = { search: Search, "file-text": FileText, factory: Factory, users: Users, "layout-dashboard": LayoutDashboard, bot: Bot };

export function Sidebar({ mode }: { mode: "demo" | "live" }) {
  const pathname = usePathname();
  const isActive = (route: string) => pathname === route || pathname.startsWith(`${route}/`);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex h-16 items-center gap-2.5 px-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
          <Sparkles className="h-4 w-4 text-blue-300" />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight">AI Agency</p>
          <p className="text-[11px] text-sidebar-muted">Intern platform · V4</p>
        </div>
      </div>
      <nav aria-label="Moduler" className="flex-1 space-y-1 px-3 py-4">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-muted">Moduler</p>
        {MODULES.map((m, i) => {
          const Icon = ICONS[m.icon];
          const active = isActive(m.route);
          return (
            <Link
              key={m.key}
              href={m.route}
              data-testid={`nav-${m.key}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active ? "bg-white/10 text-white" : "text-sidebar-foreground/80 hover:bg-white/5 hover:text-white",
              )}
            >
              <span className="w-4 text-[10px] tabular-nums text-sidebar-muted">{i + 1}</span>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 leading-tight">{m.name}</span>
              {m.status === "active" ? (
                <span className="rounded-full bg-emerald-400/15 px-1.5 py-px text-[10px] font-medium text-emerald-300">Aktiv</span>
              ) : (
                <span className="rounded-full bg-white/10 px-1.5 py-px text-[10px] font-medium text-sidebar-muted">Afventer</span>
              )}
            </Link>
          );
        })}
        <div className="my-3 h-px bg-white/10" />
        <Link
          href="/settings"
          data-testid="nav-settings"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            isActive("/settings") ? "bg-white/10 text-white" : "text-sidebar-foreground/80 hover:bg-white/5 hover:text-white",
          )}
        >
          <span className="w-4" />
          <Settings className="h-4 w-4" />
          <span>Indstillinger</span>
        </Link>
      </nav>
      <div className="m-3 rounded-lg bg-white/5 p-3 text-xs">
        <p className="text-sidebar-muted">Tilstand</p>
        <p className="mt-0.5 font-medium" data-testid="sidebar-mode">
          {mode === "demo" ? "Demo Mode — fiktive data" : "Live Mode — rigtige integrationer"}
        </p>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Moduler (mobil)" className="flex gap-1 overflow-x-auto border-b border-border bg-card px-3 py-2 lg:hidden">
      {[...MODULES.map((m) => ({ route: m.route, name: m.name })), { route: "/settings", name: "Indstillinger" }].map((m) => (
        <Link key={m.route} href={m.route} className={cn("whitespace-nowrap rounded-md px-3 py-1.5 text-sm", pathname.startsWith(m.route) ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
          {m.name}
        </Link>
      ))}
    </nav>
  );
}
