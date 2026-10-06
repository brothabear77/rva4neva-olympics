import Link from "next/link";
import { redirect } from "next/navigation";
import { AthletePhoto } from "@/components/AthletePhoto";
import { ProfileEditor } from "@/components/ProfileEditor";
import { WalkoutPicker } from "@/components/WalkoutSong";
import { PageHeader } from "@/components/ui";
import { getSession, isAdmin } from "@/lib/auth";
import { getProfile, getWalkoutSongs } from "@/lib/queries";
import { spotifyConfigured } from "@/lib/spotify";

export const dynamic = "force-dynamic";

export const metadata = { title: "Profile" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Your own profile: the tagline and bio shown on the Athletes page. The admin, who has
 * no athlete of their own, edits anyone's from here with ?athlete=<id> (linked from
 * the Athletes page).
 */
export default async function ProfilePage(props: PageProps<"/profile">) {
  const session = await getSession();
  if (!session) redirect("/login?next=/profile");

  const asked = (await props.searchParams).athlete;
  const requested = typeof asked === "string" && UUID.test(asked) ? asked : null;
  const athleteId = isAdmin(session) && requested ? requested : session.athleteId;
  // A staff login has no athlete, so no profile of its own.
  if (!athleteId) redirect("/");

  const [profile, walkoutSongs] = await Promise.all([getProfile(athleteId), getWalkoutSongs()]);
  if (!profile) redirect(isAdmin(session) ? "/info/athletes" : "/");
  const own = athleteId === session.athleteId;

  return (
    <>
      <PageHeader
        eyebrow={own ? "Your profile" : "Editing as admin"}
        title={profile.name}
        description="What everyone sees about you on the Athletes page, and the song that plays when you walk out."
        actions={
          <Link href="/info/athletes" className="btn btn-ghost">
            Athletes
          </Link>
        }
      />

      <div className="card flex flex-wrap items-start gap-6 p-4 sm:p-6">
        <AthletePhoto name={profile.name} src={profile.photo || undefined} key={profile.photo || "none"} />
        <div className="min-w-[16rem] flex-1">
          <ProfileEditor athleteId={profile.athleteId} name={profile.name} tagline={profile.tagline} bio={profile.bio} />
          <p className="mt-6 text-xs text-muted">Photos can&apos;t be changed here yet. Send a new one to the admin.</p>
        </div>
      </div>

      <section aria-labelledby="walkout-heading" className="mt-10">
        <p className="eyebrow mb-2">Plays when you&apos;re up</p>
        <h2 id="walkout-heading" className="mb-4 font-display text-2xl font-bold uppercase tracking-wide text-paper">
          Walkout song
        </h2>
        <div className="card p-4 sm:p-6">
          <WalkoutPicker
            athleteId={profile.athleteId}
            name={profile.name}
            walkout={walkoutSongs.get(profile.athleteId) ?? null}
            searchable={spotifyConfigured()}
          />
        </div>
      </section>
    </>
  );
}
