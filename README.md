# 1-2-3 paint with me!

Turn a photo into a numbered canvas you can print and paint at home. Choose how many colors to use, match them to paints you already own, and download a vector PDF. The PDF is built in the browser for that download and is never stored.

Sign in with Google. Paints, projects, and photos belong to that account and come back on another device. Each account sees only its own work.

## The application

Upload a photo by drag, click, paste, or the phone camera. Frame it, then pick 6–48 colors and a detail level: Simple, Balanced, or Detailed. The preview uses exactly that many colors, unless the photo itself has fewer.

Match the palette to paints you own. That assignment leaves the regions as they are. The paint library has search, JSON and CSV import and export, and a reference photo you can sample for a hex color.

Choose paper: A5, A4, A3, Letter, or a custom size, with a margin and portrait or landscape. The PDF is vector outlines and real text: numbered regions, a color key, quantities, and a 50 mm scale bar.

Deleting an account removes the profile, paints, projects, and files. The app is an installable PWA. The service worker precaches the app shell and leaves API responses and user files uncached.

## Technologies

The client is Vite, React, TypeScript, and MUI. Fredoka and Inter come from `@fontsource-variable`. `vite-plugin-pwa` emits the service worker (Workbox `generateSW`, auto-update). Routing is React Router.

The API is Fastify, with cookie, multipart, helmet, rate limit, and static file plugins. Google sign-in uses `@react-oauth/google` in the browser and `google-auth-library` on the server. The server checks the Google ID token and issues its own httpOnly session cookie.

PostgreSQL holds accounts, sessions, paints, and projects. Drizzle ORM and drizzle-kit own the schema and the SQL migrations. The driver is `pg`. Neon connection strings use TLS. `channel_binding` is stripped because `pg` does not implement it.

Photos, analyses, and thumbnails sit on local disk during development. Production on Fly stores the same objects in Cloudflare R2 through `@aws-sdk/client-s3`. Color matching uses culori (CIEDE2000). The PDF uses pdf-lib. Sharp generates the PWA icons and is not part of the running server.

Tests are Vitest. Lint is Oxlint. Local Postgres runs in Docker. The client and the server are separate pnpm projects.

## Architecture

One Node process serves the built client and the API. The browser talks only to the API. The API is the only writer to PostgreSQL.

Image work runs in a browser worker.

1. The photo is cropped and scaled so the long edge is at most 1000 pixels.
2. Analysis (color smoothing and a full palette) runs once for a photo, crop, and engine version. The worker keeps that result in memory, and the same bytes are stored as a file of kind `analysis`. Opening the project again downloads that file.
3. Reducing the palette to the chosen color count and detail level builds regions, a vector outline, labels, and the preview. Changing the color count skips analysis.
4. "Use only paints I own" assigns those colors to distinct paints and leaves the regions in place.
5. Export builds the PDF from vector paths and text at the moment of download.

### Data

- `users` — Google profile basics, or the local developer account.
- `sessions` — hashed session token, expiry, and last seen. The cookie holds only the raw token.
- `paints` — label, manufacturer, product line, code, hex, quantity, unit, notes, and an optional reference photo.
- `projects` — title, status (`draft` or `ready`), color count, detail, paper, crop, and pointers to the source photo, analysis, and thumbnail.
- `project_colors` — the legend: number, hex, paint, area, estimated quantity, and shortfall.
- `files` — stored bytes. Kinds are source photo, paint reference, analysis, and thumbnail. One directory per user under the uploads folder, or the same key prefix in R2.

Deleting a user removes projects, then paints, then files. That order is fixed in `server/drizzle/0000_initial.sql`, because Postgres runs `ON DELETE` actions in foreign-key creation order.

### Where it runs

Fly.io runs the Node process: one 512 MB shared-CPU machine in Amsterdam. Neon holds Postgres in Frankfurt. Cloudflare R2 holds files in Western Europe. Uploads stop at 8 GiB for the whole app and 200 MiB per person, which is inside R2's free 10 GB. `GET /api/health` is the process check. `GET /api/ready` checks Postgres and, when R2 is configured, the bucket. Migrations run when the process starts.

File bytes stream through the API, so the session cookie and the page content-security policy stay as they are. With files on R2 and sessions in Postgres, more than one machine can serve the app. The hosted config stays at one machine. A deploy that leaves R2 unset keeps files on that machine's disk, so it stays a single replica.

## Develop

Requirements: Node.js 24, pnpm 12.11.2 (pinned in `package.json`), and Docker.

```bash
pnpm install
copy server\.env.example server\.env
docker compose up -d
pnpm db:migrate
pnpm dev
```

On Unix, `cp server/.env.example server/.env`.

The app is at http://localhost:5173. The API is at http://localhost:3001. Postgres is published on host port 5433, which is what `DATABASE_URL` uses. The container listens on 5432.

Set `DEV_LOGIN_ENABLED=true` in `server/.env` to show "Continue as developer". The API logs a warning at startup and refuses to boot in production while that flag is true.

For Google sign-in, create an OAuth web client whose JavaScript origin is `http://localhost:5173`, and set `GOOGLE_CLIENT_ID`. The button reads it from `GET /api/auth/config`. Leave `COOKIE_SECURE=false` on local HTTP. Every variable is commented in `server/.env.example`.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Client and API together |
| `pnpm dev:client` / `pnpm dev:server` | One side only |
| `pnpm build` | Typecheck and build both packages |
| `pnpm lint` | Oxlint on client and server |
| `pnpm test` | Vitest in both packages |
| `pnpm db:generate` | Write a SQL migration from the Drizzle schema |
| `pnpm db:migrate` | Apply migrations |

Regenerate the PWA icons from the logo with `node --experimental-strip-types client/scripts/make-icons.ts` from the repo root.

## Deploy

Copy `.env.hosted.example` to `.env.hosted`, fill the API keys, and run `pnpm host:up`. That creates the Neon database, the R2 bucket, and deploys to Fly with `fly deploy --ha=false`. `pnpm host:neon`, `pnpm host:r2`, and `pnpm host:fly` run a single step. The R2 S3 access key is created in the Cloudflare dashboard. The script stops and prints that link when the key is missing.

Add the public origin (by default `https://<app>.fly.dev`) to the Google OAuth client, put the client id in `.env.hosted`, and run `pnpm host:fly` again. Secrets stay in `.env.hosted` and in Fly.

Publishing a `v*` tag deploys that commit. The GitHub Action needs the `FLY_API_TOKEN` secret.

```bash
git tag v0.1.0
git push origin v0.1.0
```

The first release applies one migration, `server/drizzle/0000_initial.sql`.

A local production-shaped stack still uses a Postgres container and an uploads volume. Keep it on its own Compose project so it does not share the dev database:

```bash
docker compose -p paint-with-me-prod -f docker-compose.prod.yml up -d --build
```

The image is Node 24 on Alpine. It builds the client and the server, then runs the server's production dependencies as `node`. The built client is `/app/public`. Uploads are `/app/uploads`. Put a reverse proxy in front of port 8080 and terminate HTTPS there. Set `PUBLIC_ORIGIN` to that URL, `COOKIE_SECURE=true`, and `TRUST_PROXY=true`. See `.env.production.example`.

Tear that stack down with the same project name:

```bash
docker compose -p paint-with-me-prod -f docker-compose.prod.yml down -v
```

Back up the Postgres volume and the uploads volume. Files are not in the database.

## Limits

- Quantity shortfall is calculated when the paint unit is ml.
- Screen color and paper color will differ from a paint brand's own chart.
- HEIC photos depend on the browser. Export one as JPEG when it will not open.
- The privacy and terms pages are templates and need legal review before a public launch.
- Google sign-in needs a client id. The developer shortcut exists only outside production.
