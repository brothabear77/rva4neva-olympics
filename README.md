# \#rva4neva Olympics

A live scoreboard for a two-day backyard olympics. Ten events, one set of
standings, and anyone can post a score from their phone.

## How scoring works

Events measure different things — seconds, feet, cups, trivia points — so each
one converts its raw measurement to a common point scale, decathlon-style. Real
decathlon uses `A × (P − B)^C`; here the curve is a straight line through two
benchmarks the organizer picks per event:

- `benchmark_1000` — the performance worth **1000 points**
- `benchmark_zero` — the performance worth **0 points**

```
points = round( 1000 × (raw − benchmark_zero) / (benchmark_1000 − benchmark_zero) )
```

Direction falls out of the math: for a sprint the 1000-point mark (5.0s) is
*below* the 0-point mark (9.0s), so the slope is negative and faster scores
higher. No "lower is better" flag exists anywhere in the code.

Points floor at 0 and are deliberately **not** capped at 1000 — beating the top
benchmark should be worth something, as in a real decathlon.

The formula lives in one place, [`src/lib/scoring.ts`](src/lib/scoring.ts), and is
used by the score grid's live preview, the CSV importer and the server, so the
number you see before submitting is the number that lands on the board.

## Anyone can submit — nothing can be lost

There are no accounts. The safety net is the database: a trigger records every
insert, update and delete against `app.results`, `app.events` and `app.athletes`
into `audit.change_log`, **inside the same transaction as the change**. A score
cannot exist without its audit row, and no code path can skip logging.

That history is append-only. `UPDATE`, `DELETE` and `TRUNCATE` on
`audit.change_log` all raise — for every role, the table owner included. Undoing
a change *appends* a new entry rather than erasing the ones after it, so the
trail stays complete even while rolling something back.

See [`drizzle/0001_audit_triggers.sql`](drizzle/0001_audit_triggers.sql).

## Running it locally

Requires Node 20.9+ and Docker (Colima works).

```bash
npm install
cp .env.example .env.local && cp .env.example .env

npm run db:up          # Postgres 17 in Docker on port 5433
npm run db:migrate     # schema + audit triggers
npm run db:seed        # ten events and the roster
# npm run db:seed -- --with-results   # ...plus sample scores to look at

npm run dev
```

| Script | |
|---|---|
| `npm run dev` | dev server |
| `npm test` | unit tests (scoring + CSV) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:psql` | psql shell into the container |
| `npm run db:reset` | wipe the volume and rebuild from scratch |
| `npm run db:studio` | Drizzle Studio |

## The score grid

The Submit page opens on a scoresheet: the events across the top (grouped by
day), the athletes down the side, and a cell for every pairing. Cells start out
empty. A score that is already stored shows in gray as the cell's placeholder,
with its points underneath, so it still reads as the state of the competition.

- A toggle above the grid switches between **Add scores** (the default) and
  **Delete scores**. Each does one job and can't do the other's.
- In add mode, type a result in any cell to add or replace a score; its points
  appear underneath as you go. **A blank cell is never sent, so nothing is ever
  erased.**
- Enter or the arrow keys move up and down a column.
- The focused cell's event heading and athlete name light up, so you can always
  see which pairing you are typing into.
- Only cells you typed a different number into are sent, and they are saved
  together in one transaction: all of them or none. Retyping the value a cell
  already has changes nothing. Numbers are rounded to 4 decimal places, which is
  what the database keeps.
- After a save the typed text clears and each saved cell shows its new value as
  the placeholder.
- The Save button stays disabled while any cell is not a number.
- The toggle locks while there are unsaved changes ("Save or discard your changes
  to switch modes"), so adding and deleting can never be mixed in one save.
- Notes on an existing score are left alone (the grid has no notes column). CSV
  upload is the other tab.

### Delete mode

- Every cell is filled in with its stored score. **Empty a cell and save to
  delete that score.** Editing a filled cell just empties it, so a stray
  keystroke can only ever mean "delete", never "change". Cells with no score are
  inert.
- A cell marked for deletion turns dashed, shows its old value in gray, and has
  an **undo** link. The button counts what it is about to do ("Delete 2 scores").
- Nothing changes until you press that button. Deleting uses its own server
  action (`deleteScores`), separate from the one that saves scores
  (`submitGrid`), so saving structurally cannot delete anything.
- A deleted score is not gone for good: the whole row is kept in Change History,
  and its **Undo** button puts it back.

The rows and columns come from the database, so it is 10 x 10 with ten events and
ten athletes and grows a row per athlete on the roster.

### The roster

Who is in the grid is managed in the **Roster** section at the bottom of the Submit
page. It is the one place to add, rename or remove an athlete; the grid only shows
this list.

- **Add** an athlete by name. Names are unique ignoring case, so "nick" is refused
  when "Nick" exists, and the message says whose name it is.
- **Rename** with the Rename link. Changing only the capitalisation is fine.
- **Delete** asks first and says how many scores go with the athlete ("Delete Casey
  and their 3 scores?"), because a score belongs to a person.
- Every change is recorded in Change History. **Undo** there renames someone back, or
  brings a deleted athlete back **together with every score deleted with them**. A
  removed score still reads "Casey — Keg Toss" in the history, not "Unknown athlete".
- Bios and photos on the Athletes page are matched by name, so a rename may mean
  updating that entry too.
- CSV import still adds anyone it does not recognise, and says so in its preview.

## Info: athletes and the event guide

The **Info** tab is a menu with two pages. Both work with nothing written; you fill
them in later by editing a file, the same way as the countdown quotes.

**Info -> Athletes** lists everyone on the roster, one row each, with their photo,
tagline, bio and where they stand. Edit `src/content/athletes.ts`:

```ts
{ name: "Nick", photo: "/athletes/nick.jpg", tagline: "Perennial runner-up", bio: "..." },
```

Every field except `name` is optional. Put photos in `public/athletes/`. Someone with
no entry still gets a row, with their initials in place of a photo.

**Info -> Events** is a guide with a tab per event: what it is, how it's scored, and a
demonstration. The scoring section writes itself from the event's two benchmarks (what
a mark is worth, plus a small table of example marks) and the description falls back
to the event's own. To add rules and a demo, edit `src/content/events.ts`:

```ts
{
  slug: "40-yard-dash",
  rules: ["Two attempts, fastest counts."],
  media: { src: "/events/40-yard-dash.mp4" },   // or a .gif or .jpg,
  // media: { youtube: "https://youtu.be/dQw4w9WgXcQ" },          or a YouTube link
}
```

Put files in `public/events/`. A `src` is a photo, GIF or video according to its file
ending. A YouTube clip loads nothing from YouTube until someone presses play.
`/info/events?event=keg-toss` opens straight onto one event's tab.

Names and slugs are matched ignoring case. While you run the site locally, a notice
appears if an entry matches nobody, a link can't be read as YouTube, or a file isn't
where you said it is, so a typo doesn't just make something silently not show.

The competitive **Events** tab (standings, leaders) and this guide link to each other.

## CSV format

One row per score. Header spelling is forgiving — `event` / `athlete` / `value`
work as well as the full names, and an event can be named by slug or by display
name.

```csv
event_slug,athlete_name,raw_value,notes
40-yard-dash,Nick,5.42,
cornhole-shootout,Dana,11,windy
```

Uploads are previewed before anything is written: how many scores are new, which
would overwrite an existing one (and with what), who joins the roster, and what
is wrong. **Any single bad row blocks the whole import** — a half-applied
scoreboard is worse than a rejected file. The commit re-validates server-side
and runs as one transaction.

## Countdown quotes

Until kickoff the home page is the title, the countdown, and a borderless
carousel of quotes. The quotes live in one file, [`src/content/quotes.ts`](src/content/quotes.ts):

```ts
export const QUOTES: QuoteInput[] = [
  { text: "The quote itself.", author: "Who said it" },
  { text: "An unattributed line." },
];
```

- Order in the file is the order on screen. `author` is optional.
- Quotation marks are added for you. If you paste some in, the outer pair is
  removed. A quote that contains a `"` needs single quotes or backticks around
  it in the file.
- Every quote stays up for 5 seconds (`DWELL_MS` in `src/lib/quotes.ts`).
- The carousel is hidden until there is at least one quote.
- Quotes slide sideways. Arrows step to the previous or next quote and wrap
  around at either end. Up to 8 quotes get a row of dots as well; with more, the
  dots become a counter ("3 / 13").
- It pauses under the mouse, while focused by keyboard, and with the tab hidden.
  The pause / play button covers touch screens. With reduced motion requested it
  starts paused and swaps quotes without sliding.

## Layout

```
src/lib/scoring.ts     the point formula — pure, unit-tested
src/lib/schema.ts      Drizzle schema for the app and audit schemas
src/lib/queries.ts     read models for the pages
src/lib/actions.ts     every write, each wrapped in withActor()
src/lib/csv.ts         parsing and import preview — pure, unit-tested
src/lib/profiles.ts    Info pages: matching content to the roster, media and YouTube links
src/content/athletes.ts, events.ts   the files you edit for the Info pages
src/lib/grid.ts        what a typed cell means and which cells changed — pure, unit-tested
src/lib/quotes.ts      tidies the quotes and sets how long each stays up
src/content/quotes.ts  the quotes themselves — the file you edit
src/lib/db.ts          pooling and the withActor() transaction helper
drizzle/               migrations; 0001 is the hand-written audit layer
scripts/               migrate and seed
infra/aurora.md        provisioning and deploy runbook
```

## Deploying

Production runs on Aurora Serverless v2 PostgreSQL over a direct connection.
See [`infra/aurora.md`](infra/aurora.md) — in particular, put **RDS Proxy** in
front of the cluster and keep `DATABASE_POOL_MAX=1`, or a crowd refreshing the
leaderboard will exhaust Aurora's connections.
