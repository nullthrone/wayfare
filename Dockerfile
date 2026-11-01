# syntax=docker/dockerfile:1.7
# Wayfare — multi-stage image (Next.js standalone output, SQLite + sharp native modules).

# ---------- deps: install node_modules (build toolchain only lives in this stage) ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Build tools are only needed if better-sqlite3 / sharp have no prebuilt binary for the platform.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# ---------- builder: next build (output: "standalone") ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Config is validated lazily at runtime; a dummy secret keeps build-time imports happy.
RUN WAYFARE_SECRET=build-time-dummy-secret-not-used-at-runtime-0000 npm run build

# ---------- runner ----------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    WAYFARE_RUNTIME=selfhost \
    DATA_DIR=/data

# Standalone server + traced node_modules (incl. better-sqlite3 and sharp natives)
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/messages ./messages

RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
