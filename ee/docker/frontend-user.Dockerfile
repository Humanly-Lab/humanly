# Humanly Cloud Writer Portal composition. Community images use docker/frontend-user.Dockerfile.
FROM node:20-alpine AS builder

WORKDIR /app

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_EDITION=cloud

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_EDITION=$NEXT_PUBLIC_EDITION

RUN test "$NEXT_PUBLIC_EDITION" = "cloud"

COPY package.json ./
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY docker/pnpm-install.sh ./docker/pnpm-install.sh
COPY packages/frontend-user/package.json ./packages/frontend-user/
COPY packages/shared/package.json ./packages/shared/
COPY packages/editor/package.json ./packages/editor/
COPY ee/packages/billing/package.json ./ee/packages/billing/

RUN sh ./docker/pnpm-install.sh --frozen-lockfile

COPY packages/shared ./packages/shared
COPY packages/editor ./packages/editor
COPY packages/frontend-user ./packages/frontend-user
COPY ee/packages/billing ./ee/packages/billing
COPY tsconfig.json ./

RUN pnpm --filter @humanly/shared build
RUN pnpm --filter @humanly/editor build
RUN rm -rf packages/frontend-user/.next \
  && pnpm --filter @humanly/frontend-user build \
  && test -f packages/frontend-user/.next/BUILD_ID

FROM node:20-alpine

WORKDIR /app

ARG NEXT_PUBLIC_EDITION=cloud
ENV NEXT_PUBLIC_EDITION=$NEXT_PUBLIC_EDITION

RUN test "$NEXT_PUBLIC_EDITION" = "cloud"

COPY package.json ./
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY docker/pnpm-install.sh ./docker/pnpm-install.sh
COPY packages/frontend-user/package.json ./packages/frontend-user/
COPY packages/shared/package.json ./packages/shared/
COPY packages/editor/package.json ./packages/editor/

RUN sh ./docker/pnpm-install.sh --frozen-lockfile --prod

COPY --from=builder /app/packages/frontend-user/.next ./packages/frontend-user/.next
COPY --from=builder /app/packages/frontend-user/public ./packages/frontend-user/public
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/editor/dist ./packages/editor/dist

EXPOSE 3002

ENV PORT=3002
ENV HOSTNAME=0.0.0.0

WORKDIR /app/packages/frontend-user
CMD ["./node_modules/.bin/next", "start", "-p", "3002"]
