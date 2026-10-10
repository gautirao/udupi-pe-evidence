# Local PostGIS Test Fixture

**Issue #1347** — reusable local Postgres/PostGIS test infrastructure for local E2E runs.
The E2E gate is `npm run test:e2e:gate` (canonical suite `e2e/canonical/**`, local auth stack);
this fixture is a local-only data source, not a gate.

---

## Overview

The local PostGIS fixture gives you a fully migrated throwaway database instead of the shared
Supabase cloud database (the retired `discover-real-data-smoke` spec and its
`scripts/test/run-real-data-smoke.sh` runner no longer exist). This gives:

- **Deterministic seed data** — 12 LIVE `[E2E]` listings, 1 Manipal school, synthetic broker
  account; all idempotent.
- **No production blast radius** — ephemeral Docker container torn down after each run.
- **No Supabase credentials required** — schema applied from the committed Flyway migrations.
- **Fast iteration** — entire setup (container start → migrate → seed) takes ~2 minutes.

---

## Quick Start

```bash
# Start the fixture, migrate, and seed (one command)
bash scripts/db/restore-test-fixture.sh
```

To run the E2E gate (which provisions its own fixture), use `npm run test:e2e:gate`.
`restore-test-fixture.sh` rejects any non-empty `E2E_FIXTURE_PROFILE` (the `udupi-canonical`
profile was retired).

---

## Prerequisites

| Tool | Minimum version | Notes |
|------|----------------|-------|
| Docker Desktop / Engine | 24+ | Must be running |
| `psql` (PostgreSQL client) | 14+ | For health checks and seed load |
| `pg_dump` | 14+ | Only for `export-test-fixture.sh` |
| Node.js + npm | 18+ | For Playwright |

The Flyway CLI is **not** installed locally — migrations are applied via the
`flyway/flyway:10.20.1` Docker image (matches Spring Boot 3.4.1 BOM → Flyway 10.20.1).

---

## Scripts

### `scripts/db/restore-test-fixture.sh`

Idempotent setup: stop old container → start fresh → wait healthy → Flyway migrate → seed → validate.

```bash
# Default (port 5434, password fixture_test_only)
bash scripts/db/restore-test-fixture.sh

# Custom port
PG_TEST_PORT=5435 bash scripts/db/restore-test-fixture.sh

# Schema only (skip seed)
SKIP_SEED=true bash scripts/db/restore-test-fixture.sh
```

On success the DATABASE_URL is printed to stdout as the last line:

```
postgresql://postgres:fixture_test_only@localhost:5434/postgres
```

Capture it for downstream use:

```bash
export DATABASE_URL=$(bash scripts/db/restore-test-fixture.sh | grep '^postgresql://')
```

### `scripts/db/export-test-fixture.sh`

Exports a **schema-only** SQL dump from the running fixture for reference or diffing.
**Never run against production.** The script validates the target is `localhost` and
the container is `pg-test-fixture`.

```bash
bash scripts/db/export-test-fixture.sh
# → tmp/fixture-schema.sql  (schema only, no data, no PII)
```

---

## Seed Data (`scripts/db/fixtures/discover-smoke-seed.sql`)

All data is **synthetic** — no real PII, no real emails, no real phone numbers.

| What | Details |
|------|---------|
| Synthetic broker | UUID `a1b2c3d4-e5f6-7890-abcd-ef1234567890`, email `e2e-broker@example.com` |
| LIVE [E2E] listings | 12 rows: 4 × Manipal, 4 × Malpe, 4 × Kaup; all `status = 'LIVE'` |
| Manipal apartments | 2 rows with `title LIKE '%Apartment%'` (satisfies J4 `q=apartment` filter) |
| Manipal school | UUID `11111111-2222-3333-4444-555555555555`, `area_key = 'IN|KA|Udupi|Manipal'` |
| City / areas | `udupi` city + 3 areas — idempotent guards on top of V71 seed |

Idempotency: all inserts use `ON CONFLICT ... DO UPDATE`. Re-running the seed keeps counts
constant; J4 requires a stable baseline `>= 2` listings.

---

## Architecture

### Container

```
postgis/postgis:15-3.4   (mirrors scripts/restore_validation_db.sh convention)
Port: 5434 (default) or $PG_TEST_PORT
tmpfs: /var/lib/postgresql/data  (ephemeral — data lost on docker rm)
```

### Flyway apply mechanism

Migrations are applied using the **`flyway/flyway:10.20.1` Docker image**, volume-mounted to
`backend/src/main/resources/db/migration`. This avoids a local Flyway CLI install and ensures
the exact version matches the Spring Boot BOM.

```
# V0 and V0.1 are applied via psql first (see restore-test-fixture.sh steps 1-3),
# then Flyway takes over from V1 onwards:
flyway/flyway:10.20.1  migrate
  -url=jdbc:postgresql://host.docker.internal:5434/postgres
  -locations=filesystem:/flyway/sql
  -baselineOnMigrate=true
  -baselineVersion=0.1
  -placeholders.concurrently_keyword=
```

**V0 and V0.1 are applied by psql before Flyway runs.** V0 is pure DDL; V0.1 contains
Supabase-specific `auth.users` DDL and RLS policies that need Supabase-managed roles —
the script creates stub `anon`/`authenticated`/`service_role` roles and a minimal
`auth.users` table so V0.1 applies cleanly on bare PostGIS. Flyway is then told
`-baselineOnMigrate=true -baselineVersion=0.1`, which inserts a baseline row for V0.1
and applies V1..V83 in order.

The `concurrently_keyword` placeholder (used in V73's `CREATE INDEX` DDL) is passed as
an empty string — `CONCURRENTLY` is not needed on a single-connection test fixture.

History table name: **`flyway_schema_history`** (Flyway 10.x default; Flyway 9+ renamed from
`schema_version`).

Assertion: after migrate, `SELECT COUNT(*) FROM flyway_schema_history WHERE success = true`
must return **exactly 84**:
- 1 baseline row for V0.1
- 82 SQL rows for V1..V83 (V65 absent as SQL — V64→V66 gap in migration files)
- 1 synthetic JDBC row for V65 (`V65__EncryptPhoneAtRest`, Java migration backfilled by the
  restore script — the fixture has no phone data so V65 is a no-op, but Spring Boot's embedded
  Flyway requires the history row to be present for startup validation to pass)

### geog column

`property_listings.geog` is a `GENERATED ALWAYS AS` column (V73):

```sql
geog geography(Point, 4326)
  GENERATED ALWAYS AS (ST_MakePoint(longitude, latitude)::geography) STORED
```

**Do not insert `geog` directly.** Insert `longitude` and `latitude` — Postgres computes `geog`
automatically. ST_MakePoint takes `(longitude, latitude)` — **longitude first**.

---

## Schema facts (post-V83)

| Fact | Value | Migration source |
|------|-------|-----------------|
| Listing owner column | `created_by UUID` on `property_listings` | V8 |
| Listing status enum | `listing_status`: SCRAPED \| DRAFT \| PENDING_REVIEW \| LIVE \| REJECTED | V7 |
| geog column | `geography(Point, 4326)` GENERATED on `property_listings` | V73 |
| schools.geog column | `geography(Point, 4326)` GENERATED on `schools` | V75 |
| area_key on listings | `TEXT` column, indexed with `(area_key, status, created_at)` | V74 |
| area_key on schools | `TEXT` FK to `areas(area_key)` | V79 |
| cities table | `id SERIAL PK`, `slug TEXT UNIQUE` | V71 |
| areas table | `area_key TEXT PK`, `city_id INT FK → cities(id)` | V71 |
| price_paise | `BIGINT` on `property_listings` | V11 |
| app_role enum | `admin \| user \| dealer \| broker` | V0 + V7 + V41 |

---

## Testcontainers (Java integration tests)

This fixture is for **shell-script / Playwright smoke** use. For Spring Boot `@DataJpaTest` or
`@SpringBootTest` integration tests that need PostGIS, use **Testcontainers** directly in Java:

```java
@Container
static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgis/postgis:15-3.4")
    .withDatabaseName("testdb")
    .withUsername("test")
    .withPassword("test");
```

Add `@Testcontainers` to the test class and configure `spring.datasource.url` from
`postgres.getJdbcUrl()`. Flyway will run automatically at context startup.

The `pom.xml` already declares `testcontainers`, `spring-boot-testcontainers`, and
`testcontainers:postgresql` as test-scope dependencies (added at `<testcontainers.version>1.21.4</testcontainers.version>`).

---

## Troubleshooting

**Port already in use**

```
ERROR: Port 5434 is already bound by container 'pg-test-fixture'.
```

```bash
docker rm -f pg-test-fixture
# or use a different port:
PG_TEST_PORT=5435 bash scripts/db/restore-test-fixture.sh
```

**Flyway migration count < 83**

Check for Flyway errors in the Docker output. Most common cause: V73 uses
`CREATE INDEX CONCURRENTLY` which cannot run inside a transaction. Flyway handles this
automatically when the migration file starts with `-- flyway:no-transaction`.

**PostGIS not available**

The `postgis/postgis:15-3.4` image ships with PostGIS pre-installed. If V73 fails, check
that `CREATE EXTENSION IF NOT EXISTS postgis` ran (it is in V73).

**geog column NULL after seed**

Ensure `latitude` and `longitude` are both non-NULL. The GENERATED column evaluates to NULL
when either input is NULL. All seed rows provide both values explicitly.

---

## Security notes

- The container runs on `localhost` only (no `0.0.0.0` listener in production sense — it is
  localhost-port-forwarded by Docker).
- The fixture password `fixture_test_only` is not a secret; it is a local-dev throwaway.
- `DATABASE_URL` containing the password is **never echoed** in scripts; only a redacted
  version is logged to stdout.
- `export-test-fixture.sh` validates the target is `localhost` and the container name is
  `pg-test-fixture` before running `pg_dump`.
- The seed SQL uses `example.com` emails and no real phone numbers or PII.
- Do **not** run any of these scripts against a Supabase/production connection string.
