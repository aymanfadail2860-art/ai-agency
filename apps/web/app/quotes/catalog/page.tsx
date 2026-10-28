import type { Metadata } from "next";
import Link from "next/link";
import { CatalogEditor } from "@agency/quotes";
import { getCatalog } from "@agency/quotes/server";
import { PageHeader } from "@agency/ui";

export const metadata: Metadata = { title: "Servicekatalog" };
export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  return (
    <>
      <PageHeader
        eyebrow="Tilbud"
        title="Servicekatalog"
        description={
          <>
            Bureauets services med beskrivelse, leverancer, implementeringstid, tilvalg og demopriser.{" "}
            <Link href="/quotes" className="text-accent hover:underline">
              ← Tilbud
            </Link>
          </>
        }
      />
      <CatalogEditor initialItems={await getCatalog()} />
    </>
  );
}
