# Hosting on AWS

The site runs on **AWS App Runner** with an **Aurora Serverless v2** PostgreSQL database.
Nothing here is needed for local development: `docker compose up -d db` covers that.

```
your laptop ──docker push──▶ ECR ──▶ App Runner ──(VPC connector)──▶ Aurora
                                     (HTTPS URL)        │               ▲
                                                        ▼               │
                      NAT instance ──▶ LaunchDarkly, Spotify            │
                     migrations and psql, from one IP address ──────────┘
```

| Piece | What it is | Where it is defined |
|---|---|---|
| Registry | ECR repository `rva4neva-olympics`, keeps the last 10 images, tags never overwritten | `infra/cdk/lib/olympics-stack.ts` (`RegistryStack`) |
| Network | A VPC, two availability zones. Public subnets (Aurora, the NAT instance) and private subnets (the app's VPC connector only) | `SiteStack` |
| NAT instance | fck-nat on a `t4g.nano`, in an Auto Scaling group of one: the app's only route to the internet, for LaunchDarkly and Spotify | `SiteStack` |
| Database | Aurora Serverless v2, PostgreSQL 17, 0 to 2 ACU, pauses after 5 idle minutes | `SiteStack` |
| App | App Runner: 0.25 vCPU, 1 GB, one instance always on, at most two | `SiteStack` |
| Secrets | `rva4neva/database-master` (the owner), `rva4neva/app-database-url` (what the app uses), `rva4neva/launchdarkly-sdk-key` (set by hand, see *Feature flags*), `rva4neva/spotify-credentials` (set by hand, see *Walkout songs*) | `SiteStack` |

Infrastructure is AWS CDK in `infra/cdk`, a package of its own, so none of it reaches the
app's dependencies or its Docker image. Two scripts drive it: `scripts/deploy.ts` and
`scripts/aws-db.ts`. `scripts/deploy.ts` runs `aws-db.ts` itself at the end of a laptop
deploy — there is no second command to remember, see *Deploying from GitHub* for why this
is not quite as simple in CI.

## First deploy

You need the AWS CLI signed in, and Docker running.

```bash
aws login                          # or: aws sso login
npm run deploy -- --bootstrap      # once per account and region
```

`--bootstrap` runs `cdk bootstrap`, which creates a small staging bucket and some roles that
CDK itself needs. Leave it off on every later deploy.

The first deploy takes 10 to 15 minutes, nearly all of it Aurora. `deploy.ts` finishes by
running `aws-db.ts` itself: tables, the app's database login, the events and roster, then a
restart and a check that `/leaderboard` answers. The site's address
(`https://<something>.us-east-1.awsapprunner.com`) is printed before that final step.

The region is `us-east-1` unless `AWS_REGION` says otherwise or your AWS CLI has one
configured.

## Every deploy after that

```bash
npm run deploy                     # build, push, update, migrate — one command
```

`npm run deploy -- --dry-run` checks your session and says what it would do, changing nothing.
`npm run deploy -- --build-only` builds the image and stops; it needs no AWS account, and is a
quick way to check that the Dockerfile still works.

Images are tagged with the git commit. Deploying the same clean commit twice reuses the image
already in the registry. A working tree with uncommitted changes gets a `-dirty-<timestamp>`
tag each time, since the same commit id would then mean different code.

The database step (`aws-db.ts`) is safe to repeat and runs every time, whether or not this
deploy added a migration: migrations apply only what is new, the app's permissions are
re-asserted, and the events and roster are loaded **only if there are no events yet**. To
reload them on purpose (this resets event names, descriptions and benchmarks to what is in
`scripts/seed.ts`, and adds back any seed athlete removed from the roster), run
`npm run aws:db -- --seed` separately. `--with-results` also loads the sample scores; that
is for a demo, never the real event.

## Deploying from GitHub

A push to `main` deploys automatically — `dev` is where you work; merging to `main` ships.
`.github/workflows/deploy.yml` runs the tests, then two jobs:

- **`deploy`** always runs: `npm run deploy -- --ci`, the same script a laptop runs, as
  `rva4neva-olympics-github-deploy`.
- **`migrate`** runs only when the push touched `drizzle/`, or touched `scripts/seed.ts`
  before the event has started (checked by diffing the push against what was running before
  it, and by calling `hasStarted()` — see the workflow file): `npm run aws:db -- --ci`, as
  a *different* role, `rva4neva-olympics-github-migrate`. When it's the seed.ts case, `--seed`
  is appended too.

**Why two roles, not one.** `deploy`'s role cannot read the database's credentials or reach
it at all — a compromised dependency pulled in during an ordinary code deploy is limited to
shipping bad app code, not touching the database directly. `migrate`'s role can do both, but
only exists to, and only runs when a push actually changes the schema (rare) or touches the
seed data pre-kickoff. See `infra/cdk/lib/ci-stack.ts` for the exact permissions each gets.

**Auto-reseeding stops the moment the event starts.** `aws:db --seed` resets every event's
name, description and benchmarks to whatever is in `scripts/seed.ts` — harmless before
kickoff, since nothing real depends on it yet. Once the event is live, someone may have
retuned a benchmark through the site's own "Adjust scoring scale" form, and an unrelated
commit that happens to touch `scripts/seed.ts` (a bio typo, say) auto-reseeding would
silently overwrite that. So this only ever auto-reseeds pre-kickoff (`SITE.startsAt` in
`src/lib/site.ts`); after that, a seed.ts-only push does nothing to the database, and
reseeding on purpose means running `npm run aws:db -- --seed` by hand.

**Identity, not keys, for both.** Each role is assumed over OIDC: GitHub mints a short-lived
token for the job, and the role's trust policy checks it against one exact string —
`repo:brothabear77/rva4neva-olympics:ref:refs/heads/main` — so a workflow run for a pull
request, a fork, or any other branch is refused before it can call AWS at all.

**`--ci` changes where the admin IP comes from, for `deploy`.** A laptop run detects your
machine's address and saves it to SSM (`/rva4neva-olympics/admin-ip`); a CI `deploy` reads
that saved value back instead of detecting its own — a GitHub runner's address is different
every time and reaching nothing you'd ever want to reach directly. Without this, a CI deploy
would overwrite your saved address with an unreachable one and you'd lose `psql` access until
your next laptop deploy restored it. Practically: **the admin IP only ever changes from your
laptop.**

**`--ci` means something different for `migrate`: open a rule, use it, close it again.** The
database only ever admits the app, one admin IP, and — for the few minutes a `migrate` job
runs — that job's own runner address, added and removed by the job itself
(`authorizeTemporaryIngress`/`revokeTemporaryIngress` in `scripts/aws-db.ts`). It never
touches the persisted admin-ip rule. If a job is killed mid-run, its temporary rule can be
left behind; `aws-db.ts` warns with the exact `aws ec2 revoke-security-group-ingress` command
to remove it by hand.

**Column renames are still a real, if brief, exception.** `migrate` runs after `deploy`, in
the same workflow run, so a migration that only adds something (a column, a table) is
harmless either order — old code ignores a column it doesn't know about yet. A rename or
drop is breaking in both directions for the short window between the two jobs finishing;
nothing here makes that instantaneous, it just replaces "however long a human takes to
notice and run `aws:db` by hand" with "however long the next job in the same run takes."

**Setup, done once, and again whenever `ci-stack.ts` changes:**

```bash
cd infra/cdk && npx cdk deploy OlympicsCi
```

Creates or updates both roles above. CI cannot create the roles it needs in order to run, so
this one stack is always deployed by hand.

**If a CI deploy fails**, the same log locations and failure modes apply as any other deploy —
see *When a deploy fails*, below. One CI-specific case: if `/rva4neva-olympics/admin-ip` was
ever deleted (via `npm run deploy -- --no-admin-ip`) without a later laptop deploy restoring
it, CI reports "nothing saved" and deploys with the database reachable from the app only —
not a failure, just worth noticing in the log if you expected laptop access to still work.

## What the database allows

The database security group admits exactly two sources on port 5432: the app, and one admin IP
address. `npm run deploy` finds this machine's public address and sets the rule to it.

If your address changes (a new network, a new ISP lease), `npm run aws:db` will time out with a
message saying so. Run `npm run deploy` again from where you are now, or name the address:

```bash
npm run deploy -- --admin-ip=203.0.113.7
```

The database is "publicly accessible", meaning its hostname also resolves to a public address,
which is what lets you reach it from home. The security group is what keeps everyone else out,
and it refuses every other address. To close direct access altogether, deploy with
`npm run deploy -- --no-admin-ip`: then only the app can connect, and `deploy.ts` skips its
usual automatic `aws-db.ts` step at the end rather than run it knowing it will fail.

The app connects as `olympics_app`, not as the owner. It can read and write scores; it cannot
change the schema, and it cannot write to `audit.change_log` (the triggers record changes with
their own rights, and `drizzle/0001_audit_triggers.sql` blocks rewriting history for every role,
the owner included). `aws:db` checks these permissions each run and stops if they are wrong.

TLS is verified in full. Node does not trust Amazon's certificate authority by default, so the
image carries the public RDS CA bundle in `certs/` and starts with `NODE_EXTRA_CA_CERTS` pointing
at it. Without that, every connection is refused with "unable to verify the first certificate".
The bundle is public and refreshed by Amazon rarely; to update it:

```bash
curl -o certs/rds-global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
```

Use `sslmode=verify-full` in any connection string for Aurora. Older advice says `sslmode=require`
is the minimum, but `pg` 8 treats `require` as full verification too, so the two behave the same
and the explicit one says what happens.

## Staff logins

The site's Admin and Scorekeeper logins aren't tied to an athlete, so they're made by hand
rather than claimed. After the first deploy that includes the accounts tables:

```bash
npm run auth:staff -- Admin --prod
npm run auth:staff -- Scorekeeper --prod
```

`--prod` connects the way `aws:db` does (owner credentials from Secrets Manager, TLS checked
against `certs/`), so it only works from the admin IP address. It prints the database it's about
to write to and asks you to type the login's name before changing anything. Running it again for
an existing login sets a new password and signs that login out everywhere. Without `--prod` it
writes to your local database instead.

## A paused database

With a minimum of 0 ACU, Aurora pauses after five idle minutes and costs only its storage. The
next connection wakes it, which takes about 15 seconds. The app's connection timeout is 30
seconds in production for this reason, so the first visitor after a quiet spell waits a moment
instead of seeing an error. It also releases idle connections after 10 seconds, because Aurora
cannot pause while any connection is open.

Two things look alarming and are not:

- A log line, "An idle database connection was closed", whenever the database pauses or
  restarts. The pool discards the dead connection and opens a new one on the next query.
- The health check (`/api/health`) never touches the database, on purpose. If it did, a sleeping
  Aurora would look like a broken app and App Runner would restart it in a loop that fixes nothing.

## Looking at the database

```bash
# the owner's connection details
aws secretsmanager get-secret-value --secret-id rva4neva/database-master \
  --query SecretString --output text

PGSSLMODE=verify-full PGSSLROOTCERT=certs/rds-global-bundle.pem \
  psql "host=<endpoint from the secret> user=olympics dbname=olympics"
```

This works only from the admin IP address. App logs are in the App Runner console for the
`rva4neva-olympics` service.

## Cost

Estimates from memory, not live pricing, so check the AWS pricing pages before relying on them:

| | Idle | During the event |
|---|---|---|
| App Runner, one instance | about $3 to $6 a month | a few cents more |
| Aurora at 0 ACU | storage only, cents | about $0.12 per ACU-hour awake |
| NAT instance (`t4g.nano` + its public IPv4 address) | about $7 a month | same |
| ECR, Secrets Manager | under $1 a month | same |

The server's outbound calls are to LaunchDarkly (feature flags) and Spotify (walkout song
search). They go through a NAT *instance* rather than a managed NAT gateway (about $32 a
month) for the sake of two small streams of traffic. There is no load balancer: App Runner
brings its own HTTPS front end.

## Feature flags

Flags live in LaunchDarkly (project `default`); `src/lib/flags.ts` lists the ones the site
reads. Today that is one: `submission-lock`. On, and the scores are frozen: nobody can submit
scores, delete them (including deleting an athlete, which removes their scores), or restore a
change from the history. The buttons are disabled under a red banner and the server refuses
the actions too. Adding or renaming an athlete and retuning an event's scale still work. Flip it in LaunchDarkly's **Production** environment. The site picks the change
up within seconds, no deploy needed.

**The production SDK key is set by hand, once.** CloudFormation creates the secret with a
placeholder, which the app treats as no key at all (every flag falls back to its default,
so submissions stay open). Copy the SDK key from LaunchDarkly (project `default` →
Environments → Production), then, without putting it in your shell history:

```bash
read -rs LD_KEY; f=$(mktemp); printf %s "$LD_KEY" > "$f"
aws secretsmanager put-secret-value --secret-id rva4neva/launchdarkly-sdk-key --secret-string "file://$f"
rm "$f"; unset LD_KEY
aws apprunner start-deployment --service-arn <ServiceArn, from the stack outputs>
```

The restart is needed because App Runner reads secrets only when an instance starts.

**If LaunchDarkly can't be reached** (the NAT instance is being replaced, or LaunchDarkly
itself is down), running instances keep the last flag values they received and reconnect on
their own; an instance that starts during the outage uses each flag's default.

**The NAT instance heals itself.** Its Auto Scaling group always holds exactly one instance.
The private subnets route to a fixed network interface rather than to the instance, and
whichever instance is running attaches it at boot, so a replacement takes a few minutes and
needs nothing from you. The AMI is pinned in `olympics-stack.ts`, with the command for
finding a newer one next to it.

## Walkout songs

Each athlete on `/info/athletes` can have a walkout song: a play button beside their name,
and a chevron that opens a search box. Songs are found through the Spotify Web API
(`src/lib/spotify.ts`, the Client Credentials flow, so nobody signs in to anything) and
stored in `app.walkout_songs`. Playing one opens Spotify's own embedded player in the
visitor's browser.

Two things are deliberately different from the rest of the site's data. **Choosing a song is
not recorded in Change History**, because the table has no audit trigger (a song is not a
score). And it is **not frozen by the `submission-lock` flag**. The one gap: undoing an
athlete's deletion from Change History brings back the athlete and their scores, but not the
song.

**The Spotify credentials are set by hand, once.** Create the app at
developer.spotify.com/dashboard (it is called "#rva4neva-olympics"), copy its Client ID and
Client secret, and store them as one JSON secret. CloudFormation creates it holding
placeholders, which the app treats as no credentials at all: the search button is hidden
and nothing else changes.

**Deploy first.** The secret does not exist until a deploy has created it, and
`put-secret-value` before that fails with `ResourceNotFoundException`. So the order is:
deploy (this creates the secret with placeholders), then run the commands below, which
overwrite the placeholders and restart the app.

```bash
read -r  SP_ID;  read -rs SP_SECRET; f=$(mktemp)
printf '{"clientId":"%s","clientSecret":"%s"}' "$SP_ID" "$SP_SECRET" > "$f"
aws secretsmanager put-secret-value --secret-id rva4neva/spotify-credentials --secret-string "file://$f"
rm "$f"; unset SP_ID SP_SECRET
aws apprunner start-deployment --service-arn <ServiceArn, from the stack outputs>
```

The restart is needed because App Runner reads secrets only when an instance starts.
Locally, the same two values go in `.env.local` as `SPOTIFY_CLIENT_ID` and
`SPOTIFY_CLIENT_SECRET`.

**If Spotify can't be reached** (the NAT instance is being replaced, or Spotify is down),
searching says so and nothing else is affected. Songs already chosen keep playing, because
their player loads straight from Spotify in the visitor's browser and never touches the NAT.
Album art in the results does the same.

## Custom domain

The site also answers at **www.rva4nevaoly.com** (root `rva4nevaoly.com` redirects there),
bought outside AWS at GoDaddy. Nothing in the app needed to change — nothing in `src/`
hardcodes its own URL — so this is entirely AWS and DNS configuration.

**Why the root domain isn't the "real" one.** App Runner hands out a `CNAME` target, and
standard DNS refuses a `CNAME` at a domain's apex/root — only on a subdomain. GoDaddy has
no `ALIAS`/`ANAME` record to work around that, so the root can't point at App Runner
directly. GoDaddy's own answer is **Domain Forwarding**: an HTTP redirect from the root to
the subdomain that carries the real record. So `www.rva4nevaoly.com` is what App Runner
actually serves; `rva4nevaoly.com` is a signpost pointing to it.

**How it's associated.** Not through CDK — this CDK version (aws-cdk-lib 2.270) has no
CloudFormation resource for an App Runner custom domain, so it's a one-time imperative
step, not part of `scripts/deploy.ts`:

```bash
aws apprunner associate-custom-domain \
  --service-arn <ServiceArn from the stack outputs> \
  --domain-name www.rva4nevaoly.com \
  --no-enable-www-subdomain
```

`--no-enable-www-subdomain` matters: without it, App Runner also tries to provision
`www.www.rva4nevaoly.com` — a real trap, since the flag's default is `true` and it assumes
you're associating a root domain rather than a subdomain that already starts with `www`.

The command returns a `DNSTarget` (what `www` should `CNAME` to — as of this writing,
`vh6bk3ptpt.us-east-1.awsapprunner.com`, the same address as the plain App Runner URL) and,
once status moves past `creating`, a set of `CertificateValidationRecords` — `CNAME`s that
prove domain ownership to AWS Certificate Manager before it will issue the certificate.
These are unique to each association and were entered by hand into GoDaddy's DNS manager;
they aren't reproduced here since redoing the association generates a fresh set. To see the
current ones:

```bash
aws apprunner describe-custom-domains --service-arn <ServiceArn>
```

**Check status:**

```bash
aws apprunner describe-custom-domains --service-arn <ServiceArn> \
  --query 'CustomDomains[0].[DomainName,Status]'
```

Goes `creating` → `pending_certificate_dns_validation` → `active`, the last step happening
on its own once GoDaddy's records are live and AWS Certificate Manager can see them — DNS
propagation is usually minutes, occasionally up to an hour. Once `active`, AWS manages the
certificate's renewal the same as it does for the default `awsapprunner.com` address —
nothing to maintain here.

**To remove it:** `aws apprunner disassociate-custom-domain --service-arn <ServiceArn>
--domain-name www.rva4nevaoly.com`, then delete the three records and the forwarding rule in
GoDaddy.

## Design notes

- **Public subnets.** Reaching Aurora from a laptop needs a route to the internet, so the subnets
  are public and the security group does the protecting. Fully private subnets would mean running
  migrations and `psql` from a bastion or a one-off container instead.
- **1 GB of memory, not 512 MB.** `next/image` decodes whole photos in memory, and one large phone
  photo is uncomfortable in half a gigabyte.
- **The app's secret is read when an instance starts.** `aws:db` therefore ends with a new App
  Runner deployment. If you change the secret by hand, run:
  `aws apprunner start-deployment --service-arn <ServiceArn from the stack outputs>`
- **CloudFormation owns the placeholder, not the value.** The stack creates
  `rva4neva/app-database-url` holding `not-provisioned-yet`, and `aws:db` overwrites it.
  CloudFormation leaves it alone on later deploys because the template's value never changes;
  do not edit that placeholder in the stack.
- **Deploys are explicit.** App Runner does not watch the registry, so pushing an image changes
  nothing until `npm run deploy` points the service at it.

## When a deploy fails

App Runner's own errors are terse. The useful detail is in CloudWatch, and it survives a failed
deploy even though the service does not:

```bash
aws logs tail /aws/apprunner/rva4neva-olympics/<service id>/service --since 1h
aws logs tail /aws/apprunner/rva4neva-olympics/<service id>/application --since 1h
# the service ids present, including ones from failed attempts:
aws logs describe-log-groups --log-group-name-prefix /aws/apprunner \
  --query 'logGroups[].logGroupName' --output text
```

The `service` log is App Runner's account of the deployment; `application` is what the app
itself printed.

Two messages that have come up already:

- **"Health check failed. Check your configured port number."** while the app log says Next is
  ready. App Runner sets `HOSTNAME` in the container to the instance's name, and Next's
  standalone server listens on whatever `HOSTNAME` says — one address, so the health check,
  arriving on another, is refused. The Dockerfile's last line forces `HOSTNAME=0.0.0.0` after
  anything the platform injects. If the app log shows `Local: http://ip-10-…` instead of
  `http://localhost:8080`, that protection has been lost.
- **"Failed to create App Runner instances due to low vCPU limit."** Worth checking, but it has
  appeared alongside an unrelated failure with the quota nowhere near reached. The real number:
  `aws service-quotas get-service-quota --service-code fargate --quota-code L-3032A538`
  (App Runner instances run on Fargate capacity, 0.25 vCPU each here, against a default of 6).

A **first** deploy that fails leaves `OlympicsSite` in `ROLLBACK_COMPLETE`, an empty shell that
CloudFormation cannot update. `npm run deploy` detects it and prints the fix:

```bash
aws cloudformation delete-stack --stack-name OlympicsSite
aws cloudformation wait stack-delete-complete --stack-name OlympicsSite
```

Rollback removes what it created, so this is safe; if the database had been created, its final
snapshot is kept, and `aws rds describe-db-cluster-snapshots --snapshot-type manual` lists any
left over from failed attempts. They cost a little each month, and deleting an empty one loses
nothing.

An older App Runner service log warning said the VPC connector used public subnets, advising
private ones "to avoid connection failures when accessing the internet". The connector is in
the private subnets now, with the NAT instance as its way out, so it no longer applies. If it
comes back, the connector's subnets have been changed.

## Tearing it down

```bash
cd infra/cdk
npx cdk destroy OlympicsSite       # the database takes a final snapshot first
npx cdk destroy OlympicsRegistry   # deletes the images too; they rebuild from the code
```

The snapshot stays (cents a month) until you delete it, so removing the infrastructure never
loses the scores. Secrets Manager holds a deleted secret for a recovery window, and a redeploy
under the same name is refused until it ends. To skip the wait:

```bash
aws secretsmanager delete-secret --secret-id rva4neva/database-master --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id rva4neva/app-database-url --force-delete-without-recovery
```

## Not set up

- **Branch protection requiring the `test` job to pass before a merge.** That's a GitHub
  repository setting, not a file here.

## Vlog media (not provisioned yet)

Videos on the Vlog page will be stored in S3. **No bucket exists yet, on purpose**: it is
created once athletes start claiming their profiles. Until then the app is ready but inert:
`src/lib/vlogMedia.ts` reads `VLOG_MEDIA_BUCKET`, and while that is unset (or the
placeholder `not-provisioned-yet`) `vlogMediaConfigured()` is false and the upload form
stays disabled.

Objects will be keyed `vlog/<athlete id>/<uuid>.<ext>` (mp4, mov or webm, at most 500 MB).

When it is time:

1. In `SiteStack`, add a private `s3.Bucket` (block all public access, SSE-S3, `enforceSSL`,
   a CORS rule allowing `PUT` and `GET` from the site's origin, and `RemovalPolicy.RETAIN`
   so tearing down the stack never deletes anyone's videos).
2. `bucket.grantReadWrite(instanceRole)`, and add `{ name: "VLOG_MEDIA_BUCKET", value: bucket.bucketName }`
   to `runtimeEnvironmentVariables`. The bucket name is not a secret.
3. Add `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` and write the upload action:
   the browser uploads straight to S3 with a presigned `PUT`, so videos never pass through
   App Runner's 1 GB instance. Playback uses presigned `GET`s (or CloudFront, if traffic needs it).
4. S3 is reached from the private subnets through the NAT instance; add a gateway VPC
   endpoint for S3 (free) so large uploads don't flow through it.
5. A `vlog_videos` table for title, athlete, optional event and object key.

