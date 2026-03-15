# Build stage
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source and config files
COPY tsconfig.json tsdown.config.ts ts-builds.config.json ./
COPY src/ ./src/

# Build the application using tsdown directly with dist output
RUN pnpm exec tsdown --outDir dist

# Production stage
FROM node:22-alpine AS production

# Install pnpm for production install
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Set environment variables
ENV NODE_ENV=production

# Expose port for HTTP mode
EXPOSE 3000

# Default command runs in HTTP mode
ENTRYPOINT ["node", "dist/index.js"]
CMD ["--transport", "http", "--port", "3000"]
