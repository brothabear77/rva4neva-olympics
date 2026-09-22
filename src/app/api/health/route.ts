/**
 * Is the server process up? That is all this answers.
 *
 * It deliberately never touches the database. The site runs against Aurora at
 * 0 ACU, which sleeps between uses and takes a few seconds to wake. If the health
 * check ran a query, a wake-up could look like a failure, the host would restart a
 * perfectly healthy container, and the restart would fix nothing. A restart can only
 * cure a dead server process, so that is the only thing checked.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
