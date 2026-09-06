# syntax=docker/dockerfile:1

# Pinned to match .node-version/.nvmrc exactly, the same reproducibility standard
# this repo already holds its other pinned versions to (e.g. better-auth, pnpm).
FROM node:24.13.1-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN corepack enable
# Next.js collects anonymous usage telemetry (https://nextjs.org/telemetry); disabled
# for both the build (this stage/builder) and the running server (runner).
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3100
ENV HOSTNAME="0.0.0.0"
WORKDIR /app

# `pnpm build`'s postbuild script (package.json) already copies public/ and
# .next/static into .next/standalone, so this one COPY brings a fully
# self-contained, correctly-owned server — same output used by `pnpm start` locally.
COPY --from=builder --chown=node:node /app/.next/standalone ./

USER node
EXPOSE 3100

# Uses Node itself rather than curl/wget, neither of which ships in node:alpine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3100)+'/api/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
