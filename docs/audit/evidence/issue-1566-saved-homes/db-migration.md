# DB migration — V107__create_saved_listings.sql

Additive / expand-only. No destructive DDL, no backfill, no locking risk.

```sql
CREATE TABLE IF NOT EXISTS public.saved_listings (
    id           UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL,
    listing_id   UUID        NOT NULL REFERENCES public.property_listings(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_saved_listings PRIMARY KEY (id),
    CONSTRAINT uq_saved_listings_user_listing UNIQUE (user_id, listing_id)
);
CREATE INDEX IF NOT EXISTS idx_saved_listings_user_id ON public.saved_listings (user_id);
```

## Design notes
- `user_id`: soft reference to Supabase `auth.users` (NO FK) — matches existing `user_saved_areas` / `broker_demand_gap_state` convention (Supabase Auth is infra-only in this schema).
- `listing_id`: hard FK to `property_listings(id) ON DELETE CASCADE` — same-schema reference, mirrors `listing_images`. Listings are soft-retired via status, so cascade rarely fires; the saved-homes page badges availability by `status`.
- `UNIQUE(user_id, listing_id)`: idempotency.
- No RLS by design — Spring Boot is the sole reader/writer and enforces authz; the frontend never reaches this table via the Supabase client.

## Version number
Planned as V100, renumbered to **V107** at implementation: the worktree base (`origin/main @ 18e5eeef`) already contains V100–V106 (V100 add_area_slug … V106 seed_bangalore_macro_region). Using V100 caused a Flyway "more than one migration with version 100" collision. V107 is the next free version; DDL/table unchanged.

## Applied where
Testcontainers real Postgres/PostGIS only (SavedListingsRepositoryIT). NEVER applied to shared/production Supabase (hard constraint).
