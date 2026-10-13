# Driftsättning på Railway

## Allt-i-ett (standard) – inget att ställa in

Repots `Dockerfile` används automatiskt av Railway för båda tjänsterna. `scripts/launch.mjs` startar allt:

- **Webbtjänsten** startar en egen Postgres, kör migrationerna och sedan appen. Workern körs inuti samma tjänst.
- **Worker-tjänsten** gör ingenting i det här läget. Den svarar bara på hälsokontrollen och kan tas bort.

Det enda du gör:

1. Öppna `https://<din-web-domän>/sv/setup`.
2. Skapa ett konto. Det första kontot blir administratör.
3. Klistra in din Anthropic-nyckel (console.anthropic.com → API Keys). Den kontrolleras och sparas krypterat i databasen.

**Data:** utan volym nollställs den inbyggda databasen varje gång Railway deployar om. För att spara permanent: högerklicka på webbtjänsten → **Attach volume** → mount path `/data`. Launchern använder då volymen (`RAILWAY_VOLUME_MOUNT_PATH`) automatiskt.

## Extern Postgres (valfritt)

Lägg till Postgres i projektet och sätt variablerna på **web**:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

och på **worker**:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
APP_ORIGIN=https://<din-web-domän>
```

Då kör webben bara appen och workern körs i sin egen tjänst. Claude-nyckeln läggs fortfarande in på `/sv/setup`. Om du i stället sätter `ANTHROPIC_API_KEY` på workern används den. Sätt `SESSION_SECRET` antingen på båda tjänsterna eller på ingen av dem, eftersom den sparade nyckeln krypteras med den.

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

Under **Settings → Config-as-code** kan du ange `/apps/web/railway.json` respektive `/apps/worker/railway.json`. Det ger hälsokontroller och watch-paths. Det behövs inte: Dockerfilen och launchern fungerar utan.

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
| Setup-sidan säger "Railway har inte byggt appen med Dockerfilen" | Tjänsten har en låst builder. Välj Dockerfile under Settings → Build, eller ange `/apps/web/railway.json` som config-fil. |
| Bilder saknas i förhandsvisningen | Med bucket måste `S3_*` vara satta på **både** web och worker. |
| Google ger `redirect_uri_mismatch` | Redirect-URI:n i Google Console måste vara exakt `https://<domän>/auth/google/callback`. |
