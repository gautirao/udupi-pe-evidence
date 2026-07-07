# Public trust-badge contract — issue #1567

## Public vocabulary (the ONLY values a public discovery response may emit)
`verified` · `trusted` · `listed` · *(field absent / null = no badge)*

Aligned with the ReTrends design-system lint (`docs/design/retrends-design-system/_adherence.oxlintrc.json:97-98`, which restricts the trust prop to `verified|trusted|listed`).

## Mapping (internal grade → public value)
| internal `trustTier` | public `trustBadge` |
|---|---|
| `A` | `verified` |
| `B` | `trusted` |
| `C` | `listed` |
| `D` | *(null — no badge)* |
| `null` / unknown / lowercase / any other | *(null — no badge)* |

Rule: strict allow-list, default null. A public badge is **never invented** for a listing without a genuine A/B/C grade.

## anon == authed
`trustBadge` is identical for anonymous and authenticated callers — it is a public-safe projection with no ownership/tier distinction. It is **not** branched on `isAuthenticated` (unlike price, which is auth-branched).

## What the buyer sees (live Udupi/Manipal data, 2026-07-06)
- Area-first **For Sale** (D/null-tier seed): no badge (clean cards).
- Area-first **For Rent** (QA-1745 C-tier seed): `Listed` badge on each card.
- School-first & agri-first: no badge (badge-free by contract).
- Never a raw letter grade (A/B/C/D) on any card; never a `trustTier` key on the wire.
