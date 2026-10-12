# Redesign AI – notes for coding agents

Read README.md first. Rules that keep the system safe and correct:

- **No AI-generated JavaScript or CSS ever runs.** Generated HTML goes through `@redesign/sanitizer` (allowlist). Behaviour comes only from the `data-motion` vocabulary in `packages/schema/src/motion.ts`, executed by `packages/motion-runtime`. When you add an effect, update the vocabulary (schema), the runtime handler, the sanitizer tests and the runtime Playwright tests together.
- **Content must stay verbatim.** `packages/ai/src/validate.ts` checks every generated section against `sectionTexts()` of the source. Never weaken it; the last-resort `appendMissingText` must remain.
- **Media and forms are references**, not URLs: `media:<uuid>` (cached in `media` table/storage) and `form:<key>`. The renderer resolves them.
- **Billed work runs only on explicit user action.** Jobs pause on error; never add automatic retries for `analyze/directions/direction/build`. Make new long work an idempotent `ctx.step(key, fn)`.
- **Data access is server-side and scoped by user id** (`apps/web/lib/repo.ts`, worker queries by project/user). RLS stays enabled as defence in depth; extend `supabase/tests/rls.sql` when you add tables or grants.
- **Outbound requests for user-supplied URLs** must go through `safeFetch` / `guardedContext` from `@redesign/crawler` (SSRF guard).
- **Drivers:** auth `password` (own accounts in `auth.users` + `user_credentials`, Google via `/auth/google`) | `supabase` | `dev` (refused in production); storage `s3` (private bucket, media served by `/storage/site-media`) | `supabase` | `local`. Defaults are derived from which variables are set (`lib/env.ts`, `apps/worker/src/env.ts`); `/api/health` reports missing ones by name.
- **Migrations** run through `@redesign/migrate` (`pnpm db:migrate`; web pre-deploy and worker start). They must work on plain Postgres and on Supabase: `…000000_platform.sql` creates the Supabase prerequisites only when missing. Never edit an applied migration; add a new file.
- Next.js 16: `proxy.ts` (not middleware), async `params`. Workspace packages imported by the web app must stay bundler-safe (no `new URL(..., import.meta.url)` at module scope, no dynamic `require.resolve`); Node-only helpers live in separate entry points (e.g. `@redesign/fonts/node`).
- Claude API usage: `packages/ai/src/anthropic.ts` (streaming, adaptive thinking, explicit effort, JSON-schema output re-validated with zod, `maxRetries: 0`).
- Checks before pushing: `pnpm typecheck && pnpm lint && pnpm test && bash supabase/tests/run.sh`.
