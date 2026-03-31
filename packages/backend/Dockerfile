# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8 --activate

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
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

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8 --activate

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

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
COPY --from=builder /app/packages/backend/node_modules/.prisma packages/backend/node_modules/.prisma

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
