import Link from "next/link";
import { redirect } from "next/navigation";
import { RosterEditor } from "@/components/RosterEditor";
import { SubmitPanels } from "@/components/SubmitPanels";
import { LockedBanner } from "@/components/LockedBanner";
import { PageHeader } from "@/components/ui";
import { canScore, getSession, isAdmin } from "@/lib/auth";
import { submissionsLocked } from "@/lib/flags";
import { getAthletes, getEventsForForm, getResultValues, getRoster } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Submit Results" };

export default async function SubmitPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/submit");
  if (!canScore(session)) redirect("/");

  const [events, athletes, results, roster, locked] = await Promise.all([
    getEventsForForm(),
    getAthletes(),
    getResultValues(),
    getRoster(),
    submissionsLocked(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={`Scoring as ${session.displayName}`}
        title="Submit Results"
        actions={
          <Link href="/changelog" className="btn btn-ghost">
            History
          </Link>
        }
      />

      {locked ? <LockedBanner /> : null}

      <SubmitPanels events={events} athletes={athletes} results={results} locked={locked} />

      {isAdmin(session) ? <RosterEditor roster={roster} locked={locked} /> : null}
    </>
  );
}
