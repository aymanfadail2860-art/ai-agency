"use client";
import * as React from "react";
import { Button, Spinner } from "@agency/ui";
import { LogOut, ShieldCheck } from "lucide-react";

const ROLE_LABELS: Record<string, string> = { admin: "Administrator" };

/** Viser den indloggede bruger og logger ud (tilbagekalder sessionen hos Supabase Auth). */
export function UserMenu({ email, role }: { email: string; role: string }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="flex items-center gap-2 border-l border-border pl-3">
      <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex" data-testid="current-user">
        <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden />
        <span className="max-w-[14rem] truncate">{email}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{ROLE_LABELS[role] ?? role}</span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        data-testid="logout"
        onClick={async () => {
          setBusy(true);
          try {
            await fetch("/api/auth/logout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
          } finally {
            window.location.assign("/login?reason=logged_out");
          }
        }}
      >
        {busy ? <Spinner /> : <LogOut />} Log ud
      </Button>
    </div>
  );
}
