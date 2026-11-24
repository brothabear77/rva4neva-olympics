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

Phases 2–4 add the endpoints for profile, practice, votes, vlog, scorekeeping and admin. They are listed in the iOS port plan.
