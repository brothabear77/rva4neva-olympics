import type { TieAthlete, TieGroup } from "@/lib/ranking";
import { ordinal } from "@/lib/calculator";

/**
 * Every tie on the leaderboard and what settled it (src/lib/ranking.ts; the rule is on
 * /info/scoring), laid out as a head-to-head: the two athletes at either end of the row in
 * alphabetical order (the one who came out ahead has the brighter name), and down the
 * middle the scores that were compared, best event first, stopping at the one that
 * broke the tie. That score is the winner's, in the
 * accent. Renders nothing while nobody is level.
 *
 * A tie of three or more is a table instead (TieTable): a column per athlete, a row per
 * score position, so the whole group can be seen being narrowed down together.
 */
export function Tiebreakers({ ties }: { ties: TieGroup[] }) {
  if (ties.length === 0) return null;

  return (
    <section className="mt-8">
      <p className="eyebrow mb-3">Tiebreakers</p>
      <div className="space-y-3">
        {ties.map((tie) => (
          <div key={`${tie.totalPoints}-${tie.athletes[0].athleteId}`} className="card p-4">
            <p className="text-center text-sm text-muted">
              <span className="tnum font-display text-lg font-bold text-accent">
                {ordinal(tie.athletes[0].rank)}
              </span>
              {" "}place
            </p>
            {tie.athletes.length === 2 ? (
              <div className="mt-3">
                <Matchup winner={tie.athletes[0]} loser={tie.athletes[1]} decidedAt={tie.decidedAt[0]} />
              </div>
            ) : (
              <TieTable tie={tie} />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Matchup({ winner, loser, decidedAt }: { winner: TieAthlete; loser: TieAthlete; decidedAt: number | null }) {
  // Down to the deciding score; if nothing decided it, show the whole run that matched.
  const rows = Array.from({ length: decidedAt === null ? Math.max(winner.scores.length, 1) : decidedAt + 1 }, (_, k) => k);
  // Alphabetical, not by result: the winner can be on either side, so they're picked out
  // by the brighter name and the outlined score instead.
  const winnerFirst = winner.athleteName.localeCompare(loser.athleteName) <= 0;
  const left = winnerFirst ? winner : loser;
  const right = winnerFirst ? loser : winner;
  const nameClass = (athlete: TieAthlete) =>
    [
      "min-w-0 truncate font-display text-xl font-bold uppercase tracking-wide sm:text-2xl",
      decidedAt === null || athlete === winner ? "text-paper" : "text-muted",
    ].join(" ");

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-x-3 gap-y-2 sm:gap-x-6">
        <p className={`${nameClass(left)} pl-4 text-left sm:pl-12`}>{left.athleteName}</p>
        <p className="eyebrow text-center">{decidedAt === null ? "Level" : "vs"}</p>
        <p className={`${nameClass(right)} pr-4 text-right sm:pr-12`}>{right.athleteName}</p>

        {rows.map((k) => (
          <Row
            key={k}
            label={k === 0 ? "Best event" : `${ordinal(k + 1)} best`}
            left={left.scores[k]}
            right={right.scores[k]}
            highlight={decidedAt === k ? (winnerFirst ? "left" : "right") : null}
          />
        ))}
      </div>
      {decidedAt === null ? (
        <p className="mt-3 text-center text-xs font-bold text-accent">Every score matches, so a new tiebreaker is needed.</p>
      ) : null}
    </div>
  );
}

function Row({
  highlight,
  label,
  left,
  right,
}: {
  highlight: "left" | "right" | null;
  label: string;
  left: { points: number; eventName: string } | undefined;
  right: { points: number; eventName: string } | undefined;
}) {
  return (
    <>
      <Score score={left} align="right" highlight={highlight === "left"} />
      <p className="text-center text-xs text-muted">{label}</p>
      <Score score={right} align="left" highlight={highlight === "right"} />
    </>
  );
}

function Score({
  score,
  align,
  highlight = false,
}: {
  score: { points: number; eventName: string } | undefined;
  align: "left" | "right";
  highlight?: boolean;
}) {
  const eventName = score?.eventName ?? "no result";
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : "text-left"}`}>
      <span
        className={[
          "tnum inline-block max-w-full rounded-md border px-2 py-0.5",
          highlight ? "border-accent text-accent" : "border-transparent text-paper",
        ].join(" ")}
      >
        {/* Mirrored on the left side, so the score is always the part nearest the middle. */}
        {align === "right" ? <span className="mr-1.5 truncate text-xs text-muted">{eventName}</span> : null}
        <span className="font-semibold">{score?.points ?? 0}</span>
        {align === "left" ? <span className="ml-1.5 truncate text-xs text-muted">{eventName}</span> : null}
      </span>
    </div>
  );
}

/**
 * Three or more level: athletes across in alphabetical order, each with the place they
 * ended up in, and the compared scores down the rows. Each row is captioned with the score position being compared. A score is outlined when it put its
 * athlete ahead of the others still level; an athlete who has been placed shows "·" in the
 * rows after that, since they're out of the comparison.
 */
function TieTable({ tie }: { tie: TieGroup }) {
  const athletes = [...tie.athletes].sort((a, b) => a.athleteName.localeCompare(b.athleteName));
  const rows = Array.from({ length: tie.depth }, (_, k) => k);

  return (
    <div className="mt-3 overflow-x-auto">
      <div
        className="grid min-w-max items-baseline gap-x-6 gap-y-3 sm:min-w-0"
        style={{ gridTemplateColumns: `repeat(${athletes.length}, minmax(5.5rem, 1fr))` }}
      >
        {athletes.map((athlete) => (
          <div key={athlete.athleteId} className="min-w-0 text-center">
            <p className="truncate font-display text-xl font-bold uppercase tracking-wide sm:text-2xl text-paper">
              {athlete.athleteName}
            </p>
            <p className="eyebrow">{ordinal(athlete.rank)}</p>
          </div>
        ))}

        {rows.map((k) => (
          <TableRow key={k} label={k === 0 ? "Best event" : `${ordinal(k + 1)} best`}>
            {athletes.map((athlete) => {
              const out = athlete.settledAt !== null && k > athlete.settledAt;
              const score = athlete.scores[k];
              return (
                <div key={athlete.athleteId} className="text-center">
                  {out ? (
                    <span className="text-muted">·</span>
                  ) : (
                    <span
                      className={[
                        "tnum inline-block max-w-full rounded-md border px-2 py-0.5",
                        athlete.highlightAt === k ? "border-accent text-accent" : "border-transparent text-paper",
                      ].join(" ")}
                    >
                      <span className="font-semibold">{score?.points ?? 0}</span>
                      <span className="block truncate text-xs text-muted">{score?.eventName ?? "no result"}</span>
                    </span>
                  )}
                </div>
              );
            })}
          </TableRow>
        ))}
      </div>
      {tie.athletes.some((a) => a.settledAt === null) ? (
        <p className="mt-3 text-center text-xs font-bold text-accent">
          Every score matches for the athletes sharing a place, so a new tiebreaker is needed.
        </p>
      ) : null}
    </div>
  );
}

function TableRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      {/* Its own line across the table rather than a column of its own, which would push
          the athletes off-center. */}
      <p className="col-span-full -mb-2 mt-1 text-center text-xs text-muted">{label}</p>
      {children}
    </>
  );
}
