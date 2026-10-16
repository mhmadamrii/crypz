# syntax=docker/dockerfile:1
# Build from the repo root:  docker build -f packages/api/Dockerfile .

# 1. deps: the api's slice of the workspace with every dependency, plus the generated Prisma client.
#    The `migrate` compose service runs from this stage, because `prisma migrate deploy` needs the CLI.
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

# 2. bundle: Bun folds the api, its workspace packages, deps and the generated Prisma client into one file.
#    node_modules carries better-auth's optional peers (TanStack Start, Vite, the Prisma CLI, TypeScript), which
#    --prod cannot prune under a frozen lockfile; bundling ships only the code the server actually imports.
FROM oven/bun:1-slim AS bundle
WORKDIR /app
COPY --from=deps /app /app
RUN bun build packages/api/src/index.ts --target bun --minify --outfile /out/index.js

# 3. api: the bundle on Bun. Same base tag as the other Bun services on the host, so the layer is stored once.
FROM oven/bun:1-slim AS api
WORKDIR /app
COPY --from=bundle /out/index.js index.js
ENV NODE_ENV=production PORT=3001
EXPOSE 3001
USER bun
CMD ["bun", "index.js"]
