# 1-2-3 paint with me!

A small responsive web app that turns a photo into a printable paint-by-number canvas. This repository is the base architecture and tooling. Product features (sign-in, projects, paints, image processing, PDF export) are not implemented yet.

The browser will talk only to the API. The API is the only writer to PostgreSQL. Image processing will run in the browser later; the server stores files on disk and metadata in the database.

## Layout

- `client` — Vite, React, TypeScript, and MUI. Dev server proxies `/api` to the API.
- `server` — Fastify HTTP API. Drizzle talks to PostgreSQL. Uploaded and generated files will live under `server/uploads`, one directory per user, and are not committed.
- `docker-compose.yml` — local PostgreSQL 16.

## Library choices

- **Vite** — official React and TypeScript app tooling, with a fast dev server and a production build.
- **React and TypeScript** — UI and types for the client.
- **MUI (`@mui/material`, Emotion, Roboto via `@fontsource/roboto`)** — responsive components and a single theme, so layout work does not start from scratch.
- **Fastify** — small TypeScript HTTP API. Chosen over Express for first-class async hooks and a smaller runtime.
- **`@fastify/cors`** — allows the Vite origin to call the API with credentials, which the session cookie will need.
- **`@fastify/cookie`** — httpOnly session cookie support. Installed for the auth work; not used by a route yet.
- **`google-auth-library`** — verifies Google ID tokens on the server. Installed for the auth work; sign-in is not wired yet.
- **Drizzle ORM and drizzle-kit** — typed SQL and checked-in SQL migrations, without a generated client binary.
- **`pg`** — node-postgres driver used by Drizzle.
- **dotenv** — loads `server/.env` for the API and for Drizzle Kit.
- **Vitest** — test runner for later unit tests. No tests are written yet.
- **Oxlint** — linter already used by the Vite template, also used on the server.
- **tsx** — runs the API from TypeScript during development.
- **concurrently** — runs the client and API dev servers with one command.

## Prerequisites

- Node.js 22 or newer (developed on Node 24)
- Docker, for local PostgreSQL

## Local setup

```bash
npm install
cp server/.env.example server/.env
docker compose up -d
npm run db:migrate
npm run dev
```

`npm install` at the repo root also installs `client` and `server`. Each package keeps its own `node_modules` so setup does not depend on Windows directory symlinks.

The client is at http://localhost:5173 and the API health check is at http://localhost:3001/api/health.

`npm run db:migrate` applies SQL files in `server/drizzle`. That folder is empty until the first schema migration is generated with `npm run db:generate`.

### Google OAuth

Sign-in is not implemented yet. When it is, create a Google Cloud OAuth **Web** client and put the values in `server/.env`:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SESSION_SECRET` — a long random string for the session cookie

Authorized JavaScript origin: `http://localhost:5173`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Client and API together |
| `npm run dev:client` / `npm run dev:server` | One side only |
| `npm run build` | Typecheck and build both packages |
| `npm run lint` | Oxlint on client and server |
| `npm test` | Vitest in both packages (passes with no tests) |
| `npm run db:generate` | Write a SQL migration from `server/src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |

## Known limitations

Features from the product sketch are not built yet: Google sign-in, paints, projects, photo processing, PDF export, and account-scoped queries. Account deletion, object storage, and sharing are later work. Nothing is seeded as a user.
