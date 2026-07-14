# Humanly Cloud backend composition. Community images use docker/backend.Dockerfile.
FROM node:20-alpine AS builder

WORKDIR /app

ARG EDITION=cloud
ENV EDITION=$EDITION

RUN test "$EDITION" = "cloud"

COPY package.json ./
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY docker/pnpm-install.sh ./docker/pnpm-install.sh
COPY packages/backend/package.json ./packages/backend/
COPY packages/shared/package.json ./packages/shared/
COPY packages/tracker/package.json ./packages/tracker/
COPY ee/packages/billing/package.json ./ee/packages/billing/

RUN sh ./docker/pnpm-install.sh --frozen-lockfile

COPY packages/shared ./packages/shared
COPY packages/tracker ./packages/tracker
COPY packages/backend ./packages/backend
COPY ee/packages/billing ./ee/packages/billing
COPY tsconfig.json ./

RUN pnpm --filter @humanly/shared build
RUN pnpm --filter @humanly/tracker build
RUN pnpm --filter @humanly-ee/billing build
RUN pnpm --filter @humanly/backend build

FROM node:20-alpine

WORKDIR /app

ARG EDITION=cloud
ENV EDITION=$EDITION

RUN test "$EDITION" = "cloud"

COPY package.json ./
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY docker/pnpm-install.sh ./docker/pnpm-install.sh
COPY packages/backend/package.json ./packages/backend/
COPY packages/shared/package.json ./packages/shared/
COPY ee/packages/billing/package.json ./ee/packages/billing/

RUN sh ./docker/pnpm-install.sh --frozen-lockfile --prod

COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/tracker/dist ./packages/tracker/dist
COPY --from=builder /app/ee/packages/billing/dist ./ee/packages/billing/dist
COPY packages/backend/src/db/migrations ./packages/backend/src/db/migrations
COPY ee/migrations ./ee/migrations

WORKDIR /app/packages/backend

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://127.0.0.1:3001/health',(r)=>{process.exit(r.statusCode===200?0:1)})"

CMD ["node", "dist/index.js"]
