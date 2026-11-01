import Link from "next/link";
import { redirect } from "next/navigation";
import { getSettings } from "@agency/core/server";
import { ModeBadge } from "@agency/ui";
import { MobileNav, Sidebar } from "@/components/sidebar";
import { UserMenu } from "@/components/user-menu";
import { getAuthState } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Platformens ramme for alle seks moduler og Indstillinger. Adgangen
 * kontrolleres her igen server-side (middleware er første linje), så ingen
 * intern side kan renderes uden en gyldig administratorsession.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuthState();
  if (auth.status === "unconfigured") redirect("/login?reason=config");
  if (auth.status === "forbidden") redirect("/login?reason=forbidden");
  if (auth.status !== "authorized") redirect("/login");
  const settings = await getSettings();
  return (
    <>
      <Sidebar mode={settings.mode} />
      <div className="lg:pl-72">
        <MobileNav />
        <header className="flex h-14 items-center justify-end gap-3 border-b border-border/70 bg-background/80 px-6 backdrop-blur">
          <span className="text-xs text-muted-foreground">Tilstand</span>
          <Link href="/settings" aria-label="Skift tilstand under Indstillinger">
            <ModeBadge mode={settings.mode} />
          </Link>
          <UserMenu email={auth.user.email ?? "Administrator"} role={auth.role} />
        </header>
        <main className="mx-auto max-w-[1400px] px-6 py-8">{children}</main>
      </div>
    </>
  );
}
