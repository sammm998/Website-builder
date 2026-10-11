# Worker image: Playwright's Chromium + system deps, Node 22, the monorepo workspace.
FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile --filter @redesign/worker... \
 && pnpm --filter @redesign/motion-runtime build
ENV NODE_ENV=production \
    CHROMIUM_PATH=/ms-playwright/chromium-1194/chrome-linux/chrome \
    WORKER_PORT=8080
EXPOSE 8080
USER pwuser
CMD ["pnpm", "--filter", "@redesign/worker", "start"]
