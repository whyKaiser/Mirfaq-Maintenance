# مِرفق — production image.
#
# One process serves both the API and the built web client (SERVE_CLIENT=1),
# so a single container is a complete deployment.
#
#   docker build -t mirfaq .
#   docker run -p 5000:5000 --env-file .env mirfaq
#
# Run behind a TLS-terminating proxy: session cookies are marked Secure in
# production, so over plain HTTP the browser drops them and every request looks
# logged out. The proxy must forward X-Forwarded-Proto.
#
# Apply migrations once per deploy, before or just after the container starts:
#   docker compose exec app node ./scripts/prisma-schema.mjs migrate deploy

# ─── build ────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

# Manifests first, so dependency installation caches independently of sources.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/mirfaq/package.json ./artifacts/mirfaq/
COPY artifacts/mockup-sandbox/package.json ./artifacts/mockup-sandbox/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/db/package.json ./lib/db/
COPY scripts/package.json ./scripts/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

# `pnpm deploy` flattens the workspace package into a self-contained directory.
# The server bundle keeps @prisma/client and @aws-sdk/* external, and in a pnpm
# workspace those resolve inside artifacts/api-server — copying only the root
# node_modules would leave them unresolvable at runtime.
#
# Dev dependencies are kept: the Prisma CLI is one, and it is needed both to
# generate the client below and to run `migrate deploy` against the live
# database at release time.
RUN pnpm deploy --filter=@workspace/api-server --legacy /deploy

# The Prisma client is provider-specific. MIRFAQ_DB_URL only selects which
# schema is used here; the real connection string is supplied at runtime.
ARG MIRFAQ_DB_URL=file:./.data/build.db
RUN cd /deploy \
 && MIRFAQ_DB_URL=$MIRFAQ_DB_URL node ./scripts/prisma-schema.mjs generate

# ─── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=5000
ENV SERVE_CLIENT=1
ENV CLIENT_DIST_PATH=/app/client

WORKDIR /app

# Prisma needs OpenSSL at runtime.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable

COPY --from=build --chown=node:node /deploy ./
COPY --from=build --chown=node:node /app/artifacts/mirfaq/dist/public ./client

# Local-storage deployments keep attachments here; mount a volume so they
# survive container replacement. With STORAGE_PROVIDER=s3 this stays empty.
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
VOLUME ["/app/uploads"]

USER node
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
