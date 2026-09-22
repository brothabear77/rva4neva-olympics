import { AthletePhoto } from "./AthletePhoto";
import { RankBadge } from "./ui";
import { paragraphs, type AthleteProfile } from "@/lib/profiles";

export interface RosterRow {
  id: string;
  name: string;
  profile: AthleteProfile | null;
  standing: { rank: number; totalPoints: number; eventsCompleted: number };
}

/**
 * One row per athlete: a photo, then their name, tagline and bio, then where they
 * stand. Every athlete is here whether or not anyone has written about them yet;
 * without a photo they get their initials, and without a bio a quiet note, so a
 * half-filled page looks deliberate.
 */
export function AthleteRoster({ rows, eventCount }: { rows: RosterRow[]; eventCount: number }) {
  return (
    <ul className="space-y-3">
      {rows.map(({ id, name, profile, standing }) => {
        const photo = profile?.photo?.trim();
        const tagline = profile?.tagline?.trim();
        const bio = paragraphs(profile?.bio);

        return (
          <li key={id} className="card flex flex-wrap items-center gap-x-5 gap-y-4 p-4 sm:p-5">
            <AthletePhoto name={name} src={photo} key={photo ?? "none"} />

            <div className="min-w-[12rem] flex-1">
              <h2 className="font-display text-xl font-bold uppercase tracking-wide text-paper">{name}</h2>
              {tagline ? <p className="mt-0.5 text-sm text-accent">{tagline}</p> : null}
              {bio.length > 0 ? (
                <div className="mt-2 space-y-2 text-sm leading-relaxed text-paper">
                  {bio.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              ) : profile ? null : (
                <p className="mt-2 text-sm text-muted">No bio yet.</p>
              )}
            </div>

            <div className="w-full border-t border-[var(--edge)] pt-3 sm:w-auto sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0 sm:text-right">
              {standing.eventsCompleted > 0 ? (
                <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                  <RankBadge rank={standing.rank} />
                  <p className="tnum font-display text-2xl font-bold text-paper">
                    {standing.totalPoints.toLocaleString()}
                    <span className="ml-1 text-xs font-medium text-muted">pts</span>
                  </p>
                  <p className="text-xs text-muted">
                    {standing.eventsCompleted} of {eventCount} events
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted">No scores yet</p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
