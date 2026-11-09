-- Move the athlete profiles that used to be hardcoded in src/content/athletes.ts into
-- app.athlete_profiles, which is now the only place profiles live.
--
-- Matched to the roster by name, ignoring case. A name nobody has is skipped, and an
-- athlete who already has a profile row (they claimed their account and edited it)
-- keeps what they wrote. Dollar quoting so apostrophes need no escaping (except
-- Pam's tagline, which contains a $ and so is a plain string).
INSERT INTO "app"."athlete_profiles" ("athlete_id", "tagline", "bio", "photo")
SELECT a."id", p."tagline", p."bio", p."photo"
FROM (VALUES
  ($$Nick$$, $$BDN$$, $$Former D1 athlete and sometimes shows he's still got it, even if it was over 3 years and 40 pounds ago.$$, $$/athletes/nick.jpg$$),
  ($$Mena$$, $$Me? Nah.$$, $$Biggest brain, bigger heart. Won't help him much here but we love him anyway.$$, $$/athletes/mena.png$$),
  ($$Allen$$, $$Where them kids at?$$, $$Avid pickleballer, and fan of Michael Jackson for the wrong reasons. Thankfully we're all adults here.$$, $$/athletes/allen.png$$),
  ($$Ashley$$, $$$$, $$Small but mighty. Unfortunately maybe too small, but I wouldn't say that to her face.$$, $$/athletes/ashley.png$$),
  ($$David$$, $$Ah hahaha$$, $$You'd think someone who likes to play sports would be more coordinated. If you see him fighting a dog, help the dog.$$, $$/athletes/david.png$$),
  ($$Marco$$, $$Mohit is a better athlete than David; I would still beat him at tennis$$, $$A gentleman and a scholar. Jury's still out on what he can actually do, but since he wanted to add a 5k, "not much" might be a good answer.$$, $$/athletes/marco.png$$),
  ($$Mohit$$, $$$$, $$More of an aesthetic than an athlete. Claims he did high jump in school, but the consensus is he didn't do it well.$$, $$/athletes/mohit.png$$),
  ($$Ahmed$$, $$$$, $$The only one who got paid to play sports. Also the only one to hurt themselves in a geriatric sport. He may only need the one hamstring he's got left to compete with this group.$$, $$/athletes/ahmed.jpg$$),
  ($$Nat$$, $$$$, $$Not sure anyone is expecting much competition from her. Could pull out an upset if some H-Town or Memphis rap comes on though.$$, $$/athletes/nat.png$$),
  ($$Pam$$, 'P$',$$The embodiment of self-belief, and the reason we're not balancing by gender. If you've seen her gymnastics videos from the early 2000s, you'd know balance wasn't her strong suit anyway.$$, $$/athletes/pam.png$$)
) AS p("name", "tagline", "bio", "photo")
JOIN "app"."athletes" a ON lower(a."name") = lower(p."name")
ON CONFLICT ("athlete_id") DO NOTHING;
