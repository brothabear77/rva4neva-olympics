# Container image for the #rva4neva Olympics site.
#
# Build for the machine it will run on, not the one you build on. An Apple-silicon
# laptop builds ARM images by default, and an ARM image will not start on x86 hosts.
# scripts/deploy.ts builds for linux/amd64 for you.
#
# The base image is an argument so a build can pin the exact architecture it wants by
# digest. That matters on a machine without `docker buildx`: the classic builder keeps
# one variant per tag, so a cached ARM `node:22-alpine` cannot be reused for an x86
# build and fails with "does not provide the specified platform".
ARG NODE_IMAGE=node:22-alpine

# --- dependencies -----------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build --------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# src/lib/db.ts reads DATABASE_URL when a module first loads, and `next build` loads
# every route to collect page data. At that point it only builds a connection pool
# object; nothing connects until a query runs, and no page queries during the build.
# So a placeholder is enough. It is set on this one command, in this stage, and never
# reaches the final image, which gets the real value from the host at runtime.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npm run build

# --- runtime ------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0

RUN addgroup -S app && adduser -S app -G app

# Standalone output is the server plus only the node_modules it needs. It leaves out
# static assets on purpose (it expects a CDN to serve them), so both are copied in
# explicitly. Miss either and the site loads with no CSS and no images.
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public

# next/image caches resized images on disk. The app user needs to be able to write there.
RUN mkdir -p .next/cache && chown -R app:app .next/cache

# Aurora's certificates are signed by Amazon's own RDS CA, which Node does not trust by
# default. The database driver verifies the server (certificate and hostname), so without
# this every connection to Aurora is refused with "unable to verify the first certificate".
# Node reads NODE_EXTRA_CA_CERTS once at startup and adds these to its trust store.
COPY --from=build --chown=app:app /app/certs ./certs
ENV NODE_EXTRA_CA_CERTS=/app/certs/rds-global-bundle.pem

USER app
EXPOSE 8080

# Bind every interface, whatever the platform says.
#
# Next's standalone server listens on $HOSTNAME, and App Runner sets that variable to the
# instance's own name (ip-10-0-1-233), overriding the ENV above. The server then listens on
# that one address and refuses the health check, which arrives on another, so the service
# never starts: "Health check failed. Check your configured port number."
#
# Setting it here is after anything injected, so it wins. `exec` leaves node as PID 1, which
# is what receives the stop signal when an instance is replaced.
CMD ["sh", "-c", "exec env HOSTNAME=0.0.0.0 node server.js"]
