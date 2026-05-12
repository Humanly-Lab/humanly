# Admin dashboard (packages/frontend)
# Served at / on admin.writehumanly.net via nginx.

# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# NEXT_PUBLIC_* vars must be available at BUILD time (baked into JS bundle)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_TRACKER_URL
ARG NEXT_PUBLIC_BASE_PATH=

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_TRACKER_URL=$NEXT_PUBLIC_TRACKER_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

COPY package.json ./
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/shared/package.json   ./packages/shared/

RUN corepack enable && pnpm install --frozen-lockfile

COPY packages/shared  ./packages/shared
COPY packages/frontend ./packages/frontend
COPY tsconfig.json ./

RUN pnpm --filter @humanly/shared build
RUN pnpm --filter @humanly/frontend build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/shared/package.json   ./packages/shared/

RUN corepack enable && pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/frontend/.next  ./packages/frontend/.next
COPY --from=builder /app/packages/frontend/public ./packages/frontend/public
COPY --from=builder /app/packages/shared/dist     ./packages/shared/dist

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /app/packages/frontend
CMD ["./node_modules/.bin/next", "start", "-p", "3000"]
