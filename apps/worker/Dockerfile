# Worker image: Playwright's Chromium + system deps (browsers in /ms-playwright, matching playwright@1.56.1),
# Node 22 and the monorepo workspace. Build from the repository root:
#   docker build -f apps/worker/Dockerfile .
FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
RUN npm install -g pnpm@10.28.0
COPY . .
RUN pnpm install --frozen-lockfile --filter "@redesign/worker..." \
 && pnpm --filter @redesign/motion-runtime build \
 && chown -R pwuser:pwuser /app
ENV NODE_ENV=production
WORKDIR /app/apps/worker
USER pwuser
# Health endpoint listens on $PORT (Railway) or WORKER_PORT, default 8080.
EXPOSE 8080
# Applies pending migrations, then starts the job loop.
CMD ["./node_modules/.bin/tsx", "src/start.ts"]
