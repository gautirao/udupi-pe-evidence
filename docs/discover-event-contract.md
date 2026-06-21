# discover_event — Event Contract (M30)

> Status: foundational stream (issue #1531). This document is the data contract for the
> append-only `discover_event` telemetry stream. Downstream aggregation (#1532) MUST read
> this contract and aggregate against the field semantics, enums, and guarantees below.

## Purpose

`discover_event` captures **anonymous, PII-free** behavioural signals from the Discover
experience so that #1532 can later compute supply-vs-demand gaps. It is **append-only**:
this issue writes events; it never reads them back (the read/aggregation path is #1532).

## Hard guarantees (safe-by-construction)

- **No PII, ever.** No `user_id`, `email`, `phone`, `name`, `ip`, `user_agent`,
  `device_id`, `fingerprint`, `raw_price`, `lat`/`lng`, or `exact_address` is accepted,
  stored, logged, or derivable. The schema has no column that can hold personal data.
- **`session_id` is anonymous.** A client-generated UUID, **never** tied to a user
  account and **not** a foreign key to any user/auth table. On the client it lives in
  `sessionStorage` and is cleared on tab close.
- **Prices only as coarse bands.** Raw numeric prices are rejected at the boundary; only
  the coarse `price_band` labels below are accepted.
- **Whitelist enforced at the API boundary.** Any `filters` key not on the explicit
  allow-list causes the **whole request** to be rejected with `400` (never silently
  dropped). `filters` values must be scalar (string / number / boolean).
- **Consent default-deny.** The client emits an event only when consent is explicitly
  granted (see "Consent" below). There is **no user-facing consent UI yet** — it is
  tracked as a separate dependency (**#1576**) and must ship before broad production
  telemetry. Until then the stream is inert by design.

## Endpoint

```
POST /api/discover/events
```

- **Auth:** none (anonymous / public). This is the only path added to the Spring Security
  public allow-list; no other route is affected.
- **Request shape (batched):**

```json
{
  "events": [
    {
      "session_id": "<uuid>",                 // required, must parse as UUID
      "event_type": "FILTER_APPLY",           // required, enum (below)
      "area_key": "<coarse string|optional>",
      "property_type": "<coarse string|optional>",
      "listing_purpose": "<coarse string|optional>",
      "price_band": "50L_1CR",                 // optional, enum (below); raw price rejected
      "filters": {                             // optional; only allow-listed scalar keys
        "property_type": "agricultural_land"
      }
    }
  ]
}
```

- **Success:** `202` `{ "accepted": <int> }`.
- **`400`** on any validation violation (whole batch rejected): unknown `filters` key;
  non-scalar `filters` value; `event_type` not in enum; missing/non-UUID `session_id`;
  `price_band` not in the allowed set; an over-length `area_key`/`property_type`/
  `listing_purpose`.
- **`413`** when the batch exceeds the maximum size.
- **`429`** when the per-session rate limit is exceeded.
- **Fire-and-forget:** the client ignores the response and never surfaces telemetry errors
  to the user.

### Path deviation note (read before consuming)

Issue #1531's body literally specified `POST /api/events/discover`. The implementation
**deliberately** uses the more RESTful `POST /api/discover/events`. This is the single
source of truth for the path — **#1532 and any other consumer MUST use
`/api/discover/events`.** The deviation is intentional and documented here and in the PR.

## Enumerations & limits (single source of truth: `DiscoverEventAllowList.java`)

| Concept | Allowed values |
|---|---|
| `event_type` | `FILTER_APPLY`, `PANEL_OPEN`, `LEAD_INTENT` |
| `filters` keys | `area_key`, `property_type`, `listing_purpose`, `price_band`, `sort_by`, `page` |
| `price_band` | `UNDER_5L`, `5L_20L`, `20L_50L`, `50L_1CR`, `1CR_2CR`, `ABOVE_2CR`, `UNSPECIFIED` |
| Max batch size | `50` events per request |
| Rate limit | `60` events per `session_id` per `10` minutes (in-memory, per-instance — see runbook) |

`filters` values must be scalar (string / number / boolean). Nested objects and arrays are
rejected with `400`.

## Stored columns (Flyway `V93__discover_event.sql`)

| Column | Type | Notes |
|---|---|---|
| `id` | `bigserial` PK | |
| `session_id` | `uuid NOT NULL` | client-generated; no FK; not user-derived |
| `event_type` | `text NOT NULL` | `CHECK IN ('FILTER_APPLY','PANEL_OPEN','LEAD_INTENT')` |
| `area_key` | `text` | coarse locality token |
| `property_type` | `text` | coarse |
| `listing_purpose` | `text` | coarse |
| `price_band` | `text` | coarse band label only; never raw price |
| `filters_jsonb` | `jsonb NOT NULL DEFAULT '{}'` | whitelist-validated at the boundary |
| `ts` | `timestamptz NOT NULL DEFAULT now()` | indexed for retention range scans |

## Consent (default-deny)

- The client reads `localStorage['discover_telemetry_consent']` and emits **only** when the
  value is exactly `"granted"`.
- Missing key, any other value, or storage that throws → **fail closed** (no network call,
  no exception). The consent check happens **before** any request is built.
- **No consent UI is provided by this issue.** The real user-facing consent control is
  **#1576** and must ship before broad production telemetry.

## Retention

Behavioural rows are purged after **180 days** (per the #1520 legal retention policy) by a
scheduled job that emits an observable metric. See
[`docs/runbooks/discover-event-retention.md`](./runbooks/discover-event-retention.md).

## Aggregation guidance for #1532

- Read append-only; do not mutate.
- Group by `event_type`, `area_key`, `property_type`, `listing_purpose`, `price_band`,
  and `ts` buckets. Treat `session_id` as an anonymous de-dup/grouping key only — never
  attempt to resolve it to a person (it cannot be).
- The `price_band` set above is the only pricing granularity available; do not expect raw
  prices.
- `filters_jsonb` only ever contains allow-listed scalar keys.
