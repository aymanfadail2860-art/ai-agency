import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@agency/core/server";
import { QuoteList } from "@agency/quotes";
import { listQuotes } from "@agency/quotes/server";
import { ActiveBadge, Button, ModeBadge, PageHeader } from "@agency/ui";
import { BookOpen } from "lucide-react";

export const metadata: Metadata = { title: "Tilbud" };
export const dynamic = "force-dynamic";

export default async function QuotesPage() {
  const { mode } = await getSettings();
  const items = await listQuotes(mode);
  return (
    <>
      <PageHeader
        eyebrow="Modul 2"
        title="Tilbud"
        badges={
          <>
            <ActiveBadge />
            <ModeBadge mode={mode} />
          </>
        }
        description="Tilbud oprettes direkte fra Research uden genindtastning. Redigér services, priser, rabatter og tekst — med live preview og PDF-eksport."
        actions={
          <Button asChild variant="outline">
            <Link href="/quotes/catalog">
              <BookOpen /> Servicekatalog
            </Link>
          </Button>
        }
      />
      <QuoteList items={items} />
    </>
  );
}
