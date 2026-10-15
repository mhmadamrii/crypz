# syntax=docker/dockerfile:1
# Build from the repo root:  docker build -f packages/api/Dockerfile .

# 1. Install the api's slice of the workspace with pnpm and generate the Prisma client.
FROM node:22-slim AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/api/package.json packages/api/
COPY packages/db/package.json packages/db/
COPY packages/exchanges/package.json packages/exchanges/
RUN pnpm install --frozen-lockfile --filter @crypz/api... --ignore-scripts
COPY packages/db packages/db
COPY packages/exchanges packages/exchanges
COPY packages/api packages/api
# generate needs a syntactically valid URL only; nothing connects at build time
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @crypz/db exec prisma generate

# 2. Run on Bun.
FROM oven/bun:1.3-slim AS api
WORKDIR /app
COPY --from=deps /app /app
ENV NODE_ENV=production PORT=3001
EXPOSE 3001
USER bun
WORKDIR /app/packages/api
CMD ["bun", "src/index.ts"]
