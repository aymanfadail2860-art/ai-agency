"use client";
import * as React from "react";
import { Alert, Button, Input, Label, Spinner } from "@agency/ui";
import { LogIn } from "lucide-react";

export function LoginForm({ next, notice }: { next: string; notice: { tone: "info" | "warning" | "error"; text: string } | null }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password"), next }),
      });
      const data = (await res.json().catch(() => null)) as { redirect?: string; error?: { message?: string } } | null;
      if (!res.ok) {
        setError(data?.error?.message ?? "Login mislykkedes. Prøv igen.");
        setBusy(false);
        return;
      }
      // Fuld sideindlæsning, så de nye httpOnly-sessionscookies bruges fra start.
      window.location.assign(data?.redirect ?? "/dashboard");
    } catch {
      setError("Kunne ikke kontakte serveren. Prøv igen.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="login-form" noValidate={false}>
      {notice && !error && (
        <Alert variant={notice.tone === "error" ? "error" : notice.tone === "warning" ? "warning" : "info"}>
          <span data-testid="login-notice">{notice.text}</span>
        </Alert>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required maxLength={254} autoFocus data-testid="login-email" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Adgangskode</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required maxLength={200} data-testid="login-password" />
      </div>
      {error && (
        <Alert variant="error">
          <span role="alert" data-testid="login-error">
            {error}
          </span>
        </Alert>
      )}
      <Button type="submit" className="w-full" disabled={busy} data-testid="login-submit">
        {busy ? <Spinner /> : <LogIn />} {busy ? "Logger ind …" : "Log ind"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">Glemt adgangskoden? Kontakt administratoren.</p>
    </form>
  );
}
