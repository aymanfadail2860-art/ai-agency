import Link from "next/link";
import { Button, EmptyState } from "@agency/ui";

export default function NotFound() {
  return (
    <EmptyState
      title="Siden blev ikke fundet"
      description="Elementet findes ikke, eller linket er forældet."
      action={
        <Button asChild variant="outline">
          <Link href="/research">Til Research</Link>
        </Button>
      }
    />
  );
}
