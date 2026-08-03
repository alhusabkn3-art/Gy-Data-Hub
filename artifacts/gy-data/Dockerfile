# Multi-stage build for frontend (gy-data)
# Builder stage: install dependencies at workspace root and build the frontend package
FROM node:20-alpine AS builder

# Enable corepack and activate pnpm
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

WORKDIR /app

# Copy lockfile and workspace manifest first for caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy full repository to allow workspace resolution
COPY . .

# Install all workspace dependencies (including dev deps needed for build)
RUN pnpm install --frozen-lockfile

# Build only the frontend package
RUN pnpm --filter @workspace/gy-data run build

# Runner: serve static files with nginx
FROM nginx:alpine AS runner

# Remove default content
RUN rm -rf /usr/share/nginx/html/*

# Copy built site from builder
COPY --from=builder /app/artifacts/gy-data/dist /usr/share/nginx/html

# Expose HTTP
EXPOSE 80

# Run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
