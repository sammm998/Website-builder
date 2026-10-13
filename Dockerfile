# One image for both Railway services (web and worker), picked up automatically from the repo root.
# Contains Chromium (Playwright base image), Postgres for the all-in-one mode and the whole workspace.
# scripts/launch.mjs decides what to run: see the comment at the top of that file.
FROM mcr.microsoft.com/playwright:v1.56.1-noble

RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql postgresql-contrib \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@10.28.0

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @redesign/motion-runtime build \
 && pnpm --filter @redesign/web build

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "scripts/launch.mjs"]
