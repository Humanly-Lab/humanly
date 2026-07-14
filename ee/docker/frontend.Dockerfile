# Community counterpart: docker/frontend.Dockerfile; review both when changing shared build or runtime steps.
FROM node:20-alpine AS builder

WORKDIR /app

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_TRACKER_URL
ARG NEXT_PUBLIC_BASE_PATH=
ARG NEXT_PUBLIC_EDITION=cloud

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_TRACKER_URL=$NEXT_PUBLIC_TRACKER_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
ENV NEXT_PUBLIC_EDITION=$NEXT_PUBLIC_EDITION

RUN test "$NEXT_PUBLIC_EDITION" = "cloud"

COPY package.json ./
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY docker/pnpm-install.sh ./docker/pnpm-install.sh
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/shared/package.json ./packages/shared/
COPY ee/packages/billing/package.json ./ee/packages/billing/

RUN sh ./docker/pnpm-install.sh --frozen-lockfile

COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend
COPY ee/packages/billing ./ee/packages/billing
COPY tsconfig.json ./

RUN pnpm --filter @humanly/shared build
RUN rm -rf packages/frontend/.next \
  && pnpm --filter @humanly/frontend build \
  && test -f packages/frontend/.next/BUILD_ID

FROM node:20-alpine

WORKDIR /app

ARG NEXT_PUBLIC_EDITION=cloud
ENV NEXT_PUBLIC_EDITION=$NEXT_PUBLIC_EDITION

RUN test "$NEXT_PUBLIC_EDITION" = "cloud"

COPY package.json ./
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY docker/pnpm-install.sh ./docker/pnpm-install.sh
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/shared/package.json ./packages/shared/

RUN sh ./docker/pnpm-install.sh --frozen-lockfile --prod

COPY --from=builder /app/packages/frontend/.next ./packages/frontend/.next
COPY --from=builder /app/packages/frontend/public ./packages/frontend/public
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /app/packages/frontend
CMD ["./node_modules/.bin/next", "start", "-p", "3000"]
