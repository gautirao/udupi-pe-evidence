# Issue #2427 — Option 1 blast radius, per spec

Verdicts use **BREAKS / SAFE / UNKNOWN-needs-run**, plus **ALREADY-FAILING** where
a run proved the spec cannot pass against this fixture today. A spec that already
fails cannot be "broken" by a change, and that distinction decides the Bangalore
question.

## Two corrections to my earlier claims

**1. I wrote "no assertion in the repo pins the Bangalore root's direction
count". That was false.** `e2e/discover/issue-1956-pr2-destination-surface.spec.ts:81,87,94,95`
is unmocked, runs at the Bangalore city root, and asserts `toHaveCount(2)`
exhaustively on both panel cards and `area-destination-marker` map markers.

**2. The fixture is out of step with three different Bangalore hierarchies, not
one.** That reframes the decision, and it argues *for* Option 1.

| Hierarchy | Nodes | Who targets it |
| --- | --- | --- |
| What the fixture has | `d:northeast`, `d:southeast`, `d:southwest`, one northeast cluster, 9 areas | canonical suite, `issue-1956-pr3-area-clustering` |
| `d:central` family | `d:central`, `c:central:…btm-layout…koramangala`, Koramangala, BTM Layout | **J5, gap 2**, `issue-2142`, `2189`, `issue-2015`, `issue-2016` |
| `d:w` / `d:e` family | `d:w`, `d:e`, `c:e:…domlur-layout`, Basaveshwara Nagar, Binnipete, Domlur | `#1956` PR-2 family, parts of PR-4/PR-5/PR-6 |

## Evidence run

```
npm run test:e2e:local -- --project=full \
  e2e/discover-city-listings-empty-city-guard-2189.spec.ts \
  e2e/discover/issue-2142-hierarchy-back-direction-root.spec.ts \
  e2e/issue-2016-result-scope-contract.spec.ts \
  e2e/discover/issue-1956-pr2-destination-surface.spec.ts
```

Project that ran: `full`. Exit code **1**. **11 failed, 5 did not run, 0 passed.**
Raw output: `fixture-gap-scope-probe.log.txt`.

`issue-2016` fails on *the identical assertion as J5* —
`navigation-child-card-d:central` not visible
(`issue-2016-result-scope-contract.spec.ts:108`). Its 5 "did not run" siblings are
masked by serial mode, exactly the way J2-J4 are masked behind J1.

**The `d:central` gap is therefore not a two-test problem. It is at least 7
failing tests plus 5 masked**, of which this issue names only 2.

## Table A — Bangalore: adding `d:central` + central cluster + Koramangala + BTM Layout

| File:line | Assertion at the Bangalore root | Mocked? | State today | Verdict |
| --- | --- | --- | --- | --- |
| `canonical/discover-area-first.canonical.ts:72-73` | `South-East` / `North-East Bangalore` visible, exact label | no | not run here | **SAFE** — named siblings, not exhaustive membership |
| `canonical/discover-area-first.canonical.ts:79-80` | strip matches `/\d+\s*areas?/i`, `/\d+\s*propert(y\|ies)/i` | no | not run here | **SAFE** — regex, no literal pinned |
| `canonical/discover-area-first.canonical.ts:88` | a healthy hierarchy never writes `scope=` | no | not run here | **SAFE** — independent of child count |
| `canonical/panel-exclusivity.canonical.ts:106-108` | exactly one primary surface; `South-East Bangalore` visible | no | not run here | **SAFE** — same presence shape |
| `canonical/discover-school-first.canonical.ts:87-91` | parses school count, asserts `> 0` | no | not run here | **SAFE** — parsed; absorbs Koramangala's added schools |
| `issue-1956-pr2-destination-surface.spec.ts:81,87,94,95` | `toHaveCount(2)` exhaustive, panel **and** map, expects `d:w`+`d:e` | no | **FAILS**, 6/6 tests (evidenced) | **ALREADY-FAILING** — the fixture has 3 directions and neither is `d:w`/`d:e`, so the count is already wrong and `d:central` changes nothing about its outcome |
| `issue-2142-hierarchy-back-direction-root.spec.ts:37,60` | `d:central` "Back to Bangalore" control | no | **FAILS**, 2/2 (evidenced) | **FIXED BY Option 1** |
| `discover-city-listings-empty-city-guard-2189.spec.ts:35,75` | canonical AREA load, City→Direction→Cluster→AREA over `d:central` | no | **FAILS**, 2/2 (evidenced) | **FIXED BY Option 1** |
| `issue-2016-result-scope-contract.spec.ts:108` + 5 serial siblings | `navigation-child-card-d:central` visible | no | **FAILS** 1, 5 masked (evidenced) | **FIXED BY Option 1** |
| `issue-2015-search-this-area-viewport.spec.ts` | `d:central` / Koramangala / central cluster | no | not run | **UNKNOWN-needs-run** — same absent nodes, so likely also fixed |
| `discover-cluster-focus-back.spec.ts`, `discover-schools-mobile-cluster-2124.spec.ts`, `issue-1823-camera-fit-policy.spec.ts` | reference `d:central`, serve their own payloads | **yes** | — | **SAFE** — never read the fixture |
| `capture-*-polish-*.spec.ts`, `capture-bangalore-1745-evidence.spec.ts` | literal `schoolCount` values | **yes** | — | **SAFE** — never read the fixture |

**No row is BREAKS.** The only exhaustive root count is already failing for a
different missing hierarchy, and Option 1 additionally repairs three specs
(seven tests) beyond the two this issue names, unmasking five more.

## Table B — Udupi: promoting a canonical hierarchy (`d:n` + Brahmavar)

Every row below leaves `/navigation/resolve` **unmocked** — the call that decides
whether the canonical hierarchy takes over. A spec can therefore mock
`/api/discover/areas` and still flip into canonical mode, while its own mocks go
on serving legacy payloads.

| File:line | Assertion | Mocked? | Verdict |
| --- | --- | --- | --- |
| `discover-area-cards.spec.ts:51,55` | at least one legacy `.area-marker` at the Udupi root | **no** — the `page.route` block is scoped to a later describe (line 191+) | **BREAKS** |
| `discover-area-cards.spec.ts:67-73` | clicks the first legacy `.area-marker` | **no** — same | **BREAKS** |
| `discover-area-cards.spec.ts:110-125` | legacy area markers replaced on city switch | **no** — same | **BREAKS** |
| `discover-correctness-1067.spec.ts:55,62` | legacy `.area-marker` + `area-card` for Padubidri | no | **BREAKS** |
| `discover-correctness-1064.spec.ts:59` | legacy `.area-marker` on the Udupi journey | no | **BREAKS** |
| `discover-viewport.spec.ts:44,67,80` | legacy `.area-marker` at Udupi viewports | no | **BREAKS** |
| `discover-area-nav-journey.spec.ts:158,164,175,231,262,294` | legacy `.area-marker`; line 144 states it deliberately exercises "the LEGACY `.area-marker` ring markers" | **partial** — mocks `/api/discover/areas` and `/regions`, **not** `/navigation/resolve` | **BREAKS** |
| `discover-opensearch-parity.spec.ts:188` | area-card assertion on a Udupi journey | no | **UNKNOWN-needs-run** |
| `discover-city-switch.spec.ts:40-55` | city combobox label only | no | **SAFE** — never reads the map layer |
| `discover-agri-journey-1375.spec.ts`, `discover-school-first-journey.spec.ts`, `discover-to-trends.spec.ts`, `capture-*-1770/1771` | Udupi journeys | **yes** | **SAFE** |

### Udupi specs that would go legacy → canonical

1. `discover-area-cards.spec.ts` — first describe, 3 root tests
2. `discover-area-nav-journey.spec.ts` — J2a and siblings, 6 assertion sites
3. `discover-correctness-1064.spec.ts`
4. `discover-correctness-1067.spec.ts`
5. `discover-viewport.spec.ts`
6. `discover-opensearch-parity.spec.ts` — unconfirmed

Six spec files, roughly 15 assertion sites, none in this issue's scope. **None
are in the `smoke` project, so the pre-push gate would not catch the damage** —
it would surface later in `full`/canonical.

## Recommendation

- **J5 / gap 2 → Option 1.** No BREAKS row, it keeps both specs byte-identical,
  and it repairs three further specs while unmasking five tests. Strictly better
  than retargeting on this evidence.
- **J1 → owner's call, unchanged.** Table B is real and none of it is in scope.
  The narrowest `d:n` + Brahmavar seed is still the least-bad path, but it needs a
  `full`-suite run over those six files before anyone trusts it.

## Hierarchy families — who depends on each, and probed state

| Family | Nodes | Unmocked specs depending on it | Probed state |
| --- | --- | --- | --- |
| **A. What the fixture has** | `d:northeast`, `d:southeast`, `d:southwest`, `c:northeast:hoskote-…`, 9 areas | `canonical/discover-area-first.canonical.ts`, `canonical/panel-exclusivity.canonical.ts`, `canonical/discover-school-first.canonical.ts`, `issue-1956-pr3-area-clustering.spec.ts` | not probed here; these are the specs the fixture was built for |
| **B. `d:central` family** | `d:central`, `c:central:…btm-layout…koramangala`, Koramangala, BTM Layout | `discover-schools-canonical-2124.spec.ts` (**J5, gap 2**), `issue-2142-hierarchy-back-direction-root.spec.ts`, `discover-city-listings-empty-city-guard-2189.spec.ts`, `issue-2016-result-scope-contract.spec.ts`, `issue-2015-search-this-area-viewport.spec.ts` | **FAILING** — probed: 2142 2/2, 2189 2/2, 2016 1 + 5 masked; J5/gap 2 from the smoke run. 2015 not probed |
| **C. `#1956` `d:w`/`d:e` family** | `d:w`, `d:e`, `c:e:…domlur-layout`, Basaveshwara Nagar, Binnipete, Domlur Layout, C V Raman Nagar | `issue-1956-pr2-destination-surface.spec.ts`, `-pr2-breadcrumb`, `-pr2-count-copy`, `-pr2-filters-survive-navigation`, `-pr2-guarded-hierarchy-back`, `-pr4-listing-peek-camera-restore`, `-pr4-price-auth-contract`, `-pr5-mobile-list-first`, `-pr6-journey-switch-conversion`, `issue-1956-areas-adaptive-journeys` | **FAILING** — probed: pr2-destination-surface 6/6. The rest not probed but target the same absent nodes |

## Option 1's scope — and a structural blocker on the wider option

### Unit 1: add the Central branch only (recommended)

Add `d:central`, the central cluster, Koramangala (school-bearing) and BTM Layout
(zero-school), with schools and listings for Koramangala.

- **Unblocks:** family B — J5, gap 2, `issue-2142` (2 tests), `2189` (2 tests),
  `issue-2016` (1 test plus 5 unmasked), probably `issue-2015`.
- **Cost:** one direction, one cluster, two areas, ~4 schools, a few listings, in
  the seed files the restore script already loads.
- **Risk:** no BREAKS row in Table A. Root directions go 3 → 4, which no assertion
  pins.

### Unit 2: make the fixture carry all three families — **not achievable as stated**

`issue-1956-pr2-destination-surface.spec.ts:81,87,94,95` asserts
`toHaveCount(2)` **exhaustively**, on both panel cards and map markers, at the
Bangalore root, and expects exactly `d:w` + `d:e`. Its own test name says so:
"city root renders 3-5 (here: 2, the full seeded set) … and NO whole-city
intermediate marker".

So family C requires the Bangalore root to contain **exactly two** Directions,
while families A and B require it to contain the three it already has plus a
fourth. **The three families are mutually exclusive at the root.** Adding all of
them makes the root 6 wide and leaves family C failing exactly as it fails now,
just with a different wrong number.

Family C can therefore only be repaired by one of:

1. **Give `#1956` its own city fixture** with exactly `d:w` + `d:e` — the correct
   fix, and clearly its own piece of work, not #2427's.
2. **Change that spec's exhaustive count** — a test-ownership decision for whoever
   owns #1956, and it would weaken the "no whole-city intermediate marker"
   negative proof the count exists to make.

Either way it is out of scope here, and nothing in Unit 1 makes it worse: family C
fails today and fails identically afterwards.

### Recommendation on scope

**Take Unit 1 only.** It is small, it has no BREAKS row, it repairs seven tests
and unmasks five, and it leaves family C exactly where it already is. Family C
deserves its own issue, and the "one root, three incompatible hierarchies" finding
should be recorded there — it is the reason that family has been quietly red.
