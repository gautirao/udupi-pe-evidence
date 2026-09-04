# Issue #2427 — J1 option (b): retarget `discover-real-data-smoke.spec.ts` to Bangalore

Evaluated by reading every assertion in J1-J4 and asking, per assertion: is this
testing something about **Udupi**, or something about **Discover** that Bangalore
exercises equally?

## Answer

**No behaviour in J1-J4 is Udupi-specific.** All four test city-agnostic
contracts. What is Udupi-specific is only the *data identity* they happen to pin:
node keys, area keys, the school's home area, and one keyword literal.

There is no legacy-vs-canonical assertion and no city-switch assertion anywhere in
this file. J1 in fact asserts the **opposite** of legacy behaviour — that the
canonical `node=` carries AREA state and the legacy `areaKey=` is absent — which
is a repo-wide #2117 contract, not a Udupi one.

## Per-assertion breakdown

Legend: **SUBSTITUTION** = needs only a key/name swap · **RETUNE** = swap plus a
value to re-derive · **COVERAGE LOSS** = something stops being tested.

### J1 — area-first anon (`:244-314`)

| Line | Assertion | Verdict |
| --- | --- | --- |
| 262-265 | Leaflet zoom control mounts at the city root | generic, no change |
| 268-273 | city-root camera-sync settles `zoom >= 1` into the URL | generic, no change |
| 276 | consent banner dismissed | generic, no change |
| 281-286 | zoom until a `area-destination-marker` for `d:n` appears, click it, URL gains `node=<direction>` | **SUBSTITUTION** — `d:n` → `d:southeast` |
| 289-294 | zoom until `area-single-marker` for Brahmavar appears, click it, URL gains `node=a:<areaKey>` | **SUBSTITUTION** — Brahmavar → `RR Nagar` (a `d:southeast` leaf with 2 LIVE fixture listings) |
| 298-301 | the legacy `areaKey=` param must be null — canonical state only | generic #2117 contract, no change |
| 304-310 | at least 1 real listing card after activating the AREA | **SUBSTITUTION** — RR Nagar carries listings |
| 313 | zero 401/403 across the anon journey | generic, no change |

One honest nuance, not an assertion loss. J1's comment describes the Udupi root as
collapsing every area into a single visual cluster that only breaks into
Directions after zooming. Bangalore's root renders its Directions immediately, so
`zoomUntilMarkerVisible` would return on its first check. No assertion depends on
the collapse, so nothing stops being *asserted* — but the dense-city-root
break-out path would stop being *exercised* incidentally.

### J2 — school-radius anon (`:320-353`)

| Line | Assertion | Verdict |
| --- | --- | --- |
| 212-238 | `beforeAll` prefetches a school via `/api/public/schools/by-area?areaKey=Manipal` | **SUBSTITUTION** — → RR Nagar or Vijayanagar, the fixture's two school-bearing areas |
| 332-343 | `/school-radius-listings` endpoint fires | generic, no change |
| 346-349 | at least 1 listing card | **RETUNE** — `radiusKm=2` must actually reach a listing from the substituted school; needs re-deriving against the fixture's real coordinates |
| 352 | zero 401/403 | generic, no change |

### J3 — school-first auth (`:359-436`)

| Line | Assertion | Verdict |
| --- | --- | --- |
| 388-389 | skips without broker credentials / school data | generic, no change |
| 394-406 | storageState or UI login fallback | generic, no change |
| 409-420 | `/school-radius-listings` fires on the authenticated path | generic, no change |
| 424-435 | at least 1 card **or** property marker **or** cluster | **RETUNE** — same radius question as J2, though the three-way `or` makes it far more tolerant |

### J4 — keyword search (`:443-493`)

| Line | Assertion | Verdict |
| --- | --- | --- |
| 456-457 | navigate to `node=a:<Manipal>`, cards render | **SUBSTITUTION** — → RR Nagar |
| 460 | self-skips when the area has fewer than 2 listings | **RETUNE, and the real risk** — RR Nagar has exactly 2 LIVE fixture listings, so it sits on the skip threshold. One listing fewer and J4 silently skips instead of testing anything |
| 462-475 | `q=apartment` yields at least 1 card | **RETUNE** — "apartment" is a Manipal seed property. The keyword must be re-derived from the Bangalore fixture's listing text, or the filter matches nothing |
| 476-479 | filtering never inflates the count beyond baseline | generic, no change |
| 482-490 | clearing `q` restores at least the filtered count | generic, no change |
| 493 | zero 401/403 | generic, no change |

## Summary

| | Count |
| --- | --- |
| Assertions needing nothing | 13 |
| SUBSTITUTION only | 6 |
| RETUNE (swap plus a re-derived value) | 4 |
| **COVERAGE LOSS** | **0 at the assertion level** |

## The real cost, which is not per-assertion

Retargeting removes the last real-backend Discover journey coverage for **Udupi**
from the `smoke` project — the product's home city. Two qualifiers matter:

- That coverage is **already dead**. J1 cannot pass against this fixture today, and
  J2-J4 never run because serial mode masks them behind it. Retargeting forfeits
  nothing that currently works.
- But it makes the loss **permanent and invisible**, whereas leaving J1 red keeps
  the gap visible. If Udupi Discover regresses after a retarget, no smoke test
  notices.

There is also a coupling point worth stating: retargeting onto `d:southeast` /
RR Nagar uses only nodes the fixture **already has**, so option (b) is independent
of the Bangalore Option 1 decision and can land either way. Retargeting onto
`d:central` / Koramangala instead would couple J1 to Option 1 landing first.

## Recommendation

**Option (b) is sound, low-risk and materially cheaper than promoting a Udupi
hierarchy — but it is second choice, and only clearly right if the owner does not
want to touch Udupi at all.**

Reasoning: it costs 6 substitutions and 4 retunes with zero assertion loss, and it
avoids Table B entirely — the six Udupi spec files and roughly fifteen assertion
sites that a promoted Udupi revision would flip from legacy to canonical. Against
that, it silently abandons home-city Discover coverage in the gate.

If the owner wants Udupi covered, the narrowest `d:n` + Brahmavar seed remains the
honest fix and Table B is the price. If the owner wants the gate green and the
blast radius contained, option (b) does that today with no dependency on the
Bangalore decision.

Concrete retarget targets if option (b) is chosen: `d:southeast` for the
Direction, `a:IN|KA|Bengaluru|RR Nagar` for the AREA, a school in RR Nagar or
Vijayanagar for J2/J3, and a keyword re-derived from the fixture's own listing
text for J4. The J4 two-listing skip threshold should be re-examined at the same
time — as written it would degrade into a silent skip rather than a failure.
