# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Copy the entire workspace source (node_modules and dist excluded via .dockerignore)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/api/src apps/api/src
COPY apps/api/nest-cli.json apps/api/
COPY apps/api/tsconfig.json apps/api/
COPY apps/cli/package.json apps/cli/
COPY apps/cli/src apps/cli/src
COPY apps/cli/tsconfig.json apps/cli/
COPY packages/shared/package.json packages/shared/
COPY packages/shared/src packages/shared/src
COPY packages/shared/tsconfig.json packages/shared/

RUN pnpm install --frozen-lockfile

# Build shared then API
RUN pnpm -F @altegio/shared build
RUN pnpm -F @altegio/api build

# ---- runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Copy workspace manifests and lockfile
COPY --from=build /app/pnpm-lock.yaml ./
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/package.json ./
COPY --from=build /app/tsconfig.base.json ./

# Package manifests
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/cli/package.json ./apps/cli/
COPY --from=build /app/packages/shared/package.json ./packages/shared/

# API compiled output
COPY --from=build /app/apps/api/dist ./apps/api/dist

# API source needed by CLI ts-node imports (../../api/src/... relative paths)
COPY --from=build /app/apps/api/src ./apps/api/src

# CLI source (run via ts-node at runtime)
COPY --from=build /app/apps/cli/src ./apps/cli/src
COPY --from=build /app/apps/cli/tsconfig.json ./apps/cli/

# Shared built output (needed by API at runtime and CLI at compile-time)
COPY --from=build /app/packages/shared/dist ./packages/shared/dist

# Install all workspace deps.
# NODE_ENV is overridden to development here so devDependencies (ts-node, typescript,
# tsconfig-paths) are installed — the CLI runs via ts-node at runtime.
RUN NODE_ENV=development pnpm install --frozen-lockfile --ignore-scripts

COPY apps/api/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# CLI admin usage from a running container:
#   docker exec <container> sh apps/cli/node_modules/.bin/ts-node \
#     -r tsconfig-paths/register --project apps/cli/tsconfig.json \
#     apps/cli/src/main.ts <command> [options]
