# ---- build the Mini App (relative API base → same-origin /tma/*) ----
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Workspace manifests (needed to resolve the pnpm graph with --frozen-lockfile)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/cli/package.json apps/cli/
COPY apps/tma/package.json apps/tma/

# Install only what the Mini App needs (tma + its dep @altegio/shared)
RUN pnpm install --frozen-lockfile --filter @altegio/tma...

# Sources
COPY packages/shared/ packages/shared/
COPY apps/tma/ apps/tma/

# Empty base → api.ts issues relative requests (/tma/...), so the SPA is same-origin
# with the API behind the same nginx. No CORS, no hardcoded host.
ENV VITE_API_URL=""
RUN pnpm -F @altegio/shared build && pnpm -F @altegio/tma build

# ---- nginx image serving the built SPA ----
FROM nginx:alpine AS runtime
COPY --from=build /app/apps/tma/dist /usr/share/nginx/html
# nginx.conf is provided at runtime via bind-mount (deploy/nginx.conf).
