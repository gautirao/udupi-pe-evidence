# Backend — Local Development Setup

This directory contains the Spring Boot backend for the Udupi Property Explorer.

## First-time setup

1. Copy the environment template:

   ```
   cp apps/api/.env.example apps/api/.env
   ```

2. Open `apps/api/.env` and fill in the five required variables:

   - `SUPABASE_DB_HOST` — Supabase Postgres host
   - `SUPABASE_DB_USER` — Supabase Postgres user
   - `SUPABASE_DB_PASSWORD` — Supabase Postgres password
   - `SUPABASE_PROJECT_REF` — Supabase project reference ID (used as JWT issuer)
   - `AI_API_KEY` — AI service API key

   The `run-local.sh` script validates these five variables on startup and exits early
   with a clear error if any are missing.

3. Start the backend:

   ```
   # From the repo root:
   ./apps/api/run-local.sh

   # Or from inside the backend directory:
   ./run-local.sh
   ```

## Security

`apps/api/.env` is listed in `.gitignore` and must **never** be committed to the
repository.

If credentials stored in `apps/api/.env` were ever exposed (e.g. accidentally
committed, shown in a log, or shared in a message), rotate them immediately in
their respective provider dashboards:

- **Supabase DB password** — Supabase project settings → Database → Reset password
- **AI API key** — your AI provider's API key management page

Rotation is a manual step that only you can perform; this repository cannot do it
for you.
