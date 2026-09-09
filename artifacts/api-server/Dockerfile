# Multi-stage Dockerfile: build frontend (Vite) and backend (api-server),
# then produce a small runtime image.
#
# The image builds the monorepo using pnpm, builds the frontend and
# api-server, and copies the built frontend into the server image.
#
# IMPORTANT:
# db/bootstrap.sql is also copied into the runtime image because the
# production database bootstrap code needs it when initializing a fresh
# database.

FROM node:20-bullseye AS builder

# Enable corepack and prepare pnpm
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

WORKDIR /workspace

# Copy workspace manifests first for better Docker layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy the complete project because the workspace builds need all source files
COPY . .

# Install workspace dependencies
RUN pnpm install --frozen-lockfile

# Build frontend
WORKDIR /workspace/artifacts/gy-data
RUN pnpm run build

# Build api-server
WORKDIR /workspace/artifacts/api-server
RUN pnpm run build


# ============================================================
# Production runtime image
# ============================================================

FROM node:20-bullseye-slim AS runtime

# Create non-root application user
RUN groupadd -r app && useradd -r -g app app

WORKDIR /app

# ------------------------------------------------------------
# Backend
# ------------------------------------------------------------

# Copy compiled backend
COPY --from=builder --chown=app:app \
  /workspace/artifacts/api-server/dist \
  ./dist

# Copy backend package manifest
COPY --from=builder --chown=app:app \
  /workspace/artifacts/api-server/package.json \
  ./package.json

# ------------------------------------------------------------
# Frontend
# ------------------------------------------------------------

# Copy compiled frontend
COPY --from=builder --chown=app:app \
  /workspace/artifacts/gy-data/dist \
  ./public

# ------------------------------------------------------------
# Dependencies
# ------------------------------------------------------------

# Copy workspace node_modules from builder
# so the runtime does not need to install packages again.
COPY --from=builder --chown=app:app \
  /workspace/node_modules \
  ./node_modules

# ------------------------------------------------------------
# Database bootstrap
# ------------------------------------------------------------

# database-bootstrap.ts searches several locations for this file,
# including /app/db/bootstrap.sql when the application runs from /app.
#
# The previous runtime image did NOT contain db/bootstrap.sql.
# That could cause a fresh production database initialization to fail.
COPY --from=builder --chown=app:app \
  /workspace/db/bootstrap.sql \
  ./db/bootstrap.sql

# ------------------------------------------------------------
# Runtime configuration
# ------------------------------------------------------------

USER app

ENV NODE_ENV=production

# Render supplies PORT automatically in production.
# This remains as a safe default for environments where PORT is not supplied.
ENV PORT=3000

EXPOSE 3000

# Start the compiled API server
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
