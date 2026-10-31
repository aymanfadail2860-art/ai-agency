"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, apiFetch, Button, Card, CardContent, Spinner } from "@agency/ui";
import { ArrowRight, Factory, Handshake } from "lucide-react";

/** Tilbud → Produktion: registrér kundens accept og overfør aftalen via kontrakten quotes.production-intake. */
export function QuoteAcceptance({ quoteId, status, projectId }: { quoteId: string; status: string; projectId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (projectId) {
    return (
      <Card className="mb-6 border-success/30 bg-success/5" data-testid="quote-accepted">
        <CardContent className="flex flex-col gap-2 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <Handshake className="h-4 w-4 text-success" /> Kunden har accepteret tilbuddet. Aftalen er overført til Produktion & Levering.
          </span>
          <Link href={`/production/projects/${projectId}`} className="inline-flex items-center gap-1 font-medium text-accent hover:underline" data-testid="open-production-project">
            Åbn produktionsprojekt <ArrowRight className="h-4 w-4" />
          </Link>
        </CardContent>
      </Card>
    );
  }
  if (status === "rejected") return null;

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ projectId: string }>(`/api/quotes/${quoteId}/accept`, { body: {} });
      router.push(`/production/projects/${res.projectId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card className="mb-6" data-testid="quote-acceptance">
      <CardContent className="flex flex-col gap-3 p-4 text-sm md:flex-row md:items-center md:justify-between">
        <span className="flex items-start gap-2 text-muted-foreground">
          <Factory className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          Når kunden har accepteret, overføres aftalen (kunde, leverancer og priser fra den aktuelle version) til et produktionsprojekt.
        </span>
        {confirm ? (
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={accept} disabled={busy} data-testid="confirm-accept">
              {busy && <Spinner />} Bekræft: kunden har accepteret
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirm(false)} disabled={busy}>
              Annullér
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => setConfirm(true)} data-testid="accept-quote">
            <Handshake /> Kunden har accepteret
          </Button>
        )}
      </CardContent>
      {error && (
        <div className="px-4 pb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}
    </Card>
  );
}
