# JSON API (`/api/v1`) for the iOS app

Route handlers live in `src/app/api/v1/**/route.ts`. Each one is wrapped in `api()` from `src/lib/api.ts`.

## Conventions

- **Auth**: send `Authorization: Bearer <token>`. The token comes from `auth/login` or `auth/register`. It is a row in `app.sessions`, just like the website's `session` cookie, so it expires after 30 days. Deleting the account or changing its role takes effect immediately. See `getSession` in `src/lib/auth.ts`.
- **Success**: the response body is the data. Write endpoints that reuse a server action return `{ message, data? }`.
- **Failure**: `{ error: "<message for the person>" }`. The status codes are:
  - 400: a validation error or refusal
  - 401: signed out or the session expired
  - 403: the account isn't allowed
  - 404: not found
  - 500: unexpected; the message is generic and the details go to the server log
- **CSRF**: a write that carries a cross-site `Origin` header is refused with a 403. The app sends no `Origin`.
- **Caching**: every response is `Cache-Control: no-store`.
- **Waking the database**: `/api/v1` is covered by the wake ping in `src/proxy.ts`. The first request after Aurora has been idle can still take about 15 seconds.
- **Dates** are ISO 8601 strings with milliseconds.
- **Asset paths** such as `/athletes/nick.jpg` are relative to the site's origin.

## Endpoints (phase 1)

| Method | Path | Auth | Returns |
|---|---|---|---|
| POST | `auth/login` `{username, password}` | n/a | `{token, expiresAt, account, flags, registrationLocked}` |
| POST | `auth/register` `{name, username, password, confirm}` | n/a | 201, same as login plus `message` |
| POST | `auth/logout` | bearer | `{message}` |
| GET | `me` | optional | `{account \| null, flags: {openSubmission, showChampion, showVlog}, registrationLocked}` |
| GET | `config` | none | `{site: {name, shortName, tagline, timeZone, startsAt, days}, quotes}` |
| GET | `home` | none | `{started, startsAt, finished, podium, recent, champions, events}` |
| GET | `leaderboard` | none | `{entries, events, ties, superlatives}` |
| GET | `events` | none | `{events}` (EventSummary: an event plus `resultCount`, `leaderName`, `leaderPoints`, `leaderRaw`) |
| GET | `events/{slug}` | none | `{event, guide, results}` |
| GET | `athletes` | none | `{eventCount, athletes: [{id, name, photo, tagline, bio, walkout, rank, totalPoints, eventsCompleted, best}]}` |
| GET | `guide` | none | `{events: GuideEvent[]}` |

## Endpoints (phase 2: athletes)

Write endpoints reuse the website's server actions, so they enforce the same rules and limits.

| Method | Path | Who | Notes |
|---|---|---|---|
| PATCH | `me/username` `{username}` | signed in | |
| PATCH | `me/password` `{current, password, confirm}` | signed in | signs out other sessions, but not this one |
| PATCH | `athletes/{id}` `{name}` | that athlete or the admin | rename |
| GET | `athletes/{id}/profile` | that athlete or the admin | `{athleteId, name, tagline, bio, photo, walkout}` |
| PATCH | `athletes/{id}/profile` `{tagline, bio}` | that athlete or the admin | |
| PUT | `athletes/{id}/walkout` `{kind, spotifyId}` | that athlete or the admin | `kind` is `track` or `episode` |
| DELETE | `athletes/{id}/walkout` | that athlete or the admin | |
| GET | `walkout/search?q=` | signed in | `{message, data: WalkoutSong[]}`; also accepts an open.spotify.com link |
| GET | `practice[?athlete=id]` | members (`?athlete` is admin-only) | `{athleteId, today, events, attempts}` |
| POST | `practice` `{eventId, value, attemptedOn, notes}` | athletes | `attemptedOn` is `YYYY-MM-DD`, and can't be in the future |
| DELETE | `practice/{id}` | the owner, or the admin | |
| GET | `proposals` | members | `{proposals: [...ProposalRow, status, quorum, mine], serverNow, limits}` |
| POST | `proposals` `{title, body}` | athletes | |
| PUT | `proposals/{id}/vote` `{inFavor}` | athletes | only while open |
| DELETE | `proposals/{id}/vote` | athletes | takes the vote back |
| POST | `proposals/{id}/withdraw` | the proposer | |
| DELETE | `proposals/{id}` | the admin | removes the proposal and its votes |

## Endpoints (phase 3: vlog)

These endpoints return 404 while the `show-vlog-page` flag is off, the same as the page.

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `vlog` | members | `{configured, canUpload, limits, events, videos, confessions: {items, isPublic}}`. Each `src` is a playback URL signed for one hour. |
| POST | `vlog/uploads` `{title, eventId, confession, contentType, sizeBytes}` | athletes | `{data: {videoId, uploadUrl}}`. PUT the file to `uploadUrl` with exactly this `Content-Type` and size, and no Authorization header. |
| POST | `vlog/{id}/finish` | the uploader | Checks the stored size against the request, then publishes the video. |
| DELETE | `vlog/{id}` | the uploader, or the admin | Removes the row and the stored file. |
| PUT / DELETE | `vlog/{id}/heart` | athletes | Sets hearted or not hearted. A repeat call doesn't change anything. |

## Endpoints (phase 4: scorekeeping and admin)

Writes are refused with `The scoreboard is currently locked.` while the `open-submission` flag is off.

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `scores` | scorekeepers, the admin | `{events, athletes, values: [{athleteId, eventId, rawValue}], locked}` |
| POST | `scores` `{changes: [{athleteId, athleteName, eventId, value}]}` | scorekeepers, the admin | Adds or replaces scores in one transaction |
| POST | `scores/delete` `{cells: [{athleteId, athleteName, eventId}]}` | scorekeepers, the admin | A POST, because request bodies on DELETE are unreliable |
| POST | `imports/preview` `{csv}` | scorekeepers, the admin | `{data: ImportPreview}`; writes nothing |
| POST | `imports` `{csv, filename}` | scorekeepers, the admin | Validated again; any bad row blocks the whole import |
| GET | `changelog?page=&size=` | anyone | `{entries, total, page, pageCount, size, locked, canRestore}` |
| POST | `changelog/{id}/restore` | scorekeepers, the admin | Adds a new entry and never rewrites history |
| GET | `admin` | the admin | `{accounts, registrationLocked, events}` |
| PUT | `settings/registration-locked` `{locked}` | the admin | |
| PUT | `accounts/{id}/scorekeeper` `{on}` | the admin | Athlete accounts only |
| DELETE | `athletes/{id}` | the admin | Deletes the athlete and everything of theirs; can't be undone |
| PATCH | `events/{id}/benchmarks` `{benchmarkStandard, benchmarkZero, decimals}` | the admin | Re-scores every result in the event. The path takes the event's id, in the `[slug]` folder. |
