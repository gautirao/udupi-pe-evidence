# #1786 — Public listing-detail trust badge: before/after JSON

Scope: `GET /api/public/listings/{id}` for **authenticated** buyers (the anonymous teaser path is
untouched — it uses `ListingTeaserResponse`, which has no trust fields at all).

## Authenticated buyer, listing with `trust_tier = 'A'`

**BEFORE (vulnerability):**
```json
{
  "id": "00000000-0000-0000-0000-000000000099",
  "status": "LIVE",
  "title": "Sea View Villa",
  "trustTier": "A",
  "...": "..."
}
```
The raw internal letter grade (`A`/`B`/`C`/`D`) was returned verbatim to any authenticated buyer —
an internal moderation/scoring signal never meant to be public.

**AFTER (fix):**
```json
{
  "id": "00000000-0000-0000-0000-000000000099",
  "status": "LIVE",
  "title": "Sea View Villa",
  "trustBadge": "verified",
  "...": "..."
}
```
`trustTier` is `null` (and therefore omitted by `@JsonInclude(NON_NULL)`-style serialization used
elsewhere in this DTO family / simply absent per the controller test assertion
`jsonPath("$.trustTier").doesNotExist()`); `trustBadge` carries only the public-safe projected
word.

## Tier → badge projection table (via `TrustBadge.publicBadge`, unchanged, reused as-is)

| Raw `trustTier` | Public `trustBadge` | Public `trustTier` |
|---|---|---|
| `A` | `"verified"` | `null` |
| `B` | `"trusted"`  | `null` |
| `C` | `"listed"`   | `null` |
| `D` | `null` (no badge shown) | `null` |
| `null` | `null` | `null` |

## Internal admin/owner response (`toResponse`) — unchanged

```json
{
  "id": "00000000-0000-0000-0000-000000000099",
  "status": "LIVE",
  "trustTier": "A",
  "trustBadge": null,
  "...": "..."
}
```
Internal/admin/broker-facing responses keep the raw grade in `trustTier`, exactly as before this
change; `trustBadge` is always `null` on this path — it's a public-only field.

## Anonymous teaser (`toTeaserResponse` / `ListingTeaserResponse`) — unchanged

Anonymous callers never received trust fields before this change and still don't — the teaser DTO
has no `trustTier`/`trustBadge` component at all. This fix does not touch `toTeaserResponse`,
`toTeaserResponseList`, or `ListingTeaserResponse.java`.
