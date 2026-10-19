# E2E retirement map: PR-6 batch A (broker pages seam), issue #2835 (parent #2750)

Status: **B2 (post-owner-deletion)**. Three specs are RETIRED (deleted in B2): `e2e/broker-dashboard-v2.spec.ts`, `e2e/broker-demand-gaps.spec.ts`,
`e2e/broker-area-insights.spec.ts`, on the owner's own PR comment 6246480608 (https://github.com/gautirao/udupi-property-explorer/pull/2840#issuecomment-6246480608, 2026-10-18T06:18:03Z), which names exactly those three paths.
`e2e/broker-preferences.spec.ts` is KEPT (owner: retain until Radix interaction + POST 422 have adequate replacement coverage). The B1 wording "RETIRE-CANDIDATE" below means
"every legacy assertion row has a passing replacement and every required mutation went RED then GREEN"; B2 section 9 records the final statuses.

Base `182d8d616f22e53d30c6a2b01d491d9f9495f29b`. Legacy specs (all four `NOT_RUN` at base; they need Playwright `full` + a broker
`storageState`): `e2e/broker-dashboard-v2.spec.ts`, `e2e/broker-preferences.spec.ts`, `e2e/broker-demand-gaps.spec.ts`,
`e2e/broker-area-insights.spec.ts`.

## 1. Mock boundary (read this before trusting any row)

Every replacement test mounts the **real page and its real data hooks and mappers**. Only these seams are replaced:

| seam | how | why | what is therefore NOT proven by these tests |
|---|---|---|---|
| `@/lib/api` | module replaced whole; `api.get/post/delete` served by a path dispatcher (stateful fake for Preferences) that returns **raw wire-shape bodies**: `BrokerQualitySummaryResponse`, `PageResponse { content, page { size, number, totalElements, totalPages } }`, `DemandGapsResponse` with `Metric { value, confidenceLabel }`, `MarketFocusItem[]` (incl. `citySlug`), `BrokerAreaInsightsResponse` (nullable `areaLabel`), `TrustProgressResponse`. An unexpected path/method **throws**, so a wrong path reddens a test instead of silently passing. Errors are thrown as an `ApiError`-shaped object with a numeric status. | the real module builds a Supabase client at import | request construction inside `lib/api.ts` (headers, bearer token attachment, query-string building), real HTTP status/JSON parsing, CORS, and **everything server-side**: JWT -> broker identity, 403 role checks, dismiss ownership (404), 422 area resolution, `citySlug` derivation, k-anonymity suppression. Route guards and page guards are UX decisions, not authorization. |
| `@/contexts/AuthContext` | controllable `useAuth` | identity seam | the role mapping `dealer \| broker -> isBroker` (`AuthContext.tsx:54`) and the isLoading-until-role-fetch handoff. The DEALER arms therefore set `userRole: 'dealer'` with `isBroker: false` and prove the dealer at the route-guard / role-allow level only (see section 4, D1). |
| `@/components/layout/AppLayout` | pass-through shell (`<div>{children}</div>`) | the real layout needs the full provider stack (its own test is red at base, never cited) | nav chrome, header, footer |
| pointer-capture / `scrollIntoView` | file-scope polyfills (precedent `CommercialListingForm.parity.test.tsx:101-112`) | jsdom lacks them | n/a |

Not mocked anywhere: any data hook, any page, any `components/ui/*` component (real Radix `AlertDialog`, `Select`, `Alert`,
`Breadcrumb`, `Toaster` all render). `QueryClient` is a fresh `{ retry: false }` per test. Error arms use 500/403 (a 401 retries after
1500 ms in `useBrokerMarketFocus` / `useBrokerAreaInsights`; not asserted).

Identity rule asserted over **serialised full call args** of `get`/`post`/`delete` (`/broker_?id|brokerId/i`), not just paths:
dashboard, listings, preferences, demand-gaps, area-insights. **B2 strengthening (dashboard `B-1`/`B-8`, `L-1`/`L-2`, preferences `P-BP2`/`P-BP5`/`P-seed`):** the same serialisation must also NOT contain the actual id value
`broker-uid-1` and must not match `/user_?id|userId|owner_?id/i`, with the existing positive control that calls were captured; `L-1` and `L-2` additionally pin the FULL query-key set
(`[...url.searchParams.keys()].sort()` equals `['page','size','sort','status']` for Drafts and `['page','size','sort']` for the My Listings control). Legacy never asserted the id value, userId or the key set
(dashboard-v2 L106 URL regex only; demand-gaps name-only), so these are additions, not parity rows. Mutations B2-1..B2-7 (section 9). The path of an area-insights request is matched **decode-tolerantly**
(raw `|` and `%7C` equivalent) because the hook interpolates the raw key (section 4, Q5); the matcher has its own accept/reject self-test.

Test files (all NEW, none edits an existing test):

| id | file | `it` count |
|---|---|---|
| N-A | `apps/web/src/__tests__/App.brokerWorkspaceRoutes.test.tsx` (+ `support/appRouteWiring.ts`, `support/appRouteWiring.test.ts`) | 36 (+37 matcher self-tests) |
| N-B | `apps/web/src/pages/broker/__tests__/BrokerDashboard.pageHttp.test.tsx` | 10 |
| N-B2 | `apps/web/src/pages/broker/__tests__/BrokerListings.bd4.test.tsx` | 4 |
| N-C | `apps/web/src/pages/broker/__tests__/Preferences.pageHttp.test.tsx` | 9 |
| N-D | `apps/web/src/pages/broker/__tests__/BrokerDemandGaps.pageHttp.test.tsx` | 16 |
| N-E | `apps/web/src/pages/broker/__tests__/BrokerAreaInsights.pageHttp.test.tsx` | 20 (incl. 11 matcher self-tests) |

Exact `it` titles are listed in section 6 under short keys (`B-1`, `G-5`, ...); N-A titles use the bracketed route plus the arm letter.
Mutation evidence: `.claude/handoffs/issue-2835/evidence/mut/MUT-<id>/` (`mutation.diff`, `red.log`/`red.exit`/`red.failing.txt` captured before
the revert, `green.log`/`green.exit` after, `diffstat-after-revert.txt` empty). Registers: `register-call3.tsv` (N-A, N-C), `register-call4.tsv`
(N-B, N-B2, N-D, N-E). Mutation ids are those of the plan's assertion map; `A20` is used by the plan for two different mutations (Preferences GET
path and the dashboard inventory `status` read), so the dashboard one is recorded as **`A20d`**.

Status vocabulary: COVERED (passing replacement, mutation-proved) / PARTIAL (disclosed gap) / UNCOVERED (no kept test reaches it) / WEAK
(covered but the discriminating mutation did not redden) / UNRESOLVED (owner to rule) / OBSOLETE (with reason).
`RED` = the named mutation turned the cited test red and it was green again after the revert.

<a id="broker-dashboard-v2"></a>

## 2. broker-dashboard-v2 (`e2e/broker-dashboard-v2.spec.ts`)

| row | legacy assertion | covering test(s) | status | MUT |
|---|---|---|---|---|
| BD-0 | 4x `test.skip(!hasBrokerCreds)` | none: the replacements run unconditionally, no env | OBSOLETE (env gating) | - |
| BD-0b | `BROKER_*` ?? `DEALER_*` credentials fallback | N-A `(d-dealer)` x5 routes + `(f)`; N-B `B-1` (page admits `isBroker`) | **PARTIAL**: route-guard / role-allow level only, `AuthContext.tsx:54` stays mocked | A93 RED |
| BD1-a | URL stays `/broker/dashboard` for a broker | N-A `/broker/dashboard (a),(d),(d-dealer)`; N-B `B-1` (probe pathname) and `B-3` (non-broker IS bounced) | COVERED | A80 A85 A90 A94 RED (call 3); A01 RED |
| BD1-b | "Active Listings" card | N-B `B-1` (label + value 2 + "of 5 total") | COVERED | A02 RED, A07 RED, A08 RED |
| BD1-c | "Avg Quality" | N-B `B-1` (label + 78 + "/ 100 avg quality") | COVERED | A03 RED |
| BD1-d | "Needs Fixes" | N-B `B-1` (label + 3) | COVERED | A04 RED |
| BD1-e | "Missing Location" | N-B `B-1` (label + 4) | COVERED | A05 RED |
| BD1-f | "Buyer-Ready" | N-B `B-1` (label + 6) | COVERED | A06 RED |
| BD2-a | "Start here today" | N-B `B-5` (level-2 heading, exact) | COVERED | A09 RED |
| BD2-b | "Broker workspaces" | N-B `B-5` | COVERED | A10 RED |
| BD2-c | "Possible demand gap" tile | N-B `B-5` (found only after the real hook delivered the summary), `B-6` (absent without it) | COVERED | A11 RED |
| BD2-d | "limited data" (`.first()`) | N-B `B-5` asserts **both** sources separately: action card "Limited data — more signals coming soon" and nav card "Limited data — coming in a future update" | COVERED (tightened: legacy `.first()` was satisfied by either source) | A12 RED, A13b RED |
| BD2-e | "engagement tracking coming soon" | N-B `B-5` | COVERED | A13 RED |
| BD3-a | "details coming soon" | N-B `B-7` | COVERED | A14 RED |
| BD3-b | no `a[href="/broker/listing-quality"]` in the aria-live grid | N-B `B-7`, with an in-test positive control (the same grid DOES link `/broker/listings?status=LIVE`) | COVERED | A15 RED |
| BD4-a | link "Drafts" visible | N-B2 `L-1` (exact name "Drafts Continue editing unpublished listings") | COVERED | A16 RED |
| BD4-b | click -> `/broker/listings` with `status=DRAFT` | N-B2 `L-1`: probe pathname + `URLSearchParams` status, **and** the request carries `status=DRAFT` (page 0, size 20, sort `createdAt,desc` decoded); `L-2` control: "My Listings" link yields no status and no status in the request | COVERED | A17 RED, A20d RED |
| BD4-c | heading "My Listings" on the landed page | N-B2 `L-1` (real `BrokerListings`, empty page) | COVERED | A18 RED |

Extra tests beyond the legacy rows (not retirement evidence): `B-2` (500 -> error cards + Retry recovers), `B-3` (guard bounce + zero requests), `B-4` (auth loading),
`B-8` (PageResponse mapper: status label, title, link target; one LIVE row triggers exactly one trust-progress GET), `B-9`, `B-10`, `L-3` (deep link `status=LIVE`), `L-4` (500).

Counts: 18 rows -> 16 COVERED, 1 PARTIAL (BD-0b), 1 OBSOLETE (BD-0). Mutations: 20 dashboard-side (A01-A18, A13b, A20d) all RED.
**Verdict: RETIRED in B2.** The owner accepted BD-0b as the disclosed LOW gap D1 and named the spec by path in the owner's own PR comment 6246480608 (https://github.com/gautirao/udupi-property-explorer/pull/2840#issuecomment-6246480608, 2026-10-18T06:18:03Z). BD-0b stays PARTIAL (limitation preserved).

<a id="broker-preferences"></a>

## 3. broker-preferences (`e2e/broker-preferences.spec.ts`)

Source: call 3 (`transcripts/qa-writing-call3.md`, `register-call3.tsv`). N-C keys: `P-BP2`, `P-BP3`, `P-BP5`, `P-BP5c` (cancel), `P-seed`, `P-500`, `P-403`, `P-404`, `P-guard`.

| row | legacy assertion | covering test(s) | status | MUT |
|---|---|---|---|---|
| BP-0 | 4x skip | none | OBSOLETE (env gating) | - |
| BP-0b | dealer fallback | N-A `/broker/preferences (d-dealer)`, `(f)` | **PARTIAL** (as BD-0b) | A93 RED |
| BP-0c | `route.continue()` fallback | none | OBSOLETE (a stub escape hatch; the N-C fake throws on an unexpected method) | - |
| BP1-a | anon -> `/auth` | N-A `/broker/preferences (b)` (exact `/auth`, one-decode `redirect` equals the original path), `(c)` | COVERED (stricter than legacy) | A81 A87 A90 A91 A91b A92 RED |
| BP1-b | anon sees no "Market Focus" | N-A `(b)` stub child absent + control `(d)` | COVERED | A90 RED |
| BP2-a | broker stays on the route | N-A `(d)`, `(d-dealer)`; N-C `P-BP2` | COVERED | A94 A95 RED |
| BP2-b | heading "Market Focus" after GET | N-C `P-BP2` | COVERED | A22 RED (after tightening) |
| BP2-c | button "Re-seed focus areas from live listings" | N-C `P-BP2` | COVERED | A23 RED (after tightening) |
| BP2-d | GET is exactly `/api/broker/market-focus` | N-C `P-BP2` (`calls toEqual [[PATH]]`) | COVERED | A20 RED |
| BP3-a | URL stays with empty list | N-A `(d)`; N-C `P-BP3` | COVERED | A94 RED |
| BP3-b | `empty-state-description` visible | N-C `P-BP3` | COVERED | A21 RED, A24 RED |
| BP3-c | description matches /seed\|add/ | N-C `P-BP3` (also the full sentence) | COVERED | A24 RED |
| BP3-d | button "Seed from my listings" | N-C `P-BP3`, `P-seed` | COVERED | A25 RED |
| BP3-e | link "Add a listing" | N-C `P-BP3` (+ href) | COVERED | A26 A26b RED (after tightening) |
| BP4-a | URL stays before add | N-A `(d)` | COVERED | A94 RED |
| BP4-b | heading "Add Focus Area" | N-C `P-BP3` (rendered) | COVERED | A27 RED (after tightening) |
| BP4-c | pick Kadri / Apartment / For Rent via the real Radix Select | none in N-C | **UNCOVERED** (see D5: a synchronous-event drive of the real Select exists; not applied to N-C in this call) | A28 RED covers only the combobox names |
| BP4-d | POST status 204 | none | OBSOLETE (asserts the spec's own stub) | - |
| BP4-e | a POST happened | none | **UNCOVERED** | A29 **SURVIVED** |
| BP4-f | POST body has no `citySlug` | none | **UNCOVERED** | A30 A31 **SURVIVED** |
| BP4-g | POST body fields | none | **UNCOVERED** | A30 A31 **SURVIVED** |
| BP4-h | list container appears after refetch | none | **UNCOVERED** | A33 **SURVIVED** |
| BP4-i | list shows Kadri | none | **UNCOVERED** | A33 **SURVIVED** |
| BP4-j | "manual" badge | N-C `P-BP2` shows a manual badge for a seeded fixture row, but not after an add | **UNCOVERED** for the add path | A36 RED (badge render only) |
| BP5-a | URL stays; list visible | N-A `(d)`; N-C `P-BP5` | COVERED | A20 A94 RED |
| BP5-b | list shows Kadri | N-C `P-BP5` | COVERED | A35 RED |
| BP5-c | remove button "Remove focus area: Kadri" | N-C `P-BP2`, `P-BP5` | COVERED | A37 RED |
| BP5-d | role `alertdialog` (real Radix) | N-C `P-BP5`, `P-BP5c` | COVERED | A38 RED |
| BP5-e | dialog text | N-C `P-BP5` | COVERED | A38 RED |
| BP5-f | DELETE status 204 | none | OBSOLETE (stub's own status) | - |
| BP5-g | a DELETE happened (path) | N-C `P-BP5` | COVERED | A39 RED |
| BP5-h | DELETE body has the full tuple incl. `citySlug` | N-C `P-BP5` | COVERED | A40 A41 RED |
| BP5-i | after refetch, no Kadri row (control: row visible before) | N-C `P-BP5` | COVERED | A42 RED |
| BP5-j | empty state after the list empties | N-C `P-BP5` | COVERED | A21 RED |

Counts: 34 distinct table rows (the plan's 38 included grouped duplicates) -> 22 COVERED, 1 PARTIAL (BP-0b), 7 UNCOVERED (BP4-c, BP4-e, BP4-f, BP4-g, BP4-h, BP4-i, BP4-j), 4 OBSOLETE (BP-0, BP-0c, BP4-d, BP5-f).
Mutation outcomes (call 3): 37 RED, 2 tolerance controls GREEN as expected (A96 A97), **4 R-tier SURVIVED: A29 A30 A31 A33**, 0 TEST_ENV_FAILURE.
**Verdict: KEEP (confirmed by the owner in B2: "retain until Radix interaction + POST 422 have adequate replacement coverage").** Reason: BP4-c, BP4-e..BP4-j and the POST-422 toast are UNCOVERED (the add flow) and four R-tier mutations SURVIVED (A29 A30 A31 A33). The spec is NOT deleted and its manifest row stays SCHEDULED(PR-6). See D5.

<a id="broker-demand-gaps"></a>

## 4a. broker-demand-gaps (`e2e/broker-demand-gaps.spec.ts`)

N-D keys: see section 6 (`G-1` ... `G-14`).

| row | legacy assertion | covering test(s) | status | MUT |
|---|---|---|---|---|
| DG-0 | 11x skip | none | OBSOLETE (env gating) | - |
| DG-0b | dealer fallback | N-A `/broker/demand-gaps (d-dealer)`, `(f)` | **PARTIAL** (as BD-0b) | A93 RED |
| DG1-a | URL stays for a broker | N-A `(a),(d),(d-dealer)`; N-D `G-1` (probe); `G-12` (non-broker bounced) | COVERED | A82 A86 A94 RED (call 3) |
| DG1-b | h1 "Demand Gaps" | N-D `G-1` | COVERED | A50 RED |
| DG1-c | 5 summary labels | N-D `G-1` (label **and value** per card: 240, 18, 5, 3, 2) | COVERED | A51 A52 A53 A54 A55 A56 RED |
| DG1-d | "Priority Signals" | N-D `G-1` | COVERED | A57 RED |
| DG1-e | "Add Listing" CTA | N-D `G-1`, `G-4a` | COVERED | A58 RED |
| DG1-f | "All Demand Gaps" | N-D `G-1` | COVERED | A59 RED |
| DG1-g | table cell Koramangala | N-D `G-1` (exact cell name) | COVERED | A60 RED |
| DG1-h | capture-demand title | N-D `G-1` (+ derived price, quality, link href) | COVERED | A61 A62 RED |
| DG1-i | `/supply gap/i` "signal legend" | N-D `G-2`: the legend region is asserted by its own heading + confidence levels; the "Supply Gap" text is asserted separately as 2 badges | COVERED (**tightened**: the legacy `.first()` matched a top-card badge, the legend contains no such text) | A63 RED |
| DG2-a | "Insufficient data" visible | N-D `G-3` (`metric-null-state` text) | COVERED | A64 RED |
| DG2-b | buyer-searches card has an italic `p` | N-D `G-3` (card-scoped `metric-null-state`) | COVERED (**tightened**: the legacy locator `text=Buyer Searches` -> `..` is the label row, whose subtree has no `<p>`; unsatisfiable) | A64 RED |
| DG2-c | no `p.text-3xl` in that card | N-D `G-3`, with control: the three plain-number cards render a real `0` | COVERED | A64 RED |
| DG3a-a/b | add_listing -> "Add Listing", no "Improve Listing" | N-D `G-4a` (exactly one button + the other two absent) | COVERED | A58 RED |
| DG3b-a/b | improve_listing -> "Improve Listing", no "Add Listing" | N-D `G-4b` | COVERED | A65 RED |
| DG3c-a/b | review_gap -> "Review Gap", no "Add Listing" | N-D `G-4c` | COVERED | A66 RED |
| DG4a-a | dismiss count in [1,2] | N-D `G-5`: **exactly 2** (top card + row), id==null contributes none (control: that gap is on the page) | COVERED (**tightened**) | A67 A68 RED |
| DG4a-b | mark-as-read count in [1,2] | N-D `G-5`: **exactly 1** (only the row has it) | COVERED (**tightened**) | A67 RED |
| DG4b-a | first Dismiss visible | N-D `G-6` | COVERED. Note (code-reviewer B1 F3): the legacy DG4b title "(no extra GET)" was never asserted by the legacy spec; `G-6` pins the ACTUAL behaviour, a dismiss refetches the gaps (GET count 1 -> 2) | A68 RED |
| DG4b-b | POST `/api/broker/alerts/gap-uuid-1/dismiss` | N-D `G-6` (`post.calls toEqual [[path]]`, one argument; then the refetch GET 1 -> 2, see the DG4b-a note) | COVERED | A69 RED |
| DG4b-c | no `broker_id` in the alerts URL | N-D `G-6`, `G-7` (serialised full call args) | COVERED (the legacy title "(no extra GET)" was never asserted; `G-6` pins GET 1 -> 2, see the DG4b-a note) | A70 RED |
| DG5-a | "No demand gaps found" | N-D `G-8` | COVERED | A71 RED |
| DG5-b | "No priority gaps right now" | N-D `G-8` | COVERED | A72 RED |
| DG5-c | no Koramangala cells | N-D `G-8` (no `cell` at all; control: the same cell exists in `G-1`) | COVERED | A71 RED |
| DG5-d | "signals found" | N-D `G-8` (+ plain `0`) | COVERED | A73 RED |
| DG6a-a | pick APARTMENT in the filter; Koramangala visible | N-D `G-14` (**real Radix Select**, driven by synchronous `fireEvent`, see below) | COVERED (microtask-window limit, see DG6a in detail) | A74 RED |
| DG6a-b | no HSR Layout after the filter (control: both rows before) | N-D `G-14` | COVERED (microtask-window limit, see DG6a in detail) | A74 RED |
| DG6a-c | **no extra GET** during the filter | N-D `G-14`: `api.get('/api/broker/demand-gaps')` count stays **1** after the filter; positive control in the same test: a dismiss moves it to **2** | COVERED (microtask-window limit, see DG6a in detail; redesigned negative with in-test positive control; A75 RED) | A75 (REDESIGNED, add-fetch) RED |
| DG6b-a | sort button visible | N-D `G-9` (exact name "Sort by gap score, currently descending") | COVERED | A76 RED |
| DG6b-b | rows still visible after asc and desc | N-D `G-9` (row ORDER asserted both ways with a 3-row fixture) | COVERED (**tightened**) | A77 RED |
| DG6b-c | `rowCount >= 3` | N-D `G-9` (exactly 4 rows = header + 3) | COVERED (**tightened**) | A77 RED |
| DG6b-d | last row is the null-score row | N-D `G-9`, in **both** directions | COVERED (**tightened**: legacy checked only the final state) | A78 RED |
| DG7-a | at least one demand-gaps request | N-D `G-10` (exactly one GET, exactly `['/api/broker/demand-gaps']`, no options) | COVERED | A51 A79 RED |
| DG7-b | no `broker_id` / `brokerId` in the URL | N-D `G-10` (serialised full call args) | COVERED | A79 RED |

Extra tests: `G-7` (mark-as-read POST path), `G-11` (500: failure alert, 5 Failed cards, 3 Retry buttons, Retry recovers), `G-12` (non-broker bounced, zero GET: the hook is role-gated), `G-13` (auth loading).

### DG6a in detail (the Q4 redesign)

The filter is `useState` in `AllGapsTable` (no network by construction), so no single-line flip can make "no extra GET" red. As directed, the assertion was **redesigned**
to count `api.get` calls for `/api/broker/demand-gaps` after the real filter interaction (`== 1`), with a positive control in the same test (a dismiss makes it `2`),
and the mutation **A75** adds the fetch: `useQueryClient` + `qc.invalidateQueries({ queryKey: ['broker','demand-gaps'] })` in the property-type `onValueChange` (3 edits).
The real Radix Select is **not stubbed**. It cannot be driven with `userEvent`/`findBy` (each await after an open stalls the worker ~13-14 s, as call 3 found) but it can be
driven deterministically with **synchronous** events: `fireEvent.keyDown(trigger, {key:'Enter'})`, `getByRole('option', {name:'APARTMENT'})`, `fireEvent.keyDown(option, {key:'Enter'})`,
then one `await act(async () => { await Promise.resolve(); })`. The test takes ~15 s (the single post-open flush), has a 60 s timeout, and passed on every run.
**Outcome: A75 went RED** (`expected 2 to be 1`: the added `invalidateQueries` in the filter handler produced a second GET) and went GREEN after the revert. A74 (filter turned into a no-op) also went RED on the same test. DG6a-a/b/c are therefore COVERED, not WEAK. Residual limit, stated rather than accepted: the test flushes microtasks once before counting, so an extra fetch that only reaches `api.get` after a later macrotask (for example inside a `setTimeout`) would not be seen. The cost of the Radix quirk is a ~15 s test; it passed in each of the 5 unmutated whole-file runs made after the combobox lookup was fixed.

Counts: 35 table rows (the plan's 31 counted the a/b pairs once) -> 33 COVERED, 1 PARTIAL (DG-0b), 1 OBSOLETE (DG-0). Mutations: A50-A79 (30 ids) plus extras A63L, A63M (legend content and heading) all RED; A72 was first aimed at a wrong line (a no-op, nothing run) and re-run at the right line, RED.
**Verdict: RETIRED in B2.** The owner accepted DG-0b as the disclosed LOW gap D1 and named the spec by path in the owner's own PR comment 6246480608 (https://github.com/gautirao/udupi-property-explorer/pull/2840#issuecomment-6246480608, 2026-10-18T06:18:03Z). DG-0b stays PARTIAL (limitation preserved).

<a id="broker-area-insights"></a>

## 4b. broker-area-insights (`e2e/broker-area-insights.spec.ts`)

N-E keys: `E-1` ... (section 6).

| row | legacy assertion | covering test(s) | status | MUT |
|---|---|---|---|---|
| BAI-0 | the endpoint glob is itself an assertion | N-E `E-1` (one GET, decode-tolerant path match, no options) | COVERED | A60b RED |
| BAI-1a-1 | h1 `Manipal` | N-E `E-1` | COVERED | A61b RED |
| BAI-1a-2 | breadcrumb text `Manipal` | N-E `E-1` (scoped to `nav[aria-label=breadcrumb]`) | COVERED (**tightened**: legacy `.first()` was satisfied by the h1) | A62b RED |
| BAI-1a-3 | badge `Enough data` | N-E `E-1` (scoped to the header) | COVERED | A63b RED |
| BAI-1b-1 | `Apartment` | N-E `E-2` (scoped to the "Dominant property type" card) | COVERED | A64b RED |
| BAI-1b-2 | `34` | N-E `E-2` (scoped to "Active listings (area)") | COVERED | A64b A65b RED |
| BAI-1b-3 | `8` | N-E `E-2` (scoped to "Fresh listings (7d)") | COVERED | A64b A66b RED |
| BAI-1b-4 | no `suppressed-metric-label` (happy path) | N-E `E-2`; control `E-5` (6 present) | COVERED | A64b RED |
| BAI-1c-1 | `3` live listings | N-E `E-3` (scoped card) | COVERED | A67b RED |
| BAI-1c-2 | `7` enquiries | N-E `E-3` (scoped card) | COVERED | A67b RED |
| BAI-1c-3 | no `broker-true-zero` (happy path) | N-E `E-3`; control `E-5` (4 present) | COVERED | A68b RED |
| BAI-1d-1 | `cta-view-public-area`, href `/trends`, `city=udupi`, `areaKey` | N-E `E-4` (href parsed with `URL`/`URLSearchParams`; `areaKey` decodes to `IN\|KA\|Udupi\|Manipal`) | COVERED | A69b RED |
| BAI-1d-2 | `cta-add-listing` -> `/broker/listings/new` | N-E `E-4` | COVERED | A70b RED |
| BAI-1d-3 | `cta-listing-quality` -> `/broker/listing-quality` | N-E `E-4` | COVERED | A71b RED |
| BAI-2a | `limited-data-state` for `available:false` | N-E `E-5` (+ text); control `E-6` | COVERED | A72b RED |
| **BAI-2b-1** | h1 named exactly the raw `IN\|KA\|Udupi\|Manipal` when `areaLabel` is null | N-E `E-5` asserts the **shipped** contract instead: h1 is exactly `Manipal` and contains no `\|` | **OBSOLETE by owner ruling** (the intended heading is the human-readable `Manipal`; the owner's own PR comment 6246480608 (https://github.com/gautirao/udupi-property-explorer/pull/2840#issuecomment-6246480608, 2026-10-18T06:18:03Z)) | A61c RED (pins the shipped humanisation) |
| BAI-2b-2 | h1 text non-empty | N-E `E-5` | COVERED | A61b A61c RED |
| BAI-2c-1 | first suppressed label visible | N-E `E-5` | COVERED | A64b RED |
| BAI-2c-2 | at least 6 suppressed labels | N-E `E-5`: **exactly 6** | COVERED (tightened) | A73b RED |
| BAI-2c-3 | each label is not `0` | N-E `E-5` (each equals `Not enough data yet`; no `0` in the shared group) | COVERED | A74b RED |
| BAI-2d-1 | `broker-true-zero` visible | N-E `E-5` (exactly 4) | COVERED | A68b RED |
| BAI-2d-2 | numeral `0` | N-E `E-5` (`0` in each, plus the zero label) | COVERED | A75b RED |
| BAI-2d-3 | true-zero cards hold no suppressed label | N-E `E-5` (control: 6 suppressed elsewhere in the same render) | COVERED | A75b RED |
| BAI-3a-1 | demand-gaps CTA disabled `<button>`, no href | N-E `E-7` | COVERED | A76b RED |
| BAI-3a-2 | compare-areas CTA disabled | N-E `E-7` | COVERED | A77b RED |
| BAI-3a-3 | clicking either does not navigate | N-E `E-7` (probe unchanged; control: the enabled add-listing CTA moves the probe) | COVERED | A76b RED |
| BAI-3b | `(coming soon)` inside each | N-E `E-7` | COVERED | A78b A78c RED |
| BAI-4a | anon -> `/auth` on the param route, encoded pipes | N-A `/broker/areas/:citySlug/:areaKey (b)`, `(c)`; `(a)` wiring | COVERED | A83 A89 A90 A91 A92 RED (call 3) |
| BAI-4b | anon sees no area heading | N-A `(b)` stub child absent + control `(d)` | COVERED | A90 RED |

Extra tests: `E-8` (500 alert, Retry recovers), `E-9` (403, one request, not retried), `E-S*` (decode-tolerant matcher: 3 accept, 8 reject).
Counts: 29 rows -> 28 COVERED, 1 OBSOLETE by owner ruling (BAI-2b-1). Mutations: A60b-A78b (19) + extras A61c, A78c: all RED.
**Verdict: RETIRED in B2.** BAI-2b-1 ruled OBSOLETE by the owner and the spec named by path in the owner's own PR comment 6246480608 (https://github.com/gautirao/udupi-property-explorer/pull/2840#issuecomment-6246480608, 2026-10-18T06:18:03Z).

## 5. Shared route / guard rows (N-A, call 3)

N-A covers, for each of the five routes, wiring (a), anonymous redirect (b), loading (c), broker (d), dealer-at-role-allow (d-dealer), plain `user` (e), and the `routeAccess`
policy (f). Mutations A80-A95 (+A91b) all RED; tolerance controls A96 and A97 stayed GREEN. A95 (`!canAccessRoute`) closes the pilot's open MUT-P27.
The redirect return path is read with one `URLSearchParams.get` and must equal the exact original path including `IN%7CKA%7CUdupi%7CManipal` and `?status=DRAFT&sort=createdAt,desc`.
No admin expectation is encoded.

## 6. Verdict summary

| spec | verdict | reason |
|---|---|---|
| `e2e/broker-dashboard-v2.spec.ts` | **RETIRED (B2)** | all rows COVERED except BD-0b (PARTIAL, D1 accepted by the owner) and BD-0 (OBSOLETE); 20/20 dashboard mutations RED; B2-1,3,5,6 RED |
| `e2e/broker-preferences.spec.ts` | **KEEP** (owner: retain until Radix interaction + POST 422 have adequate replacement coverage) | add flow UNCOVERED (BP4-c, BP4-e..j, POST 422); R-tier A29 A30 A31 A33 SURVIVED |
| `e2e/broker-demand-gaps.spec.ts` | **RETIRED (B2)** | 33/35 rows COVERED, DG-0b PARTIAL (D1 accepted by the owner), DG-0 OBSOLETE; G-14 ~15 s / 60 s timeout ACCEPTED; 32/32 mutations RED incl. the redesigned A75; identity rows DG4b-c/DG7 proven over full call args |
| `e2e/broker-area-insights.spec.ts` | **RETIRED (B2)** | 28/29 COVERED; BAI-2b-1 OBSOLETE by owner ruling (D2); all mutations RED |

## 7. Named items for the owner

- **D1 (disclosed gap, LOW): DEALER role mapping. ACCEPTED by the owner (B2); the limitation is preserved, the rows stay PARTIAL.** `AuthContext.tsx:54` (`role === 'dealer' || 'broker'` -> `isBroker`) is mocked in every test. The dealer is proven only at the
  route-guard / role-allow level (N-A `(d-dealer)` + `(f)`, A93 RED). Rows BD-0b, BP-0b, DG-0b are PARTIAL by construction. Same gap the pilot disclosed.
- **D2 (RESOLVED in B2, OBSOLETE by owner ruling, heading "Manipal"; the owner's own PR comment 6246480608 (https://github.com/gautirao/udupi-property-explorer/pull/2840#issuecomment-6246480608, 2026-10-18T06:18:03Z)): BAI-2b-1.** The legacy spec expects an h1 named the raw `IN|KA|Udupi|Manipal` when `areaLabel` is null. The product deliberately humanises the last pipe segment:
  `BrokerAreaInsights.tsx:121-124` (`humanizedAreaKey = areaKey.split('|').filter(Boolean).pop()`, `title = areaLabel ?? humanizedAreaKey`). N-E `E-5` pins the shipped heading
  (`Manipal`, no `|`); mutation A61c (`areaLabel ?? areaKey`, i.e. the raw key in the h1) turns it RED. QA did not self-accept it; the owner ruled it OBSOLETE in B2.
- **D3 (finding): admin divergence.** `routeAccess.ts:58-74` denies the admin role on every `/broker/*` workspace route except listing new/edit, while the page guards admit admin
  (`BrokerDashboard.tsx:34`, `BrokerDemandGaps.tsx:56`, `Preferences.tsx:306`). No admin expectation is encoded anywhere in this batch; an owner ruling is needed before one is. **B2 ruling (#2842): admin STAYS blocked per `routeAccess.ts`; aligning the page guards is a separate issue, #2845, NOT part of this PR.**
- **D4 (Q5 follow-up, not in this PR): raw `|` in the area-insights request.** `useBrokerAreaInsights.ts:24-26` interpolates the decoded `areaKey` into the path without
  `encodeURIComponent`. N-E does not pin the raw form (decode-tolerant matcher with accept and reject self-tests). A `?` or `#` in an area key would alter the path or query. Follow-up #2841 (raw `|` / unencoded area key), not in this PR.
- **D5 (broker-preferences, new information).** call 3 judged the real Radix Select undriveable. The synchronous-event drive used by N-D `G-14` (section 4a) opens and picks on the real Select
  without a stub. It was not applied to `Preferences.pageHttp.test.tsx` in this call (out of the allowed files). It would likely close BP4-c, BP4-e..j, POST 422 and the SURVIVED A29 A30 A31 A33.
  **D5 result (call 5): NOT RESOLVED, outcome STALL; the preferences verdict stays KEEP.** The drive was applied once, honestly, to the real Selects (3 picks, then Add, plus the POST 422 arm):
  it was functionally correct (11/11 passed, exit 0, `evidence/b1/Preferences.pageHttp.test.d5-run1.log`) but each pick cost ~15 s (BP4 45.8 s, BP4-422 46.3 s, file 93 s versus ~1 s
  for the other 9 tests). That breaches the per-await 2 s bound set for this call, so the extension was abandoned (file restored to HEAD; the attempt is kept only as
  `evidence/b1/Preferences.pageHttp.test.d5-ATTEMPT.tsx.txt`), no further runs or mutations were made on it, and **BP4-c, BP4-e..j, the POST-422 toast and the call-3 SURVIVED A29 A30 A31 A33 are unchanged
  (still UNCOVERED / SURVIVED)**. The owner may instead accept the 93 s file by decision, which would need per-test timeouts of at least 60 s. **B2: the owner kept `broker-preferences.spec.ts` until Radix interaction + POST 422 have adequate replacement coverage.**
- **D6: weak/survived ids.** **No R-tier id SURVIVED in N-B, N-B2, N-D, N-E; no id is WEAK.** The only SURVIVED ids in the batch are call 3's A29 A30 A31 A33 (broker-preferences add flow, see D5). Stated limits, not self-accepted: (i) A75's microtask-flush window (section 4a); (ii) call 3 recorded that five Preferences mutations first SURVIVED under /regex/i accessible names and were tightened to exact names; all N-B/N-D/N-E assertions use exact names from the start; (iii) `QueryClient({retry:false})` is a local choice, so the production retry behaviour of the three hooks without a retry override is not exercised.
- **D7 (not asserted anywhere, by design):** bearer-token attachment (`api.ts` mocked), 401 retry arms, server-side authorization of the four endpoints (backend controller tests, out of scope),
  page-level denial of a plain `user` on `/broker/listings` (the page admits `userRole 'user'`; only the N-A route guard denies).
- **D8: manifest (B2).** `docs/testing/e2e-retirement-manifest.csv`: the dashboard-v2, demand-gaps and area-insights rows are now `RETIRED`; the preferences row stays `SCHEDULED(PR-6)` and its phantom destination `BrokerPreferences.test.tsx` is corrected to `Preferences.pageHttp.test.tsx` (+ `Preferences.test.tsx`).

## 8. Exact `it` titles

### N-B `BrokerDashboard.pageHttp.test.tsx` (describe `BrokerDashboard over HTTP (#2835)`)

- `B-1`: BrokerDashboard over HTTP (#2835) > BD1: a broker stays on /broker/dashboard and the five summary cards render their labels and VALUES from the quality-summary response
- `B-2`: BrokerDashboard over HTTP (#2835) > BD1 (error): a failing quality-summary shows the error cards and a Retry button, never the labels; Retry recovers
- `B-3`: BrokerDashboard over HTTP (#2835) > BD1 (guard): a signed-in non-broker is sent to / and NO dashboard request is made
- `B-4`: BrokerDashboard over HTTP (#2835) > BD1 (loading): while auth is loading neither the page nor any request appears
- `B-5`: BrokerDashboard over HTTP (#2835) > BD2: "Start here today" and "Broker workspaces" headings, the "Possible demand gap" tile, and the limited-data / coming-soon copy from each of its two sources
- `B-6`: BrokerDashboard over HTTP (#2835) > BD2 (no data): without the quality-summary the "Possible demand gap" tile is absent (it exists only when the hook delivers a summary)
- `B-7`: BrokerDashboard over HTTP (#2835) > BD3: the quality card shows a "Details coming soon" label that is NOT a link to /broker/listing-quality, while the same grid DOES link to /broker/listings?status=LIVE
- `B-8`: BrokerDashboard over HTTP (#2835) > recent activity: the PageResponse rows are mapped (status label, title, link target); a LIVE row triggers exactly one trust-progress GET and a trust section
- `B-9`: BrokerDashboard over HTTP (#2835) > recent activity (empty): zero rows show the empty state with a Create Listing link
- `B-10`: BrokerDashboard over HTTP (#2835) > recent activity (error): a failing recent request shows "Failed to load recent listings" and Try again, while the summary cards still render

### N-B2 `BrokerListings.bd4.test.tsx` (describe `Dashboard -> BrokerListings (BD4, #2835)`)

- `L-1`: Dashboard -> BrokerListings (BD4, #2835) > BD4: clicking the "Drafts" workspace lands on /broker/listings?status=DRAFT, shows "My Listings", and the request carries status=DRAFT
- `L-2`: Dashboard -> BrokerListings (BD4, #2835) > BD4 (control): clicking "My Listings" lands on /broker/listings with NO status, and the request carries none (so the DRAFT assertion above can fail)
- `L-3`: Dashboard -> BrokerListings (BD4, #2835) > BD4 (deep link): entering /broker/listings?status=LIVE directly requests status=LIVE
- `L-4`: Dashboard -> BrokerListings (BD4, #2835) > BD4 (error): a failing listings request shows "Failed to load your listings." with Try again, never the empty state

### N-D `BrokerDemandGaps.pageHttp.test.tsx` (describe `BrokerDemandGaps over HTTP (#2835)`, plus `DG6a: property-type filter is client-side (#2835)`)

- `G-1`: BrokerDemandGaps over HTTP (#2835) > DG1: a broker stays on /broker/demand-gaps and the page renders heading, 5 summary cards with their VALUES, priority card, table, capture section
- `G-2`: BrokerDemandGaps over HTTP (#2835) > DG1 (legend): the "About these signals" legend is its own region with the confidence levels; the "Supply Gap" text is a badge elsewhere, NOT the legend
- `G-3`: BrokerDemandGaps over HTTP (#2835) > DG2: a null Metric renders its confidenceLabel (testid metric-null-state) and NEVER a big 0; plain-number cards DO render 0 (control)
- `G-4a`: BrokerDemandGaps over HTTP (#2835) > DG3 (add_listing): the top-gap card shows exactly the "Add Listing" button and neither of the other two
- `G-4b`: BrokerDemandGaps over HTTP (#2835) > DG3 (improve_listing): the top-gap card shows exactly the "Improve Listing" button and neither of the other two
- `G-4c`: BrokerDemandGaps over HTTP (#2835) > DG3 (review_gap): the top-gap card shows exactly the "Review Gap" button and neither of the other two
- `G-5`: BrokerDemandGaps over HTTP (#2835) > DG4a: dismiss / mark-as-read controls exist only for gaps with an id - EXACTLY 2 dismiss (top card + row) and 1 mark-as-read (row only); id==null contributes none
- `G-6`: BrokerDemandGaps over HTTP (#2835) > DG4b: clicking Dismiss POSTs exactly /api/broker/alerts/gap-uuid-1/dismiss (no body, no broker id) and then refetches the gaps (GET count 1 -> 2)
- `G-7`: BrokerDemandGaps over HTTP (#2835) > DG4b (mark read): the row Mark-as-read POSTs /api/broker/alerts/gap-uuid-1/read with no broker id
- `G-8`: BrokerDemandGaps over HTTP (#2835) > DG5: empty gaps render the two EmptyStates and "signals found" with a plain 0, and no gap rows
- `G-9`: BrokerDemandGaps over HTTP (#2835) > DG6b: the Gap Score sort toggles aria-sort and the row ORDER in both directions; the null-score row stays last each time; exactly 3 data rows
- `G-10`: BrokerDemandGaps over HTTP (#2835) > DG7: the page makes exactly one GET with exactly the path /api/broker/demand-gaps (no query, no options) and NO call carries a broker id
- `G-11`: BrokerDemandGaps over HTTP (#2835) > GET 500: shows the page-level failure alert, five "Failed" cards and three Retry buttons, never the table; Retry recovers
- `G-12`: BrokerDemandGaps over HTTP (#2835) > guard: a signed-in non-broker is sent to / and NO GET is made (the hook is gated on the role)
- `G-13`: BrokerDemandGaps over HTTP (#2835) > guard (loading): while auth is loading there is no heading, no redirect and no GET
- `G-14`: DG6a: property-type filter is client-side (#2835) > DG6a: picking APARTMENT hides the VILLA row, and the filter fires NO extra GET (count stays 1) while a dismiss DOES (count 2, positive control)

### N-E `BrokerAreaInsights.pageHttp.test.tsx` (describe `BrokerAreaInsights over HTTP (#2835)`, plus the matcher self-test)

- `E-1`: BrokerAreaInsights over HTTP (#2835) > BAI-0/1: the page requests the insights path derived from the route params (one GET, no options) and renders h1, breadcrumb and confidence badge from the response
- `E-2`: BrokerAreaInsights over HTTP (#2835) > BAI-1b: shared area metrics show the response VALUES in the right cards (exact, scoped), and no card is in the suppressed state
- `E-3`: BrokerAreaInsights over HTTP (#2835) > BAI-1c: broker-own counts show the response VALUES in the right cards; none is a true-zero card
- `E-4`: BrokerAreaInsights over HTTP (#2835) > BAI-1d: the enabled CTAs point at the right routes (href parsed, area key decoded)
- `E-5`: BrokerAreaInsights over HTTP (#2835) > BAI-2: available=false shows the limited-data notice, the h1 is the SHIPPED humanised "Manipal" (not the raw key), 6 suppressed labels (never 0) and 4 true-zero cards
- `E-6`: BrokerAreaInsights over HTTP (#2835) > BAI-2 (control): the happy fixture shows NO limited-data notice
- `E-7`: BrokerAreaInsights over HTTP (#2835) > BAI-3: "View demand gaps" and "Compare areas" are disabled <button>s with no href and a "(coming soon)" label; clicking them does not navigate, while clicking an enabled CTA does
- `E-8`: BrokerAreaInsights over HTTP (#2835) > GET 500: shows the failure alert naming the area and a Retry button, never the metrics; Retry recovers
- `E-9`: BrokerAreaInsights over HTTP (#2835) > GET 403: a permanent denial shows the same failure alert after exactly one request (not retried)
- `E-S1`: isInsightsPathFor (decode-tolerant matcher self-test) > ACCEPTS raw pipes
- `E-S2`: isInsightsPathFor (decode-tolerant matcher self-test) > ACCEPTS percent-encoded pipes
- `E-S3`: isInsightsPathFor (decode-tolerant matcher self-test) > ACCEPTS lower-case percent-encoding
- `E-S4`: isInsightsPathFor (decode-tolerant matcher self-test) > REJECTS wrong city
- `E-S5`: isInsightsPathFor (decode-tolerant matcher self-test) > REJECTS wrong area
- `E-S6`: isInsightsPathFor (decode-tolerant matcher self-test) > REJECTS extra trailing segment
- `E-S7`: isInsightsPathFor (decode-tolerant matcher self-test) > REJECTS a different endpoint suffix
- `E-S8`: isInsightsPathFor (decode-tolerant matcher self-test) > REJECTS a broker id query
- `E-S9`: isInsightsPathFor (decode-tolerant matcher self-test) > REJECTS a broker id segment
- `E-S10`: isInsightsPathFor (decode-tolerant matcher self-test) > REJECTS double-encoded pipes
- `E-S11`: isInsightsPathFor (decode-tolerant matcher self-test) > REJECTS malformed encoding

### N-C `Preferences.pageHttp.test.tsx` (describe `BrokerPreferences over HTTP (#2835)`), from call 3

- `P-BP2`: BrokerPreferences over HTTP (#2835) > BP2: GET /api/broker/market-focus rows reach the page - heading, re-seed button, seeded + manual rows, remove only on manual
- `P-BP3`: BrokerPreferences over HTTP (#2835) > BP3: an empty GET shows the empty state - description (seed|add), seed button, "Add a listing" link - and no list
- `P-BP5`: BrokerPreferences over HTTP (#2835) > BP5: removing a manual row opens a real alertdialog and DELETEs the FULL tuple (incl. server-resolved citySlug); the row disappears and the empty state returns
- `P-BP5c`: BrokerPreferences over HTTP (#2835) > BP5 (cancel): Cancel closes the alertdialog without sending a DELETE, and the row stays
- `P-seed`: BrokerPreferences over HTTP (#2835) > seed: the empty-state "Seed from my listings" POSTs the seed path with no body, toasts the count, and the refetched list shows the seeded rows
- `P-500`: BrokerPreferences over HTTP (#2835) > GET 500: shows the failure alert and no list or seed button; Retry refetches and recovers
- `P-403`: BrokerPreferences over HTTP (#2835) > GET 403: shows the access-denied alert (not the generic failure text)
- `P-404`: BrokerPreferences over HTTP (#2835) > DELETE 404: "Already removed" toast and a refetch that makes the list match the server (row gone)
- `P-guard`: BrokerPreferences over HTTP (#2835) > page guard: a signed-in non-broker, non-admin is sent to /broker/setup and never sees the page

### N-A `App.brokerWorkspaceRoutes.test.tsx`, from call 3

Titles are `[<route>] (a) declares the path exactly once, as <ProtectedRoute><Page /></ProtectedRoute>...`, `(b) anonymous is redirected...`, `(c) while auth initialises...`, `(d) control: a signed-in broker...`, `(d-dealer) control: a signed-in dealer...`, `(e) a signed-in 'user' is redirected to /discover...` under describe `ProtectedRoute at '<route>' (#2835)`, and `['<route>'] (f) admits 'broker' and 'dealer'; rejects 'user' and 'anonymous'` under describe `routeAccess for the broker workspace routes (#2835)`. Full list in `evidence/b1/App.brokerWorkspaceRoutes.test.log`.

## 9. B2 (final statuses after the owner's deletion comment)

Authority: the owner's own PR comment 6246480608 (https://github.com/gautirao/udupi-property-explorer/pull/2840#issuecomment-6246480608, 2026-10-18T06:18:03Z). It names exactly the three deleted paths and keeps `broker-preferences.spec.ts`. Earlier verbatim relays 6237012563 / 6237168119 are context only (not the owner's own comment).

| spec | final status | note |
|---|---|---|
| `e2e/broker-dashboard-v2.spec.ts` | **RETIRED** (deleted in B2) | BD-0b PARTIAL (D1 accepted) |
| `e2e/broker-demand-gaps.spec.ts` | **RETIRED** (deleted in B2) | DG-0b PARTIAL (D1 accepted); G-14 ~15 s test with an explicit 60 s timeout ACCEPTED, no further optimisation |
| `e2e/broker-area-insights.spec.ts` | **RETIRED** (deleted in B2) | BAI-2b-1 OBSOLETE by owner ruling (heading `Manipal`) |
| `e2e/broker-preferences.spec.ts` | **KEPT** | manifest row stays SCHEDULED(PR-6): BP4-c, BP4-e..j, POST 422 UNCOVERED; A29 A30 A31 A33 SURVIVED |

Rulings recorded: **D1** (dealer role-mapping gap, LOW) ACCEPTED; **D2/BAI-2b-1** OBSOLETE; **G-14** ACCEPTED; **#2842** admin stays blocked per `routeAccess.ts` (the page-guard alignment is the separate issue #2845); **#2841** raw `|` in the area-insights request is a follow-up.

### B2 test strengthening and mutation proof

Each strengthened assertion has a mutation (serial, transient product edit, reverted, `git diff -- apps/web/src/hooks` empty afterwards). Evidence: `.claude/handoffs/issue-2835/evidence/mut/MUT-B2-<n>/`
(`mutation.diff`, `red.log`/`red.exit`/`red.failing.txt` before the revert, `green.log`/`green.exit` = 0 after) and `register-b2.tsv`. Each of B2-1..B2-7 went RED, then GREEN after the revert; none SURVIVED.

| id | mutation (transient) | RED test(s) | what actually reddened |
|---|---|---|---|
| B2-1 | `searchParams.set('userId','broker-uid-1')` on the listings request (`useBrokerListings.ts`) | `L-1`, `L-2` | the full key-set assertion (the key set is checked before the identity check) |
| B2-2 | `searchParams.set('extra','1')` on the listings request | `L-1`, `L-2` | the full key-set assertion |
| B2-3 | `?userId=broker-uid-1` on the dashboard quality-summary path | `B-1`, `B-2`, `B-5`, `B-7`, `B-8`, `B-10` | the identity assertion (`not.toContain('broker-uid-1')`) in `B-1`; the others redden because the path-keyed fake throws |
| B2-4 | `userId` added to the market-focus DELETE body | `P-BP5` | the body `toEqual` (fires before the identity check) |
| B2-5 | `&userId=broker-uid-1` on the dashboard recent-activity path | `B-1`, `B-8`, `B-9` | path-exact fake / `toEqual` |
| B2-6 | the B2-3 mutation run against `BrokerListings.bd4.test.tsx` only | `L-1`, `L-2` | the identity assertion ALONE (the BD4 fake dispatches by pathname, so only `expectNoIdentityOnTheWire` sees the id) |
| B2-7 | `headers: { 'X-User-Id': 'broker-uid-1' }` in the market-focus DELETE options | `P-BP5` | the identity assertion ALONE (body and call length unchanged) |

Limits, stated: in the dashboard and preferences files the path-exact fakes and exact-argument assertions would also catch most identity leaks; the identity value/userId check is the only guard against an id placed
where those assertions do not look (B2-6, B2-7 prove it is live). `appRouteWiring.ts` header corrected: a relative nested alias route is NOT detected as a duplicate (comment-only change, no mutation).
