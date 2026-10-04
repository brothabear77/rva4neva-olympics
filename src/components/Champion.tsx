import { AthletePhoto } from "./AthletePhoto";
import { WalkoutPlayer } from "./WalkoutPlayer";
import type { WalkoutSong } from "@/lib/walkout";

export interface ChampionEntry {
  athleteId: string;
  athleteName: string;
  totalPoints: number;
  photo?: string;
  walkout: WalkoutSong | null;
}

/**
 * The winner, once every result is in: replaces the quote carousel in the hero's
 * open space, the same way the carousel itself replaces the countdown digits once
 * the games start. Two things to show by then instead of one — but only one spot
 * for them, so they take turns.
 *
 * More than one name here means a tie for first; each gets equal billing rather
 * than picking one arbitrarily — tiebreakers mean this shouldn't happen in
 * practice, but nothing here assumes it can't.
 *
 * The confetti this calls for falling over it lives one level up, in the hero
 * section itself (Confetti.tsx, page.tsx) rather than here, so it falls across
 * the whole top section and not just this card.
 *
 * A champion with a walkout song (WalkoutSong.tsx, set from the Athletes page)
 * gets a player and a Play button; it doesn't start on its own — see
 * WalkoutPlayer.tsx.
 */
export function Champion({ champions }: { champions: ChampionEntry[] }) {
  if (champions.length === 0) return null;

  return (
    <div className="flex w-full flex-col items-center gap-6 text-center lg:gap-8">
      <p className="eyebrow text-base text-accent lg:text-lg">
        {champions.length > 1 ? "Champions" : "Champion"}
      </p>
      {champions.map((champion) => {
        const photo = <AthletePhoto name={champion.athleteName} src={champion.photo} size="lg" />;
        const score = (
          <div>
            <p className="font-display text-3xl font-bold uppercase tracking-wide text-paper sm:text-4xl lg:text-5xl">
              {champion.athleteName}
            </p>
            <p className="tnum text-xl font-semibold text-accent sm:text-2xl lg:text-3xl">
              {champion.totalPoints.toLocaleString()} pts
            </p>
          </div>
        );

        // The song's player is laid over the bottom of the photo and its Play/Pause
        // button sits below the score; WalkoutPlayer lays those out around the score.
        return champion.walkout ? (
          <WalkoutPlayer key={champion.athleteId} song={champion.walkout} photo={photo}>
            {score}
          </WalkoutPlayer>
        ) : (
          <div key={champion.athleteId} className="flex flex-col items-center gap-4">
            {photo}
            {score}
          </div>
        );
      })}
    </div>
  );
}
