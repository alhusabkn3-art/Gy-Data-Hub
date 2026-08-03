# Builder for api-server using pnpm workspace install
FROM node:20-alpine AS builder

# Enable corepack and activate specific pnpm version
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

WORKDIR /app

# Copy lockfile and workspace manifest early for caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy entire repository (we need workspace packages and tooling)
COPY . .

# Install all workspace dependencies (including dev deps for builds)
RUN pnpm install --frozen-lockfile

# Build only the api-server workspace package
RUN pnpm --filter @workspace/api-server run build

# Production runtime image
FROM node:20-alpine AS runtime

# Ensure corepack/pnpm are available in runtime for running scripts
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

WORKDIR /app

# Copy node_modules and built artifacts from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /app/artifacts/api-server/package.json ./artifacts/api-server/package.json

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Use pnpm to run the workspace start script for api-server
CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
