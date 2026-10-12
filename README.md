# Redesign AI

Redesign AI tar en befintlig webbplats från en URL och gör om **hela** sajten. Den nya sajten får modern premiumdesign med 3D, skrolleffekter och motion. Allt innehåll, alla bilder, länkar, formulär, URL:er och all SEO bevaras.

```
URL ──▶ 1. Sidor ──▶ 2. Analys ──▶ 3. Design (3 levande riktningar) ──▶ 4. Webbplats ──▶ /site/:slug eller egen domän
        crawl          AI + SEO        riktig kod med motion               bygge + visuell QA + översättning
```

## Varför den här arkitekturen

Prototypen genererade **designbilder** och försökte sedan översätta dem till kod med en fast mall, och resultatet liknade inte bilden. Här är designförslagen i stället **riktig kod från början**. Claude skriver designsystem, header, hero och sektioner som sanerad HTML/Tailwind med deklarativa rörelseeffekter. Den riktning kunden godkänner *är* koden, och hela sajten byggs vidare på samma system.

Effekterna (WebGL, pinnade skrollberättelser, split text, parallax, 3D-tilt …) körs av en egen, granskad **motion-runtime**. AI:n skriver aldrig JavaScript, den väljer bara effekter via `data-motion`-attribut som valideras.

## Monorepo

| Paket | Ansvar |
|---|---|
| `apps/web` | Next.js 16: startsida, inloggning, dashboard, wizard, förhandsvisningar, publicerade sajter (`/site/:slug`, subdomäner, egna domäner), formulär-endpoint |
| `apps/worker` | Node-tjänst med Playwright. Kör alla långa jobb via en Postgres-kö: crawl, analys, riktningar, bygge, QA och publicering |
| `packages/schema` | Zod-scheman: källinnehåll, designsystem, motion-vokabulär, genererade sektioner |
| `packages/sanitizer` | Allowlist-sanering av AI-HTML (`media:`/`form:`-referenser, embed-allowlist, motion-attribut), plus segmentbaserad översättning |
| `packages/crawler` | SSRF-säker crawl (DNS och anslutning valideras, varje redirect-hopp kontrolleras, alla webbläsaranrop går via skyddet), extraktion ur renderad DOM, mediapipeline (WebP/AVIF) och SEO-audit |
| `packages/motion-runtime` | Runtime för genererade sajter: Motion, Lenis och Three.js (lat-laddad WebGL), med fullt stöd för reducerad rörelse |
| `packages/renderer` | Sektioner → kompletta statiska sidor: Tailwind v4 kompileras per sajt med designsystemet som tema, plus SEO-head, JSON-LD, sitemap och robots |
| `packages/ai` | Claude-provider, designerpromptar, pipeline (analys → riktningar → sidor → översättning → kritik), validering och reparation, samt en deterministisk fake-provider |
| `packages/fonts` | Kurerade, självhostade typsnitt (Fontsource, latin + latin-ext) |
| `packages/fixtures` | Delade testdata |
| `packages/migrate` | Migrationskörare (`pnpm db:migrate`): `_migrations`-tabell, advisory lock, en transaktion per fil |
| `supabase/` | Migrationer med RLS (fungerar på vanlig Postgres och på Supabase), RLS-tester och CLI-konfiguration |

## Garantier i pipelinen

- **Ordagrant innehåll:** varje genererad sektion kontrolleras mot källtexten, källmedia och länkarna. Vid avvikelse görs *en* reparationsrunda. Om text fortfarande saknas läggs den tillbaka deterministiskt, så att inget innehåll kan försvinna.
- **Visuell QA:** varje sida renderas i 1440 px och 390 px. Kontrollerna omfattar spill, saknad text, trasiga bilder, axe (WCAG A/AA), överlappande textblock, CLS och LCP. Claude granskar dessutom skärmdumpar mot den godkända riktningen och får göra *en* korrigering.
- **Inga automatiska betalda omförsök:** vid fel pausas jobbet med en läsbar orsak, och ägaren klickar på *Fortsätt*. Varje steg är idempotent och återupptas där det slutade.
- **Säkerhet:**
  - RLS på alla tabeller och server-side-åtkomst som alltid filtreras per användare.
  - API-nycklar finns bara i servern och workern.
  - Strikt CSP på genererade sajter (endast runtime-skriptet får köras), sandlådade förhandsvisningar och honeypot plus rate limit på formulär.
- **SEO:**
  - URL:er bevaras. Varje sida får canonical, hreflang + x-default, OG och JSON-LD: LocalBusiness/Organization byggs bara av fakta från sajten, och källans FAQ/Product bevaras.
  - Sitemap med alternativa språkversioner och robots.
  - Responsiva bilder med mått och preload av LCP-bilden.

## Lokal utveckling

Krav: Node 22, pnpm 10, PostgreSQL 16 (binärer) och Chromium (Playwright).

```bash
pnpm install
pnpm --filter @redesign/motion-runtime build

# 1) Databas: lokal Postgres med alla migrationer (port 54322)
bash scripts/local-db.sh

# 2) Webbapp (dev-inloggning, lokal lagring)
cp apps/web/.env.example apps/web/.env.local   # sätt sedan:
#   DATABASE_URL=postgres://postgres@127.0.0.1:54322/postgres
#   AUTH_DRIVER=dev  STORAGE_DRIVER=local  LOCAL_STORAGE_DIR=../../.localdb/storage
#   (AUTH_DRIVER=password ger riktiga konton med lösenord, som i produktion)
pnpm --filter @redesign/web dev

# 3) Worker (AI_PROVIDER=fake fungerar utan nyckel; anthropic kräver ANTHROPIC_API_KEY)
cd apps/worker
DATABASE_URL=postgres://postgres@127.0.0.1:54322/postgres STORAGE_DRIVER=local \
LOCAL_STORAGE_DIR=$PWD/../../.localdb/storage LOCAL_STORAGE_PUBLIC_URL=http://localhost:3000/storage \
APP_ORIGIN=http://localhost:3000 AI_PROVIDER=fake pnpm start
```

Öppna http://localhost:3000. För att crawla en lokal testsajt sätter du `CRAWLER_ALLOW_PRIVATE=1` på workern. Använd det **aldrig** i produktion.

## Tester

```bash
pnpm typecheck && pnpm lint
pnpm test                    # alla paket (unit, integration, visuella Playwright-tester)
bash supabase/tests/run.sh   # RLS-regressionstester mot en temporär Postgres
# Hela användarresan i webbläsaren (kräver körande web + worker + fixture-sajt):
FIXTURE_URL=http://127.0.0.1:PORT pnpm --filter @redesign/web test:e2e
```

Testerna omfattar bland annat:

- 30 XSS-vektorer mot sanitizern och SSRF-intervall, inklusive DNS-rebinding och redirects.
- Crawl och extraktion av en JS-renderad fixture-sajt.
- Motion-runtime med reducerad rörelse, utan JS och vid runtime-fel.
- Rendering med visuell kontroll i 1440 px och 390 px.
- Claude-requestens exakta format via mockad SSE.
- Hela workerflödet mot riktig Postgres.
- E2E-resan från inloggning till publicerad sajt.

## Driftsättning

**Railway (rekommenderat, allt på ett ställe):**

- Web, worker, Postgres och en Storage Bucket.
- Egen inloggning med e-post/lösenord och Google.
- Migrationer körs automatiskt vid deploy.

Steg för steg med exakta variabler finns i **[docs/railway.md](docs/railway.md)**. Hälsokontroll: `GET /api/health`.

**Alternativ med Supabase:**

- Sätt `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` och `SUPABASE_SERVICE_ROLE_KEY`. Då används Supabase för inloggning (`AUTH_DRIVER=supabase`) och lagring (`STORAGE_DRIVER=supabase`).
- Kör `pnpm db:migrate` med Supabase-databasens `DATABASE_URL`. Supabase-förutsättningarna finns redan, och plattformsmigrationen hoppar då över dem.
- Aktivera Google under *Authentication → Providers* och lägg till `https://DIN-APP/auth/callback` som redirect-URL.

**Gemensamt:**

- **Publicerade sajter på subdomäner:** sätt `SITES_DOMAIN` och peka `*.SITES_DOMAIN` (wildcard) mot webben.
- **Egna domäner via Vercel (valfritt):** `VERCEL_API_TOKEN` och `VERCEL_PROJECT_ID`. Utan dessa verifieras domäner manuellt via DNS.
- **Skalning:** fler worker-instanser eller `WORKER_CONCURRENCY`. Kön använder `FOR UPDATE SKIP LOCKED`.
- **Formulär (valfritt):** `RESEND_API_KEY` för e-postnotiser till sajtägaren.

## AI och kostnad

- Standardmodell är `claude-opus-5-5`, med adaptivt tänkande och explicit effort: `high` för kod och kritik, `medium` för analys och `low` för översättning.
- Server-side refusal fallback är aktiverad (`fallbacks: "default"`) och kan stängas av i `packages/ai/src/anthropic.ts`.
- Kostnaden loggas per anrop i `ai_usage`, summeras per jobb och visas i wizarden.
- `AI_MODEL_FAST` kan sättas till en billigare modell för översättningar. Standard är samma modell som för allt annat.

## Kända begränsningar

- Core Web Vitals från fältdata, backlänkar och indexering kräver Search Console eller CrUX. De visas som "kan inte mätas" och påverkar inte SEO-poängen.
- Formulär på den nya sajten skickas till vår endpoint. Integrationer mot kundens gamla backend (CRM, bokning) följer inte med automatiskt.
- Betalning (Stripe) ingår inte. Priserna på startsidan är endast visning.
