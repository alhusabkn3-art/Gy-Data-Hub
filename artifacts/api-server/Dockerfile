# Multi-stage Dockerfile: build frontend (Vite) and backend (api-server), then produce a small runtime image.
# The image builds the monorepo using pnpm, builds the frontend at artifacts/gy-data,
# builds the api-server, and copies the built frontend into the server image under /app/public
# which the Express server will serve (FRONTEND_DIST_DIR defaults to public).

FROM node:20-bullseye AS builder

# Enable corepack and prepare pnpm
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
WORKDIR /workspace

# Copy workspace manifests first for caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy everything (we need sources for builds)
COPY . .

# Install workspace dependencies
RUN pnpm install --frozen-lockfile

# Build frontend (artifacts/gy-data)
WORKDIR /workspace/artifacts/gy-data
RUN pnpm run build

# Build api-server
WORKDIR /workspace/artifacts/api-server
RUN pnpm run build

# Production runtime image
FROM node:20-bullseye-slim AS runtime

# Create non-root user and set working dir
RUN groupadd -r app && useradd -r -g app app
WORKDIR /app

# Copy built server and frontend
COPY --from=builder --chown=app:app /workspace/artifacts/api-server/dist ./dist
COPY --from=builder --chown=app:app /workspace/artifacts/api-server/package.json ./package.json
COPY --from=builder --chown=app:app /workspace/artifacts/gy-data/dist ./public

# Copy node_modules from builder to avoid reinstalling in runtime
COPY --from=builder --chown=app:app /workspace/node_modules ./node_modules

USER app
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "--enable-source-maps", "dist/index.mjs"]
