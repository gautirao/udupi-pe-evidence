# E2E retirement map — #2860 follow-up: T1c homepage sign-out leg (csv row 9)

Per-assertion map of `e2e/auth-journey-1509.spec.ts` ([manifest](e2e-retirement-manifest.csv) row 9) onto the
canonical suite. Source: approved plan `.claude/handoffs/issue-28601/approved-plan.toml` (local, git-ignored)
`[assertion_map.csv9_auth_journey_1509]`. Durable source for the mutation receipts of the PROVEN rows A6-3 and A7-1 (verbatim):
PR #2876 comment https://github.com/gautirao/udupi-property-explorer/pull/2876#issuecomment-6288391887.
Every `.claude/handoffs/...` path cited below is local and git-ignored (not verifiable from another checkout).
Canonical file: `e2e/canonical/auth-session.canonical.ts` (abbreviated `AS`); T1c = matrix id `T1c` (canonical-user, localAuthOnly).

**Nothing in this document is deletion-ready.** No legacy spec is deleted. Manifest row 9 stays `MOVE_DOWN` /
`SCHEDULED(#2861)`; only its rationale text is corrected (T1c has existed since #2822).

Premise correction: T1c (sign-out from a protected route + reload, dedicated `E2E_SIGNOUT_USER_*` identity) already
existed at base `ee473dce` and is mutation-proven (MUT-D1, MUT-D2b @2d262224, `.claude/handoffs/issue-2750-canon` (local, git-ignored)). This
change appends T1c steps 7-9: `/auth?returnTo=%2F` lands exactly on `/`, signed-in homepage header, sign-out from the
PUBLIC homepage stays on `/`, reload stays signed out with no `sb-*-auth-token` key. SMOKE_USER is never signed out.

## Decisions

| Id | Decision | Status |
|---|---|---|
| DN1 | Premise correction: extend T1c (T1 family, dedicated identity) with the homepage leg rather than T1[role:user] (which cannot sign out without revoking the shared storageState). Does this satisfy owner ruling D2? | PENDING owner confirmation (Main Agent routing acceptance is not owner approval; neither authorises retirement or deletion) |
| DN2 | Nine RETAIN-superseded rows: A2-2 and A9-2 (the header Sign in opens the auth modal, not /auth), A5-1, A6-0 and A11-1 (a BARE /auth sign-in now lands on the role-aware default `/discover`, not `/`), A5-2 (so the signed-in reload is on `/discover`, not `/`), A11-4 (sign-out from /discover stays on /discover), A13-1 and A13-2 (so the post-Discover-sign-out reload is on `/discover`, not `/`) | PENDING owner confirmation (Main Agent routing acceptance is not owner approval; neither authorises retirement or deletion) |
| D9 | Discover `zoom=14` + `areaKey=` deep link does not hold URL zoom (see finding below) | OPEN |

## Per-assertion map (33 rows)

Row count note: the original plan counted 32 rows; code-reviewer r3 found the unmapped legacy L147 assertion
(`waitForURL('/')` after a bare /auth sign-in in the A6-A7 test), now row A6-0. Every `expect(`/`waitForURL`/`toHave*`
assertion in the legacy spec was re-enumerated: 33, one row each.

Status: `EXISTING` = asserted by canonical at base; `NEW` = T1c steps 7-9 (this change); `RETAIN` = not asserted
canonically (reason given; superseded rows need owner confirmation, DN2); `RETAIN-uncovered` = the legacy product path is
NOT exercised by any canonical assertion (a coverage gap, never counted as covered). Canonical-target line numbers are at
the current head. Proof column for NEW rows records the OBSERVED mutation outcome at head `c564a911` (its `AS:` line
numbers are as observed there; see accounting below; evidence under `.claude/handoffs/issue-28601/evidence/mutations/`
(local, git-ignored); durable verbatim receipts for A6-3 and A7-1: PR #2876 comment
https://github.com/gautirao/udupi-property-explorer/pull/2876#issuecomment-6288391887).

Sweep column (Codex amendment_1, one pass over all 33 rows): does the cited canonical assertion exercise the SAME product
path as the legacy assertion — bare /auth vs returnTo, header modal vs /auth page, the page on which the header/UI is
asserted (the legacy assertion's literal page), before vs after reload, same identity class? `MATCH` rows stay
EXISTING/NEW; `FAIL` rows become RETAIN (superseded, DN2) or RETAIN-uncovered; `RETAIN confirmed` rows were already RETAIN.
Footnote: "RETAIN confirmed" does not mean RETAIN at base. A3-1 and A12-1 (Codex cycle 1, C3/C4) and A5-1 and A11-1 (Codex
cycle 1, C2) were reclassified to RETAIN in Codex cycle 1, so their "RETAIN confirmed" means confirmed by the sweep run
after that reclassification; A6-0 was added in code-reviewer r3 (directly as RETAIN); A1-1, A1-2 and A2-1 were
reclassified NEW -> RETAIN-uncovered in Codex cycle 2 (D1), and their Sweep cell records that FAIL.

| ID | Legacy line + assertion | Canonical target | Proof | Status | Sweep |
|---|---|---|---|---|---|
| H-01 | L67 fillSignInForm: URL leaves /auth | `loginAsUser` postcondition (e2e/helpers.ts) via T1[user] AS:264, T1c AS:463 | sign-in exercised on every authed test | EXISTING | MATCH (bare /auth form submit both) |
| A1-1 | L90 anon `/` Sign In link visible | - | - (T1c step 9 AS:543 is a post-sign-out reload, not credited) | RETAIN-uncovered (cold-start anonymous homepage state not exercised; T1c asserts post-sign-out reload only; Codex cycle 2 D1) | FAIL -> cold-start fresh context vs post-sign-out reload |
| A1-2 | L93 anon `/` avatar count 0 | - | - (T1c step 9 AS:544 is a post-sign-out reload, not credited) | RETAIN-uncovered (as A1-1; Codex cycle 2 D1) | FAIL -> as A1-1 |
| A2-1 | L106 `/` Sign In link visible before sign-in | - | - (T1c step 9 AS:543 is a post-sign-out reload, not credited) | RETAIN-uncovered (as A1-1; Codex cycle 2 D1) | FAIL -> as A1-1 |
| A2-2 | L110 homepage Sign In click navigates to /auth | - | - | RETAIN (superseded: header link preventDefaults and opens the auth modal, AppLayout.tsx:627-631; DN2) | RETAIN confirmed |
| A3-1 | L116 after homepage sign-in lands on `/` | - | - (MUT-T1C-RET-ROOT record kept below, credit removed) | RETAIN-uncovered (the real homepage Sign in opens AuthModalContext, whose handleSuccess keeps the current path; that modal success path is not exercised by T1c, which drives `/auth?returnTo=/`; MUT-T1C-RET-ROOT proves only the `/auth?returnTo=/` redirect; Codex C3) | RETAIN confirmed |
| A4-1 | L119 homepage shows avatar | - | - (MUT-T1C-HOME-MENU record kept below, credit removed) | RETAIN-uncovered (signed-in header on `/` after the homepage modal sign-in, no navigation; T1c step 7 AS:525 asserts it after an `/auth?returnTo=/` redirect) | FAIL -> modal vs /auth page (same journey as A3-1) |
| A4-2 | L120 homepage Sign In count 0 when signed in | - | - | RETAIN-uncovered (as A4-1; T1c AS:526 is after the `/auth?returnTo=/` redirect) | FAIL -> modal vs /auth page |
| A5-1 | L130 sign-in lands on `/` | - | - | RETAIN (superseded: a BARE /auth sign-in now lands on the role-aware default `/discover`; T1c step 7 injects `returnTo=/`, so it does not exercise this path; DN2; Codex C2) | RETAIN confirmed |
| A5-2 | L137 reload keeps signed-in avatar | - | - (T1c step 2 AS:468-470 reloads on `/discover`, MUT-D2b @2d262224) | RETAIN (superseded: the legacy reload is on `/` only because of the superseded A5-1 landing; the bare-/auth sign-in now lands on `/discover`, where T1c step 2 asserts the reload; no signed-in reload on `/` is asserted; DN2) | FAIL -> reload page `/` vs `/discover` |
| A6-0 | L147 sign-in lands on `/` (A6-A7 test setup) | - | - | RETAIN (superseded: a BARE /auth sign-in now lands on the role-aware default `/discover`; T1c step 7 injects `returnTo=/`, so it does not exercise this path; same as A5-1/A11-1; DN2; code-reviewer r3) | RETAIN confirmed |
| A6-1 | L151 avatar visible on `/` before sign-out | T1c step 7 AS:525 (step 8 precondition) | NOT_PROVEN (shared line AS:525; the MUT-T1C-HOME-MENU credit is not moved) | NEW | MATCH (`/` reached by the /auth page post-sign-in navigation in both; target from returnTo vs legacy bare-/auth default is the A6-0 row) |
| A6-2 | L155 Sign out menuitem visible | T1c step 8 AS:534 | NOT_PROVEN (no mutation run) | NEW (was EXISTING citing AS:479-480, which is on `/my-bookings`) | MATCH on re-cite (menu opened on `/`) |
| A6-3 | L159 URL is `/` after sign-out from `/` | T1c step 8(c) AS:539 | PROVEN — MUT-T1C-PUBLIC-NAV, first failure AS:531 @c564a911 (`MUT-T1C-PUBLIC-NAV@c564a911.txt`) | NEW | MATCH (sign-out from public `/`) |
| A6-4 | L162 Sign In shown right after sign-out | T1c step 8(b) AS:536-537 | NOT_PROVEN (MUT-T1C-HOME-NOOP dropped per owner directive; mechanism shared with T1c step 4 AS:485) | NEW | MATCH (on `/`, before reload) |
| A7-1 | L167 reload after sign-out on `/` shows Sign In | T1c step 9 AS:543 | PROVEN — MUT-T1C-HOME-RELOAD r2, first failure AS:535 @c564a911 (`MUT-T1C-HOME-RELOAD@c564a911.r2.txt`; r1 was environmental, `MUT-T1C-HOME-RELOAD@c564a911.txt`) | NEW | MATCH (reload on `/` after sign-out from `/`) |
| A7-2 | L168 avatar count 0 after reload | T1c step 9 AS:544 | NOT_PROVEN (masked: HOME-RELOAD r2 fails A7-1 first at AS:535 @c564a911) | NEW | MATCH (as A7-1) |
| A8-1 | L179 Discover Sign In link with returnTo visible | T2 AS:673-674 | #2750 T2 evidence | EXISTING | MATCH (anon Discover header link) |
| A8-2 | L183 href decodes to /auth?returnTo=/discover... | T2 AS:675-681 | #2750 T2 evidence | EXISTING | MATCH (href only) |
| A8-3 | L184 href carries city= | T2 AS:681 (Bangalore equivalent) | #2750 T2 evidence | EXISTING | MATCH (href only) |
| A9-1 | L197 Discover Sign In link visible | T2 AS:674 | as A8-1 | EXISTING | MATCH |
| A9-2 | L200 arrives at /auth | - | - (T2 AS:687 navigates the href with goto, not a click) | RETAIN (superseded: the Discover header link preventDefaults and opens the auth modal, AppLayout.tsx:627-631, same as A2-2; DN2) | FAIL -> click opens the modal; T2 does not click |
| A9-3 | L206 returns to /discover after sign-in | - | - (T2 AS:714-738 + #2750-canon MUT #1 prove the `/auth?returnTo=` page path only) | RETAIN-uncovered (the real Discover Sign in is the modal, whose handleSuccess keeps the current path; that modal success path is not exercised; same standard as A3-1) | FAIL -> modal vs /auth page |
| A9-4 | L208 city= preserved | - | - (T2 AS:738, /auth page path only) | RETAIN-uncovered (as A9-3) | FAIL -> modal vs /auth page |
| A9-5 | L209 journey= preserved | - | - (T2 AS:738, /auth page path only) | RETAIN-uncovered (as A9-3) | FAIL -> modal vs /auth page |
| A10-1 | L212 avatar visible on Discover after sign-in | - | - (T1c AS:464 is a bare-/auth landing; T2b AS:801 is on `/my-bookings`) | RETAIN-uncovered (signed-in Discover header after the modal sign-in is not asserted; same standard as A4-1) | FAIL -> modal vs /auth page; T2b page differs |
| A11-1 | L222 sign-in lands on `/` | - | - | RETAIN (superseded: a BARE /auth sign-in now lands on the role-aware default `/discover`; T1c step 7 injects `returnTo=/`, so it does not exercise this path; DN2; Codex C2) | RETAIN confirmed |
| A11-2 | L230 avatar visible on Discover | T1c step 2 AS:468-469 (full reload of `/discover` with the persisted session); AS:464 | existing | EXISTING | MATCH (full load of `/discover` signed in; legacy goto vs reload) |
| A11-3 | L234 Sign out menuitem visible | - | - (T1c AS:479-480 is on `/my-bookings`, AS:534 on `/`) | RETAIN-uncovered (the user menu is never opened on `/discover` by a canonical test) | FAIL -> page `/discover` vs `/my-bookings` |
| A11-4 | L238 sign-out from /discover navigates to `/` | - | - | RETAIN (superseded: a public page stays in place, AppLayout.tsx:213-224, governance doc L132; public-page branch covered by A6-3; DN2) | RETAIN confirmed |
| A12-1 | L241 Sign In shown after sign-out | - | - | RETAIN-uncovered (Discover-specific immediate anonymous header is not asserted: T1c's Discover leg checks only user-menu gone before reload, and step 8 asserts Sign in on `/`, not Discover; Codex C4) | RETAIN confirmed |
| A13-1 | L246 reload after sign-out stays signed out | - | - (T1c step 5 AS:488-493 reloads on `/discover` after a `/my-bookings` sign-out, MUT-D1 @2d262224; step 9 reloads on `/` after a `/` sign-out) | RETAIN (superseded: the legacy reload is on `/` only because of the superseded A11-4 navigation; neither canonical reload follows a Discover-origin sign-out; DN2) | FAIL -> reload page `/` vs `/discover`, sign-out origin differs |
| A13-2 | L247 avatar count 0 after reload | - | - (T1c AS:491, as A13-1) | RETAIN (superseded: as A13-1; DN2) | FAIL -> as A13-1 |

**Totals:** 33 rows = EXISTING 6 / NEW 6 / RETAIN 21 (superseded 9: A2-2, A5-1, A5-2, A6-0, A9-2, A11-1, A11-4, A13-1,
A13-2 — DN2; uncovered 12: A1-1, A1-2, A2-1, A3-1, A4-1, A4-2, A9-3, A9-4, A9-5, A10-1, A11-3, A12-1). NEW 6: A6-1,
A6-2, A6-3, A6-4, A7-1, A7-2. Sweep: MATCH 12 (6 EXISTING + 6 NEW), FAIL 14, RETAIN confirmed 7.

## Equivalence limits

- EXISTING rows citing T2 use a Bangalore deep `node=` Discover URL, not the legacy udupi area-first URL; they cover the
  anonymous header link and its href only (A8-*, A9-1), not the sign-in that follows it.
- A1-1/A1-2/A2-1 (cold-start anonymous homepage) are RETAIN-uncovered: T1c asserts the anonymous `/` header only on a
  reload after two sign-in/sign-out cycles, never on a first-ever anonymous visit in a fresh context (Codex cycle 2 D1).
- Step 7 is a second sign-in of the same dedicated identity after a global sign-out (a new session), not a first sign-in,
  and it drives `/auth?returnTo=%2F` — neither the header modal (A3-1, A4-*, A9-3..A10-1) nor a bare `/auth` (A5-1, A6-0,
  A11-1).
- A6-1 asserts the signed-in header on `/` after the `/auth?returnTo=/` redirect; the legacy reached `/` from a bare
  `/auth` (that landing itself is A6-0, superseded, as A5-1/A11-1).
- A11-2 is asserted on a reload of `/discover?lat=..&lon=..&zoom=..`, not on a goto of the legacy udupi area-first URL.

## Codex fix cycle 1 disclosure

- M1-M4 (MUT-T1C-RET-ROOT, MUT-T1C-HOME-MENU, MUT-T1C-PUBLIC-NAV, MUT-T1C-HOME-RELOAD) were observed at `c564a911`.
- C1 only adds a wait in T1c step 7 (GET `/api/notifications` armed before submit, awaited before step 8, alongside the
  unread-count wait); no assertion changed. Line numbers from step 7 onward moved by +7/+8 relative to `c564a911`.
- No new mutation runs (owner directive). C2-C4 are reclassifications only: A5-1/A11-1 NEW -> RETAIN (superseded, DN2),
  A3-1 NEW -> RETAIN-uncovered (MUT-T1C-RET-ROOT credit removed), A12-1 NEW -> RETAIN-uncovered.
- amendment_1 sweep (reclassification only, no test change): A4-1/A4-2 NEW -> RETAIN-uncovered (MUT-T1C-HOME-MENU credit
  removed, not moved to A6-1); A5-2, A13-1, A13-2 EXISTING -> RETAIN (superseded, DN2); A9-2 EXISTING -> RETAIN
  (superseded, DN2); A9-3, A9-4, A9-5, A10-1, A11-3 EXISTING -> RETAIN-uncovered; A6-2 EXISTING -> NEW (re-cited to the
  `/` assertion AS:534, NOT_PROVEN); A11-2 stays EXISTING, re-cited to AS:468-469.
- code-reviewer r3 (docs only, no test change): added the previously unmapped row A6-0 (legacy L147) as RETAIN (superseded,
  DN2); totals now 33 rows. No existing row was renumbered.
- The bracketed row labels at `e2e/canonical/auth-session.canonical.ts` steps 7/8 and its header comment ("Covers the
  auth-journey-1509 homepage rows") are historical and were not updated (only C1 changes test code); this map is authoritative.

## Codex fix cycle 2 disclosure

- D1 (docs only, no test change, no new mutation run): A1-1, A1-2, A2-1 NEW -> RETAIN-uncovered (cold-start anonymous
  homepage state not exercised; T1c asserts post-sign-out reload only); Sweep MATCH -> FAIL. Totals now EXISTING 6 /
  NEW 6 / RETAIN 21 (superseded 9, uncovered 12).
- D2: `.claude/handoffs/...` plan and evidence paths are marked local and git-ignored; the durable source for the PROVEN
  rows' verbatim receipts is PR #2876 comment https://github.com/gautirao/udupi-property-explorer/pull/2876#issuecomment-6288391887.

## NEW proof accounting (OBSERVED at `c564a911`)

Each mutation was a MUTATION RUN (full suite, D7: `run-e2e-gate.sh` has no targeted runner) in a disposable detached
worktree on ports 5376/8376, never gate evidence. Restoration evidence for every row: the DEV RUN at `c564a911`
(`evidence/dev-run-1.log`, 58/58 PASS, T1c PASS). Line numbers in this table are at `c564a911`. The Evidence column files
live under `.claude/handoffs/issue-28601/evidence/` (local, git-ignored); the durable verbatim receipts for the PROVEN rows
A6-3 and A7-1 are PR #2876 comment https://github.com/gautirao/udupi-property-explorer/pull/2876#issuecomment-6288391887.

| Mutation | Credited row | Exit | Counts (listed/passed/unexpected) | T1c first failure | T1c steps 1-6 | Collateral | Status | Evidence |
|---|---|---|---|---|---|---|---|---|
| MUT-T1C-RET-ROOT | none (was A3-1; A3-1 is now RETAIN-uncovered, Codex C3 — this proves only the `/auth?returnTo=/` redirect) | 1 | 58/57/1 | AS:517 (Received `/discover`) | PASS | none | OBSERVED RED, no row credited | `MUT-T1C-RET-ROOT@c564a911.txt` |
| MUT-T1C-HOME-MENU | none (was A4-1; A4-1 is now RETAIN-uncovered, amendment_1 sweep — this proves only the user-menu on `/` after the `/auth?returnTo=/` redirect) | 1 | 58/57/1 | AS:518 (user-menu not found) | PASS | none | OBSERVED RED, no row credited | `MUT-T1C-HOME-MENU@c564a911.txt` |
| MUT-T1C-PUBLIC-NAV | A6-3 (AS:531) | 1 | 58/57/1 | AS:531 (Received `/discover`) | PASS | none | PROVEN | `MUT-T1C-PUBLIC-NAV@c564a911.txt` |
| MUT-T1C-HOME-RELOAD (r1) | A7-1 (AS:535) | 1 | n/a (suite never started) | none observed | NOT RUN | n/a | NOT_PROVEN (environmental: auth stack did not come up, Docker I/O error) | `MUT-T1C-HOME-RELOAD@c564a911.txt` |
| MUT-T1C-HOME-RELOAD (r2) | A7-1 (AS:535) | 1 | 58/57/1 | AS:535 (Sign in link not found after reload) | PASS | none | PROVEN | `MUT-T1C-HOME-RELOAD@c564a911.r2.txt` |
| MUT-T1C-HOME-NOOP | A6-4 | - | - | - | - | - | DROPPED (owner directive) -> A6-4 NOT_PROVEN | - |
| FC-08 (title id rename) | T1c title | mutated 1 / restored 0 | - | `FAIL[FC-08] matrix id T1c` | - | - | PASS | `FC08-T1c@c564a911.txt` |

Observed NEW totals: PROVEN 2 (A6-3, A7-1) / NOT_PROVEN 4 (A6-1, A6-2, A6-4, A7-2) of 6 (A1-1, A1-2, A2-1 left NEW in
Codex cycle 2 D1 and are RETAIN-uncovered, not NOT_PROVEN). A row
is PROVEN only when its mutation run is observed RED with the first failure at that row's line, T1c steps 1-6 GREEN, and
the restored head GREEN; credits are never moved to another row. A7-1 is credited by the single r2 re-run of
MUT-T1C-HOME-RELOAD on the repaired host (observed RED first at AS:535:72 @c564a911); r1 stays recorded as environmental
and is not counted.

## D9 (OPEN finding)

The `zoom=14` + `areaKey=` Discover deep link does not hold the URL zoom: the markers fetch is gated on the live map zoom
(resolveMarkerListings.ts:104, useDiscoverMapDataController.ts:280,490 `shouldShowMarkers(mapZoom)`), and the area
selection triggers a camera fit that competes with the URL zoom across useDiscoverPageComposition.ts, DiscoverMapCanvas.tsx
and the camera-sync effect (state/url/viewport.ts). Not trivial: a fix needs a camera-intent precedence decision (URL zoom
vs area fit) in product code outside this test-only scope, is not reproduced live or root-caused, and is entangled with D8
(whether `areaKey=` is a superseded legacy param). D9 stays OPEN; no product change here.

## Deletion-gate row (for the PR)

csv 9 e2e/auth-journey-1509.spec.ts — NOT deletion-ready: DN1/DN2 PENDING owner confirmation by name, D9 OPEN, and twelve
rows are RETAIN-uncovered with no canonical coverage (A1-1, A1-2, A2-1, A3-1, A4-1, A4-2, A9-3, A9-4, A9-5, A10-1, A11-3,
A12-1)
