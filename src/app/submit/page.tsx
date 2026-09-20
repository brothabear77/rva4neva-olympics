import Link from "next/link";
import { SubmitPanels } from "@/components/SubmitPanels";
import { PageHeader } from "@/components/ui";
import { getAthletes, getEventsForForm, getResultValues } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Submit Results" };

export default async function SubmitPage() {
  const [events, athletes, results] = await Promise.all([
    getEventsForForm(),
    getAthletes(),
    getResultValues(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Anyone can score"
        title="Submit Results"
        description="No login — post a score from wherever you are standing. Every change is recorded with whoever's name is on it, and anything can be rolled back."
        actions={
          <Link href="/changelog" className="btn btn-ghost">
            History
          </Link>
        }
      />

      <SubmitPanels events={events} athletes={athletes} results={results} />
    </>
  );
}
