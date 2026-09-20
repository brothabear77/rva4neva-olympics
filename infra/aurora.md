# Aurora Serverless v2 — provisioning and deploy

The app talks to Postgres over an ordinary TCP connection (`pg` + Drizzle), so
Aurora needs a reachable endpoint and the app needs credentials. Nothing here is
required for local development — `docker compose up -d db` covers that.

> The AWS CLI is installed but this machine's session was expired when the
> project was built. Run `aws login` (or `aws sso login`) before starting.

## 1. Cluster

```bash
aws rds create-db-cluster \
  --db-cluster-identifier rva4neva-olympics \
  --engine aurora-postgresql \
  --engine-version 17.4 \
  --master-username olympics \
  --manage-master-user-password \
  --serverless-v2-scaling-configuration MinCapacity=0,MaxCapacity=2 \
  --database-name olympics \
  --no-publicly-accessible

aws rds create-db-instance \
  --db-instance-identifier rva4neva-olympics-1 \
  --db-cluster-identifier rva4neva-olympics \
  --engine aurora-postgresql \
  --db-instance-class db.serverless
```

`MinCapacity=0` lets the cluster idle to nothing between the two event days,
which is most of its life. Expect a few seconds of cold start on the first
request after a quiet stretch — acceptable for this, and worth the cost.

`--manage-master-user-password` puts the password in Secrets Manager rather than
your shell history.

## 2. Reaching it

A direct connection needs a network path. Pick one:

- **RDS Proxy (recommended).** Serverless functions each open their own
  connection, and Aurora at low capacity does not have many to give. The proxy
  pools them. Create it in the same VPC, point it at the cluster, and use its
  endpoint as the host in `DATABASE_URL`. Keep `DATABASE_POOL_MAX=1` so each
  function instance holds one connection.
- **Public endpoint.** Simpler, but then the security group is the only thing
  between the database and the internet. If you go this way, restrict the
  inbound rule to your host's egress addresses and keep `sslmode=require`.
- **Host the app in the VPC** (Amplify Hosting or App Runner) and keep the
  cluster private. Tightest, most setup.

TLS is required either way. `?sslmode=require` in the URL is the minimum;
`verify-full` with the RDS CA bundle is better if you want certificate
validation.

## 3. Roles

Two roles, so the application cannot reshape the schema and cannot rewrite
history:

```sql
-- Run as the master user.
CREATE ROLE olympics_app LOGIN PASSWORD '...';

GRANT USAGE ON SCHEMA app TO olympics_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO olympics_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO olympics_app;

-- Read-only on history. The audit trigger runs SECURITY DEFINER, so it still
-- writes even though the app role itself cannot.
GRANT USAGE ON SCHEMA audit TO olympics_app;
GRANT SELECT ON audit.change_log TO olympics_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON audit.change_log FROM olympics_app;
```

The append-only triggers in `drizzle/0001_audit_triggers.sql` stop UPDATE,
DELETE and TRUNCATE on `audit.change_log` for *every* role, the master user
included. These grants are the second layer, not the only one.

## 4. Migrate and seed

```bash
export DATABASE_URL="postgresql://olympics_app:...@<proxy-endpoint>:5432/olympics?sslmode=require"
npm run db:migrate          # run as a role that owns the schema
npm run db:seed             # events + roster; add --with-results for sample data
```

Migrations create the schema and must run as an owner, so use the master
credentials for `db:migrate` and the app role at runtime.

## 5. Deploy

Set on the host (Vercel project settings, or equivalent):

| Variable | Value |
|---|---|
| `DATABASE_URL` | the app-role connection string, `sslmode=require` |
| `DATABASE_POOL_MAX` | `1` |

Leave `DATABASE_SSL` unset in production — it exists only to turn TLS *off* for
the local Docker container.

Every page that reads scores is `dynamic = "force-dynamic"`, so nothing is
cached at build time and the leaderboard is always current.

## Cost

At `MinCapacity=0` the cluster costs storage only while idle (cents per month at
this size), and roughly $0.12 per ACU-hour while awake. Two event days of light
traffic is a few dollars. RDS Proxy adds an hourly charge while provisioned —
if that matters, create it the week of the event and delete it afterwards.
