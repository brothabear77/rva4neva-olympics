import { z } from "zod";
import { api, body, fromAction, json, refuseUnlessMember } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { createProposal } from "@/lib/athleteActions";
import { getProposals } from "@/lib/queries";
import { MAX_OPEN_PROPOSALS, MAX_PROPOSAL_BODY_LENGTH, MAX_TITLE_LENGTH, decideProposal, quorumFor } from "@/lib/votes";

/** Every proposal, newest first, with its tally, status, quorum and how you voted. */
export const GET = api(async () => {
  const session = await getSession();
  const refused = refuseUnlessMember(session);
  if (refused || !session) return refused!;

  const now = new Date();
  const proposals = (await getProposals(session.athleteId)).map((p) => ({
    ...p,
    status: decideProposal({ ...p, now }),
    quorum: quorumFor(p.eligible),
    mine: p.proposerId === session.athleteId,
  }));
  return json({
    proposals,
    serverNow: now,
    limits: { maxOpen: MAX_OPEN_PROPOSALS, maxTitle: MAX_TITLE_LENGTH, maxBody: MAX_PROPOSAL_BODY_LENGTH },
  });
});

export const POST = api(async (request) => {
  const { data, problem } = await body(request, z.object({ title: z.string(), body: z.string().default("") }));
  return problem ?? fromAction(await createProposal(data));
});
