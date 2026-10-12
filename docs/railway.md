# Driftsättning på Railway

Allt körs på Railway: **web** (Next.js), **worker** (Playwright + Claude), **Postgres** och en **Storage Bucket**. Inloggning sker med e-post/lösenord och Google, utan Supabase.

```
Railway-projekt
├── Postgres         (Railway-mall)
├── Bucket           (Railway Storage Bucket, S3-kompatibel, privat)
├── web              apps/web/railway.json     → publik domän
└── worker           apps/worker/railway.json  → ingen publik domän behövs
```

## 1. Lägg till databas och bucket

1. Klicka **+ Create** i projektet och välj **Database → PostgreSQL**.
2. Klicka **+ Create** igen och välj **Bucket**. Namnet spelar ingen roll. I exemplen nedan heter den `Bucket`.

## 2. Peka tjänsterna på rätt konfiguration

Gör följande i **Settings** för respektive tjänst:

| | web | worker |
|---|---|---|
| Source → Root Directory | *(tom, repots rot)* | *(tom, repots rot)* |
| Config-as-code → Railway Config File | `/apps/web/railway.json` | `/apps/worker/railway.json` |
| Networking | **Generate Domain** | ingen |

Konfigurationsfilerna styr följande:

- **web**
  - Byggs med Railpack.
  - Kör databasmigrationerna som *pre-deploy* (`pnpm db:migrate`).
  - Startar med `next start`. Railways `PORT` används automatiskt.
  - Hälsokontroll: `/api/health`.
- **worker**
  - Byggs med `apps/worker/Dockerfile` (Playwright-image med Chromium).
  - Kör migrationerna och startar sedan jobbloopen.
  - Hälsokontroll: `/health` på `PORT`.

Migrationerna kan köras samtidigt från båda tjänsterna. De är skyddade av ett advisory lock.

## 3. Variabler

Öppna **Variables → Raw Editor** och klistra in blocket nedan. Byt `Postgres`, `Bucket` och `web` mot namnen på dina tjänster om de heter något annat.

För bucketen: välj variabeln i autokompletteringen när du skriver `${{Bucket.`. Om bucketens variabler har andra namn än i exemplet tar du de motsvarande (endpoint, bucket, access key, secret, region).

### web

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
SESSION_SECRET=<minst 32 slumpade tecken, se nedan>

S3_ENDPOINT=${{Bucket.ENDPOINT}}
S3_BUCKET=${{Bucket.BUCKET}}
S3_ACCESS_KEY_ID=${{Bucket.ACCESS_KEY_ID}}
S3_SECRET_ACCESS_KEY=${{Bucket.SECRET_ACCESS_KEY}}
S3_REGION=${{Bucket.REGION}}

# Valfritt: Google-inloggning (se steg 4)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

`APP_ORIGIN` behövs inte så länge du använder Railways domän. Den sätts automatiskt till `https://<RAILWAY_PUBLIC_DOMAIN>`. När du kopplar en egen domän sätter du `APP_ORIGIN=https://din-doman.se`.

### worker

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
APP_ORIGIN=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
ANTHROPIC_API_KEY=sk-ant-...

S3_ENDPOINT=${{Bucket.ENDPOINT}}
S3_BUCKET=${{Bucket.BUCKET}}
S3_ACCESS_KEY_ID=${{Bucket.ACCESS_KEY_ID}}
S3_SECRET_ACCESS_KEY=${{Bucket.SECRET_ACCESS_KEY}}
S3_REGION=${{Bucket.REGION}}

WORKER_CONCURRENCY=2
```

`APP_ORIGIN` på workern måste vara **webbens** publika adress. Bilder, runtime och typsnitt i de genererade sajterna pekar dit.

### SESSION_SECRET

Generera ett värde lokalt och klistra in det:

```bash
openssl rand -base64 48
```

Om du byter värdet loggas alla användare ut.

## 4. Google-inloggning (valfritt)

1. Gå till [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. Välj **Create credentials → OAuth client ID → Web application**.
3. Lägg till följande under **Authorized redirect URIs**:
   ```
   https://<din-web-domän>/auth/google/callback
   ```
   Till exempel `https://redesignweb-production.up.railway.app/auth/google/callback`. Lägg även till din egen domän när du kopplar en.
4. Lägg in `GOOGLE_CLIENT_ID` och `GOOGLE_CLIENT_SECRET` på **web**.

Knappen "Fortsätt med Google" visas bara när båda variablerna är satta.

## 5. Kontrollera

Öppna `https://<din-web-domän>/api/health`. Svaret ska se ut ungefär så här:

```json
{ "ok": true, "database": "ok", "migrations": { "applied": 4, "latest": "20261011000003_password_auth.sql" }, "auth": "password", "storage": "s3", "missing": [] }
```

- **`missing`** listar variabler som saknas eller är felaktiga. Svaret visar bara namnen, aldrig värdena.
- **`database: "unreachable"`** betyder att `DATABASE_URL` är fel, eller att Postgres-tjänsten inte är igång.
- **`migrations: "missing"`** betyder att pre-deploy-steget inte har körts. Kontrollera att *Railway Config File* är satt på web.

Workerns loggar börjar med `[migrate] …` och sedan `[worker] started (… storage s3)`. Saknas en variabel skriver workern ut en lista över vad som saknas och avslutar.

## 6. Publicerade sajter och egna domäner

- Publicerade sajter nås på `https://<web-domän>/site/<slug>`.
- **Subdomäner** (`<slug>.dindoman.se`):
  1. Sätt `SITES_DOMAIN=dindoman.se` på både web och worker.
  2. Lägg till `*.dindoman.se` som custom domain på web-tjänsten.
- **Kundernas egna domäner:**
  1. Kunden pekar sin DNS mot web-tjänsten.
  2. Du lägger till domänen under web → Settings → Networking.
  3. Appen verifierar domänen via DNS innan den börjar servera sajten.

## Vanliga fel

| Symptom | Orsak |
|---|---|
| HTTP 500 på startsidan | Kör en gammal version. Deploya om. `/api/health` visar vad som saknas. |
| Workern startar inte | Se loggen: listan över saknade variabler skrivs ut, oftast `ANTHROPIC_API_KEY`, `APP_ORIGIN` eller `S3_*`. |
| Bilder saknas i förhandsvisningen | `S3_*` är inte satta på **web**. Webben serverar bilderna från bucketen via `/storage/site-media/…`. |
| Google ger `redirect_uri_mismatch` | Redirect-URI:n i Google Console måste vara exakt `https://<domän>/auth/google/callback`. |
