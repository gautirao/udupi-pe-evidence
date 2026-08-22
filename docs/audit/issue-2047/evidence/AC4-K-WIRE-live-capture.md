# AC4 / K-WIRE — live capture against hosted Supabase

**Date:** 2026-08-22 · **Purpose:** convert #2280 from code-reasoning into an observed result.
**Authorised:** owner-approved, scoped to this single capture, under the OQ-1 identity grant.

## PII protocol (binding, agreed before execution)

This capture reads real hosted data, so it was designed so that it **cannot** emit personal information:

- Narrowed projection `select=id,contact_phone,contact_info` — **not** `select('*')`. Nothing else was
  fetched, so nothing else could leak.
- The response was parsed **in memory**; only aggregates were emitted: HTTP status, key-presence booleans,
  row count, non-null counts. There is no code path in the capture script that prints payload content.
- No value, no partial value, no screenshot of a payload.
- The identity was deleted immediately after the capture, in a `finally` block so it would be removed even
  on failure.

## Environment

No local fixture or backend was involved, and none was claimed. This exposure path is
**browser → hosted Supabase PostgREST**, bypassing the backend entirely, so the local fixture is irrelevant
to it. The request went to the hosted project.

## Step 1 — provision a plain authenticated user

`audit2047-buyer@udupi-audit.invalid` → uuid `d1dbd82d-927c-4a73-aa52-1ce5097c4760`.

**No role row was assigned.** This is deliberate and it strengthens the test: the caller is not an admin, not
a broker, not a dealer, and owns none of the rows queried. It is the weakest possible authenticated identity.

## Step 2 — authenticate

`POST /auth/v1/token?grant_type=password` → **HTTP 200**. JWT obtained; value not printed.

## Step 3 — the exposure query

```
GET /rest/v1/property_listings?select=id,contact_phone,contact_info&status=eq.LIVE&limit=200
Authorization: Bearer <user JWT>
```

| Measure | Observed |
|---|---|
| HTTP status | **200** |
| Rows returned | **200** |
| `contact_phone` key present in payload | **true** |
| `contact_info` key present in payload | **true** |
| Rows with non-null `contact_phone` | **0** |
| Rows with non-null `contact_info` | **0** |

## Step 4 — is the null result a sampling artefact? (counts only)

Aggregate counts, no values fetched:

| Query | Count |
|---|---|
| LIVE listings, total | **1847** |
| LIVE with `contact_phone` NOT NULL | **0** |
| LIVE with `contact_info` NOT NULL | **0** |
| ANY status with `contact_phone` NOT NULL | **0** |

Not a sampling artefact. The contact columns are **entirely unpopulated** across the hosted project.

## Step 5 — cleanup

Identity `d1dbd82d-927c-4a73-aa52-1ce5097c4760` deleted → **HTTP 200**. Nothing left provisioned.

---

## Result — and a correction to #2280's severity

**The access-control gap is CONFIRMED and now OBSERVED, not inferred.** A plain authenticated user with no
role, no admin rights and no ownership of the rows received the `contact_phone` and `contact_info` columns
directly from hosted Supabase, with the backend not involved at any point. This is exactly what #2280
predicted from `V10__update_rls_for_mvp_roles.sql:26-31` being a row filter: Postgres RLS cannot restrict
columns, so a wide projection returns them. AC4's DOM-versus-wire distinction is now settled by observation.

**But the current data impact is nil, and #2280 should say so.** Zero rows carry contact data at any status.
The exposure is therefore **latent, not active**: no personal information is reachable today, and the defect
is that the *access boundary* is wrong. The moment any listing acquires a `contact_phone` — the backend
already writes that column on ingest, per `ListingIngestionService.java:137-138` — it becomes readable by
every authenticated user of the product.

This refinement **lowers #2280's immediate severity** while leaving the structural defect fully intact. It is
recorded prominently because the audit had characterised #2280 in terms that could be read as implying live
PII exposure, and that reading would be wrong on today's data. A finding that overstates present impact gets
distrusted, and correctly so — the fix is still required, but it is a hardening fix ahead of the data
arriving, not an active-breach response.

**Recommended re-characterisation for #2280:** keep the defect, keep the four call sites, but state that the
exposure is currently latent (0 of 1847 LIVE listings populated) and that severity escalates the moment
contact data is written. Also note it cannot be closed by observing "no data is exposed today" — the guard
is genuinely absent, and ingestion writes that column.
