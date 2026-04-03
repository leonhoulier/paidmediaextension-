# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10 --activate

# Copy workspace files (include root tsconfig for shared package build)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared/ packages/shared/
COPY packages/backend/ packages/backend/

# Build shared package
RUN pnpm --filter @media-buying-governance/shared build

# Generate Prisma client
RUN pnpm --filter @media-buying-governance/backend prisma:generate

# Build backend
RUN pnpm --filter @media-buying-governance/backend build

# Stage 2: Production (Debian slim — Prisma needs OpenSSL 1.1/3.x)
FROM node:20-slim AS production

WORKDIR /app

# Install pnpm + OpenSSL for Prisma
RUN corepack enable && corepack prepare pnpm@10 --activate && \
    apt-get update && apt-get install -y openssl wget --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -s /bin/sh nestjs

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/backend/dist packages/backend/dist
COPY --from=builder /app/packages/backend/prisma packages/backend/prisma

# Generate Prisma client for this platform (Debian)
# prisma is a devDep, so install it temporarily, generate, then remove
RUN cd packages/backend && npx prisma@5.22.0 generate && rm -rf /root/.npm

# Create directory for Cloud SQL Unix socket (Cloud Run mounts it here)
RUN mkdir -p /cloudsql && chown nestjs:nodejs /cloudsql

# Switch to non-root user
USER nestjs

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/healthz || exit 1

# Start the application
CMD ["node", "packages/backend/dist/main.js"]
