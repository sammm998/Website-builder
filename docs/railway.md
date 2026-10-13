# Driftsättning på Railway

## Snabbstart (3 steg, cirka 5 minuter)

Det här räcker för att allt ska fungera. Bilder sparas i Postgres och sessionsnyckeln härleds automatiskt. Bucket, Google och egen domän kan läggas till senare.

**1. Lägg till en databas**

I projektet: **+ Create → Database → PostgreSQL**. Låt den heta `Postgres`.

**2. web-tjänsten** (`@redesign/web`): öppna **Variables → Raw Editor**, klistra in och spara:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

**3. worker-tjänsten** (`@redesign/worker`): öppna **Variables → Raw Editor**, klistra in, byt nyckeln och spara:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
APP_ORIGIN=https://redesignweb-production.up.railway.app
ANTHROPIC_API_KEY=sk-ant-DIN-NYCKEL
RAILWAY_DOCKERFILE_PATH=apps/worker/Dockerfile
```

- `APP_ORIGIN` är webbens adress. Byt den om din web-domän är en annan.
- `RAILWAY_DOCKERFILE_PATH` gör att workern byggs med Playwright-imagen, som innehåller Chromium för crawl och skärmdumpar.

Railway deployar om båda tjänsterna när variablerna sparas. Databastabellerna skapas automatiskt.

**Kontrollera:** öppna `https://redesignweb-production.up.railway.app/sv/setup`. Sidan visar databas, variabler och worker med grönt eller rött, och uppdateras av sig själv. När allt är grönt kan du klistra in din adress på startsidan. Tekniskt: `/api/health` ska svara `"ok": true`.

- Workerns logg ska visa `[worker] started (… storage db)`.
- Saknas något skriver workern `[worker] waiting for configuration` och listar exakt vad som saknas. Den kraschar inte.

---

## Fördjupning och tillval

### Lägg till Bucket för bilder (valfritt, rekommenderas vid många projekt)

Lägg till **+ Create → Bucket** och sätt följande på **både** web och worker:

```env
S3_ENDPOINT=${{Bucket.ENDPOINT}}
S3_BUCKET=${{Bucket.BUCKET}}
S3_ACCESS_KEY_ID=${{Bucket.ACCESS_KEY_ID}}
S3_SECRET_ACCESS_KEY=${{Bucket.SECRET_ACCESS_KEY}}
S3_REGION=${{Bucket.REGION}}
```

- Välj bucketens variabler i autokompletteringen när du skriver `${{Bucket.` om namnen skiljer sig.
- Bilder som redan sparats i databasen fortsätter att fungera. Nya bilder sparas i bucketen.

### Egen sessionsnyckel (valfritt)

Utan `SESSION_SECRET` härleds nyckeln från `DATABASE_URL`. Vill du ha en egen sätter du `SESSION_SECRET` på web till utskriften av `openssl rand -base64 48`. Alla användare loggas då ut en gång.

### Config-as-code (valfritt)

Under **Settings → Config-as-code** kan du ange `/apps/web/railway.json` respektive `/apps/worker/railway.json`. Det ger hälsokontroller, migrering som pre-deploy och watch-paths. Det behövs inte för snabbstarten: webben kör migrationerna när den startar, och workern gör det också.

### Google-inloggning (valfritt)

1. Gå till [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. Välj **Create credentials → OAuth client ID → Web application**.
3. Lägg till följande under **Authorized redirect URIs**:
   ```
   https://<din-web-domän>/auth/google/callback
   ```
   Till exempel `https://redesignweb-production.up.railway.app/auth/google/callback`. Lägg även till din egen domän när du kopplar en.
4. Lägg in `GOOGLE_CLIENT_ID` och `GOOGLE_CLIENT_SECRET` på **web**.

Knappen "Fortsätt med Google" visas bara när båda variablerna är satta.

### Hälsosidan i detalj

Öppna `https://<din-web-domän>/api/health`. Svaret ska se ut ungefär så här:

```json
{ "ok": true, "database": "ok", "migrations": { "applied": 5, "latest": "20261012000004_stored_objects.sql" }, "auth": "password", "storage": "db", "missing": [], "recommended": ["SESSION_SECRET"] }
```

- **`missing`** listar variabler som saknas eller är felaktiga. Svaret visar bara namnen, aldrig värdena.
- **`database: "unreachable"`** betyder att `DATABASE_URL` är fel, eller att Postgres-tjänsten inte är igång.
- **`migrations: "missing"`** betyder att migrationerna inte har körts än. Se `[migrate]` i webbens eller workerns logg.

Workerns loggar börjar med `[migrate] …` och sedan `[worker] started (…)`. Saknas en variabel väntar workern och skriver ut listan varje minut.

### Publicerade sajter och egna domäner

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
| Workern skriver `waiting for configuration` | Lägg in variablerna som listas, se snabbstarten. |
| Crawl misslyckas med fel om Chromium/browser | `RAILWAY_DOCKERFILE_PATH=apps/worker/Dockerfile` saknas på workern. |
| Bilder saknas i förhandsvisningen | Med bucket måste `S3_*` vara satta på **både** web och worker. |
| Google ger `redirect_uri_mismatch` | Redirect-URI:n i Google Console måste vara exakt `https://<domän>/auth/google/callback`. |
