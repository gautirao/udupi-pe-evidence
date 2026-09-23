# Data-Import Owner Identity Provisioning (#2307)

This documents the fail-closed precondition check that gates
`scripts/db/seed-remote-dev-udupi-listings.sh`'s application of issue #2304's
Udupi import (`data/imports/udupi-properties-2304/import.sql`) — a narrower,
verify-only sibling to `docs/e2e-auth-provisioning.md`. It is a separate
document rather than a section of that one because the two cover different
identities with opposite lifecycle rules: the E2E identities there are
disposable, script-owned, and rotated on every provisioning run; the identity
here is a real, pre-existing dev-DB account whose credentials this tooling
must never touch. Conflating the two risked a reader assuming the same
create-or-rotate semantics apply to both.

## The problem (issue #2307)

`import.sql` inserts a `public.profiles` row and 104
`public.property_listings` rows, all owned by `testdealer@example.com`
(`auth.users.id e7b61f70-d087-44d8-a81d-7f8a057d2775`), hardcoded by
`data/imports/udupi-properties-2304/generate_sql.py`.
`public.profiles.user_id` carries `REFERENCES auth.users(id) ON DELETE
CASCADE` (`apps/api/src/main/resources/db/migration/V0.1__auth_rls_policies.sql`).
If that `auth.users` row is absent — or present under a different id — from
whichever Supabase project `import.sql` is applied to,
`scripts/db/seed-remote-dev-udupi-listings.sh` fails deep inside `psql` on
`profiles_user_id_fkey`, with no context pointing at the real cause. Nothing
in this repo had ever verified the identity's presence before this fix;
`generate_sql.py`'s own comment calling it "confirmed live on dev" was an
unverified assumption baked into generated SQL.

No SQL edit to `import.sql` was needed to fix this: V0.1's
`on_auth_user_created` trigger auto-creates the `profiles` row on any real
`auth.users` insert, so `import.sql`'s own `profiles` INSERT is a harmless
`ON CONFLICT DO NOTHING` no-op once the identity exists. The fix is entirely
in provisioning/verification tooling.

## Why verify-only, not create-or-update

`scripts/dev/provision-e2e-auth-identities.sh` (issue #2236) creates 4
disposable E2E identities and idempotently rotates their passwords on every
run — appropriate there because those identities exist only for E2E and are
owned end-to-end by that script.

`testdealer@example.com` is different: it is a confirmed real, pre-existing
dev-DB **service principal** (not a shared human login), and its id is
already hardcoded into every row `import.sql` inserts. A create-or-update
script here would be actively dangerous:

- **Create**, if the identity happened to be absent: Supabase's Auth admin
  API does not accept a caller-supplied id, so a "create" would mint a
  *different* id under the same email — permanently breaking the FK contract
  `import.sql` depends on, in a way a rollback cannot undo (the wrong id
  would already be baked into `parsed_data`-keyed rows elsewhere).
- **Update/rotate its password**: this account's credentials may be used by
  other people or tooling outside this repo. Silently rotating them out from
  under whoever relies on them is exactly the kind of side effect a
  precondition *check* must never have.

So `scripts/dev/provision-import-owner-identity.sh` only ever issues
`GET /auth/v1/admin/users/e7b61f70-d087-44d8-a81d-7f8a057d2775` (get-by-id) —
never `POST` or `PUT` — and never touches this identity's password.

**Why "get by id", not "get by email"** (fixed in code review cycle 2 of this
issue): an earlier revision queried the Admin API's *list* endpoint with
`?email=...`, modeled on `provision-e2e-auth-identities.sh`'s own
`_lookup_user_id_by_email`. That endpoint has no exact-email-match filter —
per [supabase/auth#180](https://github.com/supabase/auth/issues/180) and the
self-hosting Auth API reference, its `filter` parameter (not `email`) does an
`ILIKE` substring match against email OR full name, and an unrecognized
`email` query parameter is simply ignored, silently returning an unfiltered
page of users. Comparing against the first entry of that page checks
whichever account happens to be first in it, not `testdealer@example.com`
specifically — exactly the wrong-record risk this script exists to prevent.
Since the id we need to confirm is already known (hardcoded in `import.sql`),
looking it up by that id via the get-a-user-by-id endpoint and checking the
returned email is the only exact, unambiguous check the Admin API actually
supports. (This means `provision-e2e-auth-identities.sh`'s own `?email=`
lookup, used in its narrower 409-already-exists path, has the same latent
bug — out of scope to fix here, as that file is not part of this change.)

## The read-back-and-fail-closed design

The script:

1. Looks up `e7b61f70-d087-44d8-a81d-7f8a057d2775` by id via the Admin API's
   get-a-single-user endpoint.
2. Reads back the returned user's `id` (defensively, in case of a malformed
   response) and `email`.
3. Exits `0` **only** if that id exists (not `404`) and its email equals
   exactly `testdealer@example.com`.
4. Otherwise exits non-zero with an actionable message naming exactly what's
   wrong (lookup failed, id absent, or email mismatch) — never a raw
   `profiles_user_id_fkey` stack trace.

`scripts/db/seed-remote-dev-udupi-listings.sh` runs this check **before**
resolving/exporting `PGPASSWORD` and before touching `psql`, and aborts if it
fails — so a failing run never puts the real DB credential into the
environment. All of that script's pre-existing safety guards
(`ALLOW_REMOTE_DEV_UDUPI_LISTINGS_SEED`, `TARGET_ENV`, the
`EXPECTED_DEV_PG_USER` dev-project identity check, `DRY_RUN`) are unchanged;
this check is additive and runs after them.

The identity and its expected id are hardcoded in the script, not passable
via flag or env var — expanding this tool's target beyond #2304's
`testdealer@example.com` is an explicit scope boundary from #2307's approved
plan, not an oversight.

`--dry-run` is a CLI flag only, deliberately with no environment-variable
equivalent (fixed in code review cycle 2): this script is invoked
automatically, as a safety-critical dependency, by
`seed-remote-dev-udupi-listings.sh`. An env-var trigger would let an operator
who legitimately exported it once, to test this script standalone, later run
the seed script in that same shell without remembering to unset it — the
guard would then silently report success (zero HTTP calls) while verifying
nothing. Removing the env-var trigger removes that ambient-state surface
entirely.

`seed-remote-dev-udupi-listings.sh` also **force-derives**
`IMPORT_OWNER_SUPABASE_PROJECT_REF`/`_URL` from its own already-validated
`PG_USER` when it invokes this script — unconditionally, not as a
`${VAR:-default}` a caller could override. Before this fix (also cycle 2),
either variable being independently pre-set in an operator's shell could
cause the identity check to verify against a different project than the one
`psql` was about to write to, passing the guard while checking nothing
relevant to where the write actually lands. Deriving both from the same
`PG_USER` that already pins `psql`'s own target makes that divergence
structurally impossible.

## The secret-handling contract

Same contract as `scripts/dev/provision-e2e-auth-identities.sh` (see
`docs/e2e-auth-provisioning.md`'s "secret-handling contract" section for the
full rationale): `IMPORT_OWNER_SUPABASE_SERVICE_ROLE_KEY` is supplied ONLY as
an ephemeral environment variable for a single invocation. It is never
written to any file, never logged, never echoed. The script reuses
`scripts/dev/lib/e2e-auth-common.sh`'s shared `_e2e_auth_mask` (secret
masking) and `_e2e_auth_curl_config_escape`/`_e2e_auth_curl_wrapper` (the
`curl --config -` stdin-delivery pattern that keeps the key out of argv and
process listings) rather than reimplementing them.

## Running it

```bash
IMPORT_OWNER_SUPABASE_SERVICE_ROLE_KEY=<key> \
  scripts/dev/provision-import-owner-identity.sh
```

For a **standalone** invocation, `IMPORT_OWNER_SUPABASE_PROJECT_REF`/
`IMPORT_OWNER_SUPABASE_URL` default to the known Udupi remote-dev project
(`elyqnysyqbqoxqqrpiir`) — so only the service-role key needs supplying for
the common case. (When invoked *by* `seed-remote-dev-udupi-listings.sh`,
these two are force-derived from its `PG_USER` instead — see above — so a
standalone override has no effect on that integrated path.) Use `--dry-run`
to validate env vars/guards without making any HTTP call.

`seed-remote-dev-udupi-listings.sh` invokes this script automatically before
applying `import.sql`; a caller running that script for real must also
supply `IMPORT_OWNER_SUPABASE_SERVICE_ROLE_KEY` ephemerally, or the seed
script now fails closed with this script's actionable message instead of
proceeding to `psql`.

## Ops sequence

1. Confirm the identity precondition (manually, or let the seed script run
   it automatically): `IMPORT_OWNER_SUPABASE_SERVICE_ROLE_KEY=<key>
   scripts/dev/provision-import-owner-identity.sh`.
2. If it exits non-zero, resolve the reported problem (provision the
   identity via the Supabase dashboard/Auth admin API, or resolve an id
   mismatch) before proceeding. This script never does that provisioning
   itself.
3. Run `scripts/db/seed-remote-dev-udupi-listings.sh` as documented in its
   own header. It re-runs the same check before touching `psql`.

## Out of scope — #1723's synthetic identity (follow-up #2688)

`data/imports/bangalore-housing-1723/full-bengaluru/import.sql` (already
merged) hardcodes a *different*, openly synthetic owner UUID
(`2bcf2d76-fb18-6375-485c-3cdbb94bc77a`, email `housing-import@seed.local`)
that has never existed as a real `auth.users` row on any project. Unlike
`testdealer@example.com`, this identity cannot simply be "verified" into
existence: Supabase's Auth admin API does not accept a caller-supplied id, so
there is no create call that would produce that exact UUID.

This is an explicit, owner-decided, **out-of-scope** limitation for #2307,
not an oversight: #1723's `import.sql` and its hardcoded UUID are
intentionally untouched by this change. Whether/how to amend #1723's owner
identity (e.g. regenerating its artefacts against a real identity, the way
#2309 did for #2304) is tracked separately in follow-up issue
[#2688](https://github.com/gouthamrao/udupi-property-explorer/issues/2688)
and is a larger decision than this fix's scope.

A separate, already-merged anti-pattern —
`data/imports/commercial-inventory-2575/remediate-ownership-2608.sql`
directly `INSERT`ing into `auth.users` for `testdealer@example.com` (missing
GoTrue-required fields, so it satisfies the FK but cannot authenticate) — is
also out of scope here and is tracked in follow-up issue
[#2687](https://github.com/gouthamrao/udupi-property-explorer/issues/2687).
