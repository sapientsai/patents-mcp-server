# Build stage
FROM node:22-alpine AS builder

# Install pnpm
# The pnpm version comes from package.json's `packageManager` field, which corepack honours.
# Pinning one here too only creates drift — this pin read 10.32.1 while builds ran 11.27.0.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

# Copy package files
# pnpm-workspace.yaml carries the `overrides` block; without it `--frozen-lockfile` fails with
# ERR_PNPM_LOCKFILE_CONFIG_MISMATCH, because the lockfile records overrides the config lacks.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build (use tsdown directly — ts-builds wrapper needs rimraf in PATH)
RUN rm -rf dist && pnpm exec tsdown --outDir dist

# Production stage
FROM node:22-alpine AS production

# Install pnpm for production deps
# The pnpm version comes from package.json's `packageManager` field, which corepack honours.
# Pinning one here too only creates drift — this pin read 10.32.1 while builds ran 11.27.0.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

# Copy package files
# pnpm-workspace.yaml carries the `overrides` block; without it `--frozen-lockfile` fails with
# ERR_PNPM_LOCKFILE_CONFIG_MISMATCH, because the lockfile records overrides the config lacks.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Set environment defaults
ENV PORT=3000
ENV TRANSPORT=httpStream
ENV HOST=0.0.0.0

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "dist/index.js"]
