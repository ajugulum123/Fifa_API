# Multi-stage Dockerfile for the FIFA Player Stats GraphQL API.
# Stage 1 installs dev deps and compiles TypeScript.
# Stage 2 is a slim runtime with prod deps only and runs as non-root.
# Final image is roughly 200MB and starts in under 2 seconds on a laptop.

ARG NODE_VERSION=20.18.1

############################################################
# Stage 1: build
############################################################
FROM node:${NODE_VERSION}-bookworm-slim AS build

WORKDIR /app

# Install build deps. dumb-init goes into the runtime stage so we install
# nothing here that we cannot use to compile TypeScript.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Copy lockfile first so npm ci uses the build cache when only source changed.
COPY package.json package-lock.json ./

# Install ALL deps (including dev) so we can run tsc.
RUN npm ci --no-audit --no-fund

# Copy source and config
COPY tsconfig.json ./
COPY src ./src
COPY graphql ./graphql

# Compile TS to dist/
RUN npm run build

# Trim node_modules to prod-only after the build. We will copy this into the
# runtime stage. Doing it here means the runtime stage never has tsc, ts-node
# or any of the test tooling.
RUN npm prune --omit=dev

############################################################
# Stage 2: runtime
############################################################
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

# dumb-init handles PID 1 signal forwarding properly. SIGTERM from kubelet
# gets forwarded to node, which triggers our graceful shutdown.
RUN apt-get update \
 && apt-get install -y --no-install-recommends dumb-init ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --gid 10001 app \
 && useradd --uid 10001 --gid app --shell /bin/bash --create-home app

WORKDIR /app

# Copy compiled JS, prod deps, the GraphQL schema and the player dataset.
# The dataset is small (under 1MB) so baking it into the image keeps deploys
# atomic. Swap to a ConfigMap or PVC if the dataset grows past a few MB.
COPY --chown=app:app --from=build /app/node_modules ./node_modules
COPY --chown=app:app --from=build /app/dist ./dist
COPY --chown=app:app --from=build /app/graphql ./graphql
COPY --chown=app:app dataset ./dataset
COPY --chown=app:app package.json ./

# Default runtime configuration. All overridable from the Deployment env.
ENV NODE_ENV=production \
    DISABLE_INLINE_TLS=true \
    PORT=4000 \
    GRAPHQL_MAX_DEPTH=6 \
    DISABLE_INTROSPECTION=true \
    RATE_LIMIT_WINDOW_MS=60000 \
    RATE_LIMIT_MAX=100

USER app
EXPOSE 4000

# Healthcheck for non-Kubernetes runtimes (docker run, docker compose).
# Kubernetes uses the readiness/liveness probes defined on the Deployment instead.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${PORT}/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
