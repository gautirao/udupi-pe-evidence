# Issue #2047 — Broker Commercial, Contact, Mobile and Lifecycle Audit

**Type:** AUDIT_ONLY exploratory product audit. No product code was changed by this audit.
**Branch:** `issue-2047-broker-audit` @ base SHA `004d872a6ab1e0b22bf96c6b3172b2bba33ca3ae`
**Date:** 2026-08-22
**Executed by:** Mode-3 orchestrator + read-only specialist passes

---

## 1. Headline

The audit ran in two phases and **both completed**. Phase 1 was read-only code investigation. Phase 2 was
live execution against a verified environment, after the shared-fixture contention described in §2.

**A representative subset of rows was executed against a real running stack — not the whole matrix.** Be
precise about which, because the difference matters:

Counts below were derived by parsing the Result column of the §4–§8 tables, not estimated. **53 rows total.**

- **Executed and observed — 12 rows.** `C-EMPTYSUBTYPE`, `C-XFIELD-REJECT`, `L-DRAFT`, `L-SUBMIT`,
  `L-PENDING`, `L-REJECT`, `L-RESUBMIT`, `L-APPROVE`, `L-REJECTCODES`, `L-AUTHZ`, `L-TRANSITION`,
  `L-SUBTYPE-SWITCH`. Of these: 9 PASS, 2 FAIL (`L-REJECTCODES`, `L-SUBTYPE-SWITCH`), 1 MIXED
  (`L-TRANSITION`). Archive-at-cleanup was additionally exercised but is not a matrix row.
- **NOT_APPLICABLE — 3 rows.** `K-OVERRIDE`, `K-ALTERNATE`, `K-CONSENT`: the underlying feature does not
  exist, each backed by a citation rather than by an absence of searching.
- **BLOCKED, fixture window closed — 32 rows.** The per-subtype `C-APPLY-*`, `C-REQUIRED-*`, `C-PARITY-*`
  and `C-PERSIST-*` families (16); the remaining contact rows `K-DEFAULTS`, `K-ANON`, `K-AUTH`, `K-WIRE`
  (4); `L-PUBLICVIS`, `L-EDIT`, `L-PAUSE`, `L-TERMINAL` (4); the resilience/accessibility set (8).
- **BLOCKED, permanent — 6 rows.** The real-device mobile set. No device or device farm exists in this
  repository; viewport emulation was deliberately not substituted.

So **12 of 53 rows were executed.** This audit is a deep slice, not a complete matrix. Its value sits in the
seven filed defects, not in coverage breadth.

> Two corrections to this section, both caught by the code-review gate, both recorded rather than quietly
> reworded — over-claiming completeness is the exact failure this report exists to avoid.
> **First:** an earlier draft claimed "every backend, validation and lifecycle row was executed"; the §4/§6
> tables never supported it. **Second:** the replacement split (13 / 20 / 6) was *also* wrong. The prose had
> been corrected but the per-row Result cells were never reconciled with it, so seven executed rows still
> read BLOCKED — including `L-SUBTYPE-SWITCH`, which §13 was still recommending as the "first row to run on
> resumption" even though it had already produced the defect filed as #2289. The tables are now reconciled
> and the counts above are computed from them rather than asserted.

The report keeps a strict separation between what was **observed** and what was only **read in code**. A
code reading can prove a guard *exists*; only execution shows whether it *fires*. That discipline earned its
keep three times: it kept a false `NOT_APPLICABLE` verdict out of the contact section, kept a false
"validation absent" prediction out of the commercial section, and caught a false framing of the single most
severe finding below before it was written down.

### Filed defects

| Issue | Title | Origin |
|---|---|---|
| [#2280](https://github.com/gautirao/udupi-property-explorer/issues/2280) | Broker `contact_phone`/`contact_info` readable by any authenticated user via direct Supabase `select('*')` — **four** call sites. **Exposure OBSERVED live; currently LATENT** (0 of 1847 LIVE listings populated) — see §2c | Phase 1 (scope corrected after structural sweep); confirmed by live capture in Phase 2 |
| [#2281](https://github.com/gautirao/udupi-property-explorer/issues/2281) | Commercial typed fields are write-once — permanently uneditable after listing creation | Phase 1 |
| [#2285](https://github.com/gautirao/udupi-property-explorer/issues/2285) | `local-fixture-backend.sh` clobbers a caller-supplied `CORS_ALLOWED_ORIGINS` | Phase 2 setup (tooling, not product) |

### Defects confirmed by live execution

| Ref | Issue | Severity | Finding |
|---|---|---|---|
| P7 | [#2286](https://github.com/gautirao/udupi-property-explorer/issues/2286) | **high** | `ARCHIVED → LIVE` via admin approve has no completeness guard — a listing with `addressConfirmed=false`, `imageCount=0` was published |
| P6 | [#2287](https://github.com/gautirao/udupi-property-explorer/issues/2287) | medium | Malformed rejection codes accepted identically to valid ones |
| P8 | [#2288](https://github.com/gautirao/udupi-property-explorer/issues/2288) | medium | Owner cannot archive their own LIVE listing (404); mechanism unverified |
| P1 | [#2289](https://github.com/gautirao/udupi-property-explorer/issues/2289) | medium-high | Stale typed fields survive a property-type change — OFFICE fields persisted on a row retyped to `warehouse` |

**#2289 is distinct from #2281 and the two must be fixed independently.** #2281 is *Edit mode cannot render
the commercial fields*; #2289 is *the fields persist as invalid data once the subtype changes*. They
interact — a broker cannot see or clear the stale values precisely because of #2281 — but the causes and
fixes are separate. Fixing #2281 alone would make the stale data visible without removing it; fixing #2289
alone would leave the fields uneditable.

**#2286's scope was widened after Gate F's re-review.** It was originally filed on the narrower "T-29 lacks a
guard" framing. The verified root cause is that `ListingWorkflowService.approveListing` has no completeness
guard for *any* transition reachable through the generic approve endpoint (T-15, T-18, T-25, T-29), that
`ListingTransitionPolicy`'s docstring claiming otherwise is itself false, and that the same method places no
restriction on the starting status — so a SCRAPED listing can be published with `createdBy` still null. A fix
scoped to T-29 alone would have left the rest open.

Not ours: #2279 (interface unification) belongs to #2247 and is out of scope here.

---

## 2. Why Phase 2 was delayed (historical — it did eventually run)

`scripts/db/restore-test-fixture.sh:39` hardcodes `CONTAINER="pg-test-fixture"` with **no environment
override**, and line 98 runs `docker rm -f "${CONTAINER}"` **unconditionally** before `docker run` at line
101. `PG_TEST_PORT` is overridable; the container name is not. Two workers therefore cannot coexist —
bringing up a second fixture destroys the first worker's database.

Three sibling Mode-3 workers (#2044, #2246, #2247) ran concurrently off the same base for the entire audit
window. The fixture was continuously held:

| Time | State | Action taken |
|---|---|---|
| 12:05 | `pg-test-fixture` up; #2246 held a logged claim with no release | Stopped; began environment-free Phase 1 rather than idling |
| 12:45 | #2246 still holding, mid-run | Continued Phase 1; timebox extended 90 → 150 min |
| 13:35 | #2246 still holding; no terminal artefact in their handoff dir | Continued Phase 1 to completion |
| 14:05 | Claim granted **conditional on self re-verification**. Verification found #2247 running a canonical Playwright suite **in flight** (backend PID 63692, `playwright test` PID 88416, 8 live JDBC connections) | Did **not** proceed; returned the decision |
| 14:12 | #2247's suite finished, but their backend still attached with 8 live connections; further runs pending | Did not tear down a sibling's live stack |
| 15:45 | Claim granted again; verification found **#2044**'s backend attached with 5 live JDBC connections (a Phase 7A browser validation nobody had accounted for) | Did **not** proceed; returned the decision |
| 16:00 | Own pre-claim check finally clean — `pg_stat_activity` = 0 and no sibling-worktree process | **CLAIMED.** Phase 2 executed. |

Three separate grants were issued whose stated premise did not survive first-hand verification. Each grant
was explicitly conditioned on the executor re-verifying, and each time that re-verification is what prevented
destroying a sibling's in-flight run. The recurring misreading was treating **idle** as **unclaimed** — an
idle JDBC pool is a live stack between requests, not an abandoned one.

Out of this, a decisive pre-claim test was adopted as standard, because it observes the resource itself
rather than inferring from process names:

```
PGPASSWORD=… psql -h localhost -p 5434 -U postgres -d postgres -t \
  -c "select count(*) from pg_stat_activity where datname='postgres' and pid <> pg_backend_pid();"
```

`0` means genuinely free; anything else means someone owns it, whatever any execution log claims. All three
failed grants would have been caught by it.

The window that eventually opened was long enough for a representative subset of rows, not the full matrix.
See §1 for the exact split of what was executed versus what remains BLOCKED. The six real-device mobile rows
are BLOCKED for a separate and permanent reason (§7) — no device farm exists in the repository.

**No destructive action was taken against a sibling at any point.** The fixture scripts were run exactly
once, only after the claim was verified clean.

---

## 2b. Phase 2 — live execution results

Environment: frontend `http://localhost:5302`, backend `http://localhost:8302`, local PostGIS fixture on
5434, hosted Supabase Auth for JWT validation, worktree HEAD `9ff62d64`. All four fail-closed verifications
passed at 13:52Z before any row was recorded — raw output committed at
`evidence/environment-verification.txt`. Accounts: the dedicated `audit2047-broker` / `-admin` / `-buyer`
identities, never #1713's canonical ones. Raw request/response captures (tokens redacted) are under
`evidence/`.

### P1 — L-SUBTYPE-SWITCH: **DEFECT CONFIRMED**

Phase 1 raised this as a hypothesis and explicitly declined to assert it, because it is a data-integrity
claim that only execution can settle. Execution settles it.

Created a `commercial`/OFFICE listing with `officeSeats=40`, `officeCabins=4`, `officeMeetingRooms=2`,
`commercialFurnishingStatus=FURNISHED`; verified persistence via both the API and a read-only SELECT. Then
PUT `propertyType` → `warehouse` **without supplying any OFFICE field**, exactly reproducing what Edit mode
actually sends (per #2281, Edit omits those keys entirely).

Observed: HTTP 200. `commercialSubtype` correctly re-derived to `WAREHOUSE`. **All four OFFICE-only fields
survived unchanged on the row**, confirmed in the API response and in `listing_commercial_space_details`.

So a listing typed WAREHOUSE carries live OFFICE attributes. The cause is the null-safe merge in
`ListingCrudService.applyCommercialFields:503` combined with the absence of any subtype-change reconciliation:
nothing clears fields that are no longer valid for the new subtype. Note the interaction with #2281 — because
Edit mode cannot render those fields, a broker cannot even see, let alone clear, the stale values.

Evidence: `evidence/P1-L-SUBTYPE-SWITCH.md`, `evidence/p1_create_office.json`,
`evidence/p1_update_to_warehouse.json`.
Dedup: searched "stale typed fields property type change commercial" — no results. No duplicate.

### P7 — L-TRANSITION: one PASS, and one **HIGH-severity defect** (framing corrected)

- `LIVE → LIVE` self-transition: correctly refused with 409. **PASS.**
- `ARCHIVED → LIVE` via admin approve: **succeeded, HTTP 200.** The resulting LIVE listing had
  `addressConfirmed=false` and `imageCount=0` — it bypassed every publish-quality gate the normal submit
  path enforces.

**Framing correction, and it matters.** The executing specialist initially reported this as "the transition
guard was NOT refused", i.e. a broken state machine. That is **wrong**, and filing it that way would have
been a false report. Verified against source before writing this up:
`ListingTransitionPolicy.java:138` contains `new Transition(ARCHIVED, LIVE, ADMIN)` as **T-29** — the
transition is **intentionally permitted** at the matrix level.

The first correction was that T-29 is intentionally allowed and the defect is an absent guard. **Gate F's
re-review then established that even that framing was too narrow, and this second correction materially
changes the fix.**

`ListingTransitionPolicy`'s own docstring at `:185-186` claims that admin-initiated transitions to LIVE
"T-12, T-15, T-18, T-25" carry inline completeness checks in the service. **That claim is false.** Verified
in `ListingWorkflowService.approveListing` (`:187-212`), the method backing the single generic
`POST /api/admin/listings/{id}/approve`: it calls `policy.validate(currentStatus, LIVE, ADMIN)` at `:193`
and then mutates status directly. There is **no completeness check anywhere in the method**, and it places
**no restriction on the starting status**.

So the gap is not T-29-specific. Every admin→LIVE transition reachable through the generic `/approve`
endpoint is unguarded — T-15 (DRAFT), T-18 (PENDING_REVIEW), T-25 (REJECTED) and T-29 (ARCHIVED).
`restoreRejectedListing` (`:729-794`) requires a non-blank moderation note but likewise never checks
completeness. The **only** admin→LIVE path that genuinely validates is `approveScrapedListing` (`:988-1068`),
which calls `validateForSubmission` at `:1004` — and that is reachable only via the separate
`/approve-scraped` endpoint.

There is a secondary consequence the audit had not spotted: because `approveListing` does not constrain the
starting status, calling generic `/approve` on a still-`SCRAPED` listing transitions it to LIVE with
`createdBy` still null, bypassing both the ownership-claim requirement and the one real completeness check
that `approveScrapedListing` would have applied.

Net: an admin publishing through `/approve` bypasses every publish-quality control — image minimum, address
confirmation, family-required fields — for any listing in any permitted starting state. The observed
`addressConfirmed=false, imageCount=0` listing is one instance of a much wider gap.

> **Scope warning for #2286.** The issue was filed on the original, narrower "T-29 lacks a guard" framing.
> As filed it will under-scope the fix: a change that guards only T-29 leaves T-15, T-25 and the
> SCRAPED-without-claim path open. The issue text needs widening to "the generic approve path needs a
> completeness guard covering every reachable transition" before implementation starts. Escalated to the
> Main Agent, since amending an issue is a shared-visible action.

Evidence: `evidence/P2-P3-P5-P6-summary.md` plus the raw captures.
Dedup: searched "archived listing approve completeness guard bypass" and "T-29 fast-restore ARCHIVED LIVE
transition" — no results for either. No duplicate.

### P2-P6 — executed results

> Summary view. The authoritative per-row grades live in the §4 and §6 tables; this table restates them for
> readability. Its `L-DRAFT → L-APPROVE` entry is a composite covering six separate matrix rows — do not
> count it as a row when tallying, or the executed total comes out one too high.

| Row | Result | Observed |
|---|---|---|
| C-EMPTYSUBTYPE | **PASS** | `commercialSubtype` omitted → HTTP 400 with the expected "commercialSubtype is required for propertyType 'commercial'" message; no listing created. Confirms the Phase-1 correction — an earlier pass had predicted FAIL here on the false premise that server-side validation was absent. |
| C-XFIELD-REJECT | **PASS** | `warehouseFlooring` (a valid enum value) submitted under SHOP → HTTP 400, "Field 'warehouseFlooring' is not accepted for this property type"; no listing created. The guard fires; it is not merely present. |
| L-AUTHZ | **PASS** | Buyer token (role `user`) → **403** on approve, reject and return-for-edits. No token → **401** on all three. Server-side authorization holds on every admin endpoint, not just the UI. |
| L-DRAFT → L-APPROVE | **PASS** | Full chain driven through product endpoints only: DRAFT → (422, correctly blocked while incomplete) → PENDING_REVIEW → REJECTED → DRAFT (reopen) → PENDING_REVIEW (resubmit) → LIVE (approve). No direct SQL used at any point. |
| L-REJECTCODES | **FAIL** (confirms the Phase-1 code reading) | `rejectionReason` is unvalidated free text. A malformed code, `"NOT_A_REAL_CODE: ..."`, was accepted identically to a well-formed one — both HTTP 200, both stored verbatim. The UI offers five structured codes; the backend discards the structure. |

---

## 2c. AC4 live capture — #2280 observed, and its severity corrected downward

Owner-approved, tightly scoped to a single capture. No local fixture or backend was involved and none was
claimed: this exposure path is browser → hosted Supabase, bypassing the backend, so the fixture is
irrelevant to it.

**Protocol, agreed before execution, because this reads real hosted data.** Narrowed projection
`select=id,contact_phone,contact_info` — never `select('*')`, so nothing else was fetched. The response was
parsed in memory and only aggregates emitted: status, key-presence, row count, non-null counts. No value, no
partial value, no payload screenshot. The identity was deleted in a `finally` block so it would go even on
failure.

**Observed.** A freshly provisioned user with **no role assigned** — not admin, not broker, owning none of
the rows — authenticated and issued the query directly against hosted PostgREST:

- HTTP **200**, 200 rows returned
- `contact_phone` key present: **true** · `contact_info` key present: **true**
- Rows with non-null `contact_phone`: **0** · non-null `contact_info`: **0**

**The access-control gap is confirmed.** The weakest possible authenticated identity received the contact
columns, with the backend not involved at any point — exactly what row-only RLS
(`V10__update_rls_for_mvp_roles.sql:26-31`) predicts, since Postgres RLS cannot restrict columns. AC4's
DOM-versus-wire question is now settled by observation rather than inference.

**And a correction that lowers the severity.** Counts across the whole project (aggregates only, no values):
1847 LIVE listings, **0** with non-null `contact_phone`, **0** with non-null `contact_info`, **0** at any
status. Not a sampling artefact — the columns are entirely unpopulated.

So the exposure is **latent, not active**: no personal data is reachable today. The defect is that the access
boundary is wrong, and it becomes live the moment any listing acquires a contact number — which the backend
already writes on ingest (`ListingIngestionService.java:137-138`).

This is recorded prominently because the audit had characterised #2280 in terms a reader could take as live
PII exposure, and on today's data that reading would be wrong.

**But "latent" must not be read as "low urgency", and the Gate F delta review was right to push back on
that.** The trigger is not a rare or contingent event: `ListingIngestionService.java:137-138` sets
`contactPhone` and `contactInfo` on **every ingested post**, and ingestion is a shipping, routinely-invoked
pipeline (it has its own production rate limit, `POST /ingestion/ingest-posts` at 10/key/min). The very next
scrape that yields a phone number converts this from latent to live — with no code change, no configuration
change, and no new action required by an attacker.

**Severity floor: treat #2280 as HIGH.** Do not downgrade it to medium or backlog on the strength of the
zero-row count, and do **not** close it on the grounds that nothing is exposed today. The access boundary is
genuinely absent; the only thing currently missing is the data, and normal operation supplies that.

Full evidence: `evidence/AC4-K-WIRE-live-capture.md`.

---

## 3. Matrix row schema

Every row carries the eleven required fields. Four are uniform across rows and are stated once here rather
than repeated 40 times:

- **Environment:** frontend `http://localhost:5302`, backend `http://localhost:8302`, local PostGIS fixture
  on 5434, hosted Supabase Auth for JWT validation, worktree HEAD `9ff62d64`. Brought up and verified at
  13:52Z. Rows still marked BLOCKED were not reached before the fixture window closed — the environment
  existed, the row simply was not driven.
- **Account:** the three dedicated `audit2047-broker` / `-admin` / `-buyer` identities, all provisioned for
  this audit and all deleted at cleanup (§11). No #1713 canonical identity was used at any point.
- **Listing:** three `AUDIT-2047-` listings were created; IDs, purposes and final dispositions are in §11 and
  in `evidence/created-listings.log`. Two were archived through the product API; one is stranded (P8/#2288).
- **Evidence:** `evidence/environment-verification.txt` holds the raw output of the four fail-closed checks
  (AC2). Raw HTTP captures for each executed row, with tokens redacted, are alongside it under `evidence/`.

> This section previously stated that no environment, account or listing existed — accurate for Phase 1, and
> stale once Phase 2 ran. Corrected after the code-review gate flagged it as contradicting §2b and §11.

Per-row columns below: **Result**, **Steps**, **Code-analysis finding** (what reading established, clearly
*not* an observed result), **Dedup search**, **Disposition**.

Result values: `PASS` / `FAIL` / `BLOCKED` / `NOT_APPLICABLE`. A row is marked `PASS` **only** where it was
actually executed and its assertion actually observed. Rows settled by code reading alone are never `PASS` —
they stay `BLOCKED` with the reading recorded separately in the code-analysis column, so the two grades of
evidence can never be confused.

---

## 4. Commercial section

Representative subtypes: **SHOP, BUILDING, WAREHOUSE, LAND** (four, not five — see §8 for why OFFICE is
excluded).

| Row | Result | Steps (for a resumed run) | Code-analysis finding (NOT observed) | Disposition |
|---|---|---|---|---|
| C-APPLY-SHOP | BLOCKED | Open `/broker/listings/new/commercial`, pick SHOP, inspect purpose options | Sale/rent/lease is **uniform and declarative** for all subtypes: `PURPOSE_OPTIONS` (`CommercialListingForm.tsx:90-94`) is a fixed 3-item array rendered unconditionally; the server's rent/lease gate is subtype-blind | Not a defect on current evidence |
| C-APPLY-BUILDING | BLOCKED | As above, propertyType `commercial_building` | Same — uniform | Not a defect |
| C-APPLY-WAREHOUSE | BLOCKED | As above, `warehouse` | Same — uniform | Not a defect |
| C-APPLY-LAND | BLOCKED | As above, `commercial_land` | Same — uniform | Not a defect |
| C-REQUIRED-SHOP | BLOCKED | Attempt submit with fields empty; record which are enforced | Client hard-required set is identical for all subtypes: `canSubmit = subtypeResolved && priceValid` (`CommercialListingForm.tsx:310-311`). Server requiredness is structural-presence-only (`rejectIfPresent`/`rejectIfNonEmpty`), not must-be-present, except `commercialOwnership` | Needs execution |
| C-REQUIRED-BUILDING | BLOCKED | As above | Same; extras `floorMode`, `powerLoadKva`, `occupancyStatus` | Needs execution |
| C-REQUIRED-WAREHOUSE | BLOCKED | As above | Same; extras `warehouseClearHeightFt/LoadingBays/TruckAccess/Flooring` | Needs execution |
| C-REQUIRED-LAND | BLOCKED | As above | Same; extras `commercialZoning/Ownership/Approvals`; **only** subtype dropping the entire built-space block, and the only one using `landArea` not `builtArea` | Needs execution |
| C-PARITY-SHOP | BLOCKED | Complete form → Review/Preview → compare field by field against the persisted payload | Not determinable by reading — Review renders from local state; only execution shows divergence | Needs execution |
| C-PARITY-BUILDING | BLOCKED | As above | As above | Needs execution |
| C-PARITY-WAREHOUSE | BLOCKED | As above | As above | Needs execution |
| C-PARITY-LAND | BLOCKED | As above | As above | Needs execution |
| C-PERSIST-SHOP | BLOCKED | Submit, then GET the listing and compare stored values | **Trap:** assert against `listing_commercial_space_details`, *not* the V102 per-subtype tables — see §6 | Needs execution |
| C-PERSIST-BUILDING | BLOCKED | As above | Same trap applies | Needs execution |
| C-PERSIST-WAREHOUSE | BLOCKED | As above | Same trap applies | Needs execution |
| C-PERSIST-LAND | BLOCKED | As above | Same trap applies | Needs execution |
| C-EMPTYSUBTYPE | **PASS (observed)** | POSTed a commercial listing with `commercialSubtype` omitted | Observed HTTP 400, "commercialSubtype is required for propertyType 'commercial'"; no listing created. `ListingController.java:985-1010`. Note: no DB-level CHECK/NOT NULL backstop (`V102:85`, `V104:38` are plain `text`) — the guard is service-layer only. | Executed in Phase 2 (`evidence/p2_empty_subtype.json`). Not a defect |
| C-XFIELD-REJECT | **PASS (observed)** | POSTed `warehouseFlooring` (a valid enum value) under SHOP | Observed HTTP 400, "Field 'warehouseFlooring' is not accepted for this property type"; no listing created. The guard in `validateCommercialFieldSet` fires — it is not merely present. | Executed in Phase 2 (`evidence/p3_xfield_shop_warehouseflooring_v2.json`). Not a defect |

**Correction recorded:** an early pass predicted `C-EMPTYSUBTYPE` would FAIL on the basis that server-side
validation was absent. That was **wrong** and was overturned before it reached this report.

---

## 5. Contact and privacy section

**This section was nearly deleted in error.** An early pass concluded contact data was "architecturally
absent" and proposed marking all seven rows `NOT_APPLICABLE`, based only on `ListingResponse` not carrying
contact fields. That is one axis. A five-axis re-examination found the section contains this audit's most
significant finding. The single-axis conclusion was rejected at the time and never entered this report.

**Backend REST is genuinely clean.** `contactInfo`/`contactPhone` exist on the entity
(`Listing.java:122,125`) and are written on ingest (`ListingIngestionService.java:137-138`), but never reach
`ListingResponse`. Corroborated three ways: `PublicListingControllerTest.java:1056` asserts
`jsonPath("$.contactPhone").doesNotExist()`; `ListingResponseMapperTest.java:649` lists it among excluded
fields; and `e2e/canonical/listing-detail-gating.canonical.ts:44-76` records a **live-curl-verified** finding
that an authenticated GET against a listing with a real seeded `contact_phone` never returns the key.

**The frontend bypasses the backend entirely for this data.** `property_listings` RLS
(`V10__update_rls_for_mvp_roles.sql:26-31`) is `FOR SELECT TO authenticated USING (status='LIVE' OR ...)` — a
**row** filter. Postgres RLS **cannot restrict columns**. Any wide projection therefore returns
`contact_phone`/`contact_info` to any authenticated caller.

| Row | Result | Code-analysis finding (NOT observed) | Dedup search | Disposition |
|---|---|---|---|---|
| K-DEFAULTS | BLOCKED | Broker defaults live on the listing entity; buyer-visible result requires rendering to confirm | — | Needs execution |
| K-OVERRIDE | NOT_APPLICABLE | **No per-listing contact override exists** — no form field, no DTO field, no distinct column. Verified across the entity, all response DTOs, and all controllers | "contact_phone OR contactPhone OR contact exposure" | Not a defect — feature absent by design |
| K-ALTERNATE | NOT_APPLICABLE | No owner/developer/alternate contact concept exists anywhere | as above | Not a defect — feature absent |
| K-ANON | BLOCKED | Anonymous path uses `ListingTeaserResponse`, which documents at `:11-14` that it omits `contactPhone` | — | Needs execution |
| K-AUTH | BLOCKED | Authenticated REST path also omits contact fields — but see K-WIRE | — | Needs execution |
| **K-WIRE** | **BLOCKED** (finding established by code, not observed) | **The distinction AC4 asks for is real and it fails on the non-REST axis.** Contact data is absent from the REST wire payload but reachable by any authenticated user through direct Supabase queries — four call sites, below | "RLS column supabase direct read bypass" → #2280 | **Filed: #2280** |
| K-CONSENT | NOT_APPLICABLE | No privacy/consent wording is rendered around contact publication — consistent with there being no buyer-facing contact surface in the product's intended design | — | Consider a product decision if contact display is ever introduced |

### The four exposure call sites (#2280)

| # | Site | Projection | Gate | Severity |
|---|---|---|---|---|
| 1 | `useSimilarListings.ts:17-19` | `select('*, raw_posts(images))` | No **application-level** role, ownership or admin check anywhere in the call path — only requires `listingId`/`locality`/`propertyType` to be truthy | **Most immediate trigger.** Rendered by `SimilarListings.tsx` on *every* listing-detail page view |
| 2 | `usePropertyListings.ts:306-308` | `select('*, raw_posts(images))` | `enabled: !!user` — any authenticated user | **Broadest reach.** Main browse hook, 69 downstream importers across Discover/Listings/Map |
| 3 | `useDuplicateManagement.ts:26-27,49-50` | `select('*, raw_posts(images, content))` | client-side `enabled: isAdmin` | The site #2280 was originally filed against |
| 4 | `useAdminData.ts:331-333` | `select('*, raw_posts(images))` | client-side `isAdmin` | Second admin instance |

**Precision note on sites 1 and 2 (added after security review).** Site 1 has no *application-level* gate,
but the RLS policy is still `TO authenticated`, so a genuinely anonymous visitor gets zero rows. Sites 1 and
2 therefore share the same **authorization floor** — any authenticated account. They differ on two separate
axes, not one ordinal ranking: site 1 on immediacy of trigger (fires on every detail view, no interaction
needed), site 2 on blast radius (69 importers). An earlier draft of this table described site 1's gating as
"none at all", which overstated the difference; corrected here. Both need the same remedy.

**Also exposed by these `select('*')` projections:** `created_by`, a UUID referencing `auth.users`. Low
severity on its own (an opaque identifier, not directly PII) but it is returned to any authenticated caller
alongside the contact fields, and is worth noting on #2280.

`enabled: isAdmin` is a React Query flag, **not a security boundary** — it does not stop any authenticated
user issuing the equivalent query with their own browser-held Supabase JWT.

**Same bug class as #2242** (admin pending-queue bypassing the backend), which is closed and fixed in this
base. These are unfixed sibling instances of that pattern.

**Sweep certification.** Enumeration was **structural, not textual**: `find_importers` on
`src/integrations/supabase/client.ts` returned 16 importers and every one was read. This matters because
jCodemunch `search_text` proved unreliable here — it failed to return `useDuplicateManagement.ts`'s own known
`supabase.from()` calls even after a full non-incremental reindex. The other 12 importers were graded SAFE
with reasons (narrow projections, own-user-id reads under real RLS, admin-only `FOR ALL` policies, an
aggregate-only RPC, auth-session-only calls). Notably `usePropertyListings.ts:502` `useUpdateListing` has
**no** client-side gate yet is genuinely SAFE, because `V59`'s UPDATE policy enforces
`created_by = auth.uid()` — a real server-side boundary.

**Not graded** (declared, not silently omitted): `e2e/**`, `supabase/functions/**` (service-role Deno code, a
different trust boundary), and test files.

> **Named follow-up sweep target — `supabase/functions/**`.** Service-role Edge Functions bypass RLS
> entirely by construction. If any function performs a wide `select('*')` / service-role read and forwards
> the row to a caller with broader reach than "authenticated", that would be a **strictly worse** instance of
> the same bug class than the four sites above. Excluding it from this pass is correct trust-boundary
> reasoning, but it should be swept explicitly rather than left as a standing exclusion. Raised by the Gate F
> security review of this report.

---

## 6. Lifecycle section

**#2242 is CLOSED and its fix is present in this base** — `PendingListings.tsx:65-74` now reads the admin
queue via `api.get('/api/admin/listings/pending?size=100')`, replacing the former direct Supabase read. The
issue text's instruction to record the run as "blocked by #2242" if the queue and backend diverge **does not
apply**, and no row below is attributed to it.

| Row | Result | Code-analysis finding (NOT observed) | Disposition |
|---|---|---|---|
| L-DRAFT | **PASS (observed)** | Draft created via product API; listing `fb4d0897`. | Executed in the P5 chain |
| L-SUBMIT | **PASS (observed)** | Submit initially returned 422 while the listing was incomplete — the completeness gate on the broker path fires correctly — then succeeded once satisfied. | Executed in the P5 chain |
| L-PENDING | **PASS (observed)** | Listing appeared in `GET /api/admin/listings/pending?size=100`, read through the backend (post-#2242). | Executed in the P5 chain |
| L-REJECT | **PASS (observed)** | Admin reject → status REJECTED. | Executed in the P5 chain |
| L-RESUBMIT | **PASS (observed)** | Broker reopened to DRAFT then resubmitted → PENDING_REVIEW. | Executed in the P5 chain |
| L-APPROVE | **PASS (observed)** | Admin approve → LIVE. Note: this path has no completeness guard (see P7 / #2286). | Executed in the P5 chain |
| L-PUBLICVIS | BLOCKED | — | Needs execution |
| L-EDIT | BLOCKED | See #2281 — commercial typed fields are not editable at all | Needs execution |
| L-PAUSE | BLOCKED | — | Needs execution |
| L-TERMINAL | BLOCKED | — | Needs execution |
| L-REJECTCODES | **FAIL (observed)** | Rejected with a well-formed code, then with `"NOT_A_REAL_CODE: ..."` | Both accepted identically — HTTP 200, stored verbatim. `rejectionReason` is unvalidated free text; the UI's five structured codes are discarded. Confirms the Phase-1 code reading. | Executed in Phase 2. **Filed as [#2287](https://github.com/gautirao/udupi-property-explorer/issues/2287)** |
| L-AUTHZ | **PASS (observed)** | Called approve / reject / return-for-edits with a buyer token, then with no token | Buyer token → **403** on all three; no token → **401** on all three. Server-side authorization holds, not merely the UI gate. Matches `@PreAuthorize` at `AdminListingController.java:66,128` and the inline guards at `:166,190`. | Executed in Phase 2 (`evidence/P4-L-AUTHZ.md`). Not a defect |
| L-TRANSITION | **MIXED (observed)** — PASS on self-transition, **FAIL** on the guard gap | Approved an already-LIVE listing, then approved an ARCHIVED one | `LIVE → LIVE` correctly refused with 409. `ARCHIVED → LIVE` returned 200 and published a listing with `addressConfirmed=false`, `imageCount=0`. Root cause is NOT a broken matrix — T-29 is intentionally allowed; `approveListing` has no completeness guard for any transition it can reach. See §2b. | Executed in Phase 2. **Filed as [#2286](https://github.com/gautirao/udupi-property-explorer/issues/2286)** (scope widened) |
| L-SUBTYPE-SWITCH | **FAIL (observed)** | Created a commercial/OFFICE listing with subtype fields populated, then PUT `propertyType` → `warehouse` supplying none of them | All four OFFICE-only fields survived on the retyped row, confirmed in the API response and in `listing_commercial_space_details`. The Phase-1 hypothesis, deliberately left unasserted, is confirmed by execution. | Executed in Phase 2 (`evidence/P1-L-SUBTYPE-SWITCH.md`). **Filed as [#2289](https://github.com/gautirao/udupi-property-explorer/issues/2289)** |

**No lifecycle state was forced by direct SQL** — no SQL write was issued at all (AC6 satisfied).

---

## 7. Real-device mobile section

**Device-farm absence is VERIFIED repo-wide**, not assumed. Read end-to-end: `playwright.config.ts`,
`playwright.canonical.config.ts`, `playwright.parity.config.ts`, `.github/workflows/ci.yml`,
`.github/workflows/e2e-post-deploy.yml`, `package.json`. No BrowserStack, Sauce Labs, LambdaTest, Perfecto,
Appium, WebdriverIO, or Playwright `connectOptions`/`wsEndpoint` remote grid anywhere. CI installs
`chromium` only. `package.json` devDependencies contain only `@playwright/test`.

The sole "mobile" project is `parity-mobile` (`playwright.parity.config.ts:90-93`), which is
`devices['Desktop Chrome']` at viewport `{390, 844}` — a desktop Chromium at phone size, **not a real device
and not even Playwright's own device emulation** (no touch or UA emulation).

| Row | Result | Reason |
|---|---|---|
| M-CAMERA | BLOCKED | Two independent causes — see below |
| M-GALLERY | BLOCKED | Two independent causes |
| M-PHOTOFAIL | BLOCKED | Two independent causes |
| M-MAP | BLOCKED | Cause 1 only |
| M-KEYBOARD | BLOCKED | Cause 1 only |
| M-RESUME | BLOCKED | Cause 1 only |

**Cause 1 (all six rows):** no real device or device farm is available to this run, and none exists in the
repository. **Viewport emulation was deliberately not substituted.** Presenting emulation as real-device
evidence is explicitly forbidden by the issue contract, and doing so would be worse than a short section.

**Cause 2 (the three photo rows only), stated separately as required:** photo upload is a hosted-Storage
signed-URL split. `ListingImageController.java:232` calls
`storageService.createSignedUploadUrl(LISTING_IMAGES_BUCKET, ...)` (`SupabaseStorageService.java:269`); the
browser then PUTs the binary directly to hosted Supabase Storage
(`useListingImages.ts:307-311`, with an explicit "do NOT add an Authorization header" comment), and the
backend separately writes the row to Postgres. Under a local-fixture backend the DB row is local while the
binary is hosted.

*Correction:* an earlier pass overstated this as breaking the display path. It does **not** — `getPublicUrl`
(`useListingImages.ts:333`) derives from the same hosted bucket the PUT targeted. The split only breaks
**cross-environment**. Recorded at that precision rather than left overstated.

---

## 8. Resilience and accessibility section

| Row | Result | Reason |
|---|---|---|
| R-NETWORK | BLOCKED | Standing reason (§2) |
| R-BACK | BLOCKED | Standing reason |
| R-SESSION | BLOCKED | Standing reason |
| R-DOUBLE | BLOCKED | Standing reason. Note for a resumed run: this row can create a duplicate listing — record both IDs and clean up both |
| A-KEYBOARD | BLOCKED | Standing reason |
| A-FOCUS | BLOCKED | Standing reason |
| A-LABELS | BLOCKED | Standing reason |
| A-ANNOUNCE | BLOCKED | Standing reason |

Accessibility rows are **especially** unsuited to code-reading substitutes: an `aria-live` attribute in the
source proves markup exists, not that a screen reader announces anything useful at the right moment.

---

## 9. Subtype equivalence classes (Phase 2 sizing)

All five subtypes have **backend-enforced** (400-on-mismatch) contract differences via
`validateCommercialFieldSet` (`ListingController.java:1102-1211`), so none is purely cosmetic. They group
into four classes:

| Class | Members | Distinguishing extras | Persistence |
|---|---|---|---|
| A | SHOP, OFFICE | SHOP: `occupancyStatus`. OFFICE: `officeSeats`, `officeCabins`, `officeMeetingRooms` (no `occupancyStatus`) | Same table, same skeleton |
| B | BUILDING | `floorMode`, `powerLoadKva`, `occupancyStatus` | Same skeleton |
| C | WAREHOUSE | `warehouseClearHeightFt/LoadingBays/TruckAccess/Flooring` | Same skeleton |
| D | LAND | `commercialZoning/Ownership/Approvals`; drops the entire built-space block; `landArea` not `builtArea` | Genuinely different contract |

**Minimal representative set: {SHOP, BUILDING, WAREHOUSE, LAND}** — four, not five. SHOP beats OFFICE as the
class-A representative because it also exercises `occupancyStatus`, `hubType` and `floorChoice`
(enum + enum + int) versus OFFICE's three plain ints, giving broader field-type coverage for the same
execution cost.

**Looks distinct but is not:** SHOP vs OFFICE. Different picker UX, labels and icons, but one table, one
skeleton, one purpose gate. `V102`'s comment — *"shop / office — shared shape, discriminated by
commercial_subtype"* — is confirmed.

### The V102 trap (prevented a false defect report)

`ListingCrudService.refreshTypedProjections:608-635` routes **all** commercial families into
`listing_commercial_space_details`. The V102 tables `listing_commercial_building_details`,
`listing_warehouse_details` and `listing_commercial_land_details` exist in schema but have **no `@Entity` or
`@Repository` anywhere**; since JPA is this codebase's only persistence path, that absence is structural
rather than a keyword miss.

**Why this matters:** a Phase-2 persistence check phrased as *"does BUILDING data land in
`listing_commercial_building_details`?"* would have found it empty and reported a **false defect**. Caught
before execution.

*Declared limit:* verified for the main create/update path and by repo-wide symbol absence.
Ingestion/admin/scheduled/seed paths were not walked individually, and a raw native-SQL writer bypassing JPA
is not fully excluded. Stated as high-confidence inference, not proof.

---

## 10. Corrections made during this audit

Retained deliberately — the correction history is what makes the rest of the report trustworthy.

| Claim | Source | Outcome |
|---|---|---|
| All seven contact rows are `NOT_APPLICABLE`; contact data is "architecturally absent" | early qa-fast pass | **Overturned.** Single-axis (backend DTOs only). Accepting it would have deleted the section containing #2280 |
| Server-side commercial subtype validation is absent; `C-EMPTYSUBTYPE` will FAIL | early qa-fast pass | **Overturned.** `ListingController.java:985-1010` does reject with a 400 |
| Backend Java files "do not exist" in the worktree; escalate to a higher model tier | qa-fast `ESCALATION_REQUIRED` | **Rejected — false premise.** `ls` showed 13 files. Root cause was a read-guard hook refusing `grep`, generalised into "files absent". No model switch made |
| #2281 is a 400-on-save or silent data-loss bug | orchestrator's own initial framing | **Corrected by checking.** `applyCommercialFields:503` is a null-safe merge, so stored values survive. It is a permanent *edit blackout*. Filing it as data loss would have been false |
| The photo local/hosted split breaks the display path | earlier qa pass | **Narrowed.** `getPublicUrl` derives from the same bucket; only cross-environment breaks |
| The contact exposure is a single admin-page issue | initial #2280 framing | **Extended to four sites**, two reachable by any authenticated user |

---

## 11. Test-data cleanup — one item STRANDED, reported explicitly

### Identities: fully cleaned

All dedicated identities were deleted from hosted Supabase Auth (HTTP 200 each). No unrelated hosted data
was touched at any point. The three below covered Phase 2 matrix execution; a **fourth**, short-lived
`audit2047-buyer` (a distinct account, uuid `d1dbd82d-...`, reusing the same email string) was provisioned
and deleted for the §2c AC4 capture — four provision/delete cycles in total, all closed.

| Identity | UUID | Deletion |
|---|---|---|
| `audit2047-broker@udupi-audit.invalid` | `24423e11-7818-4e42-9088-0cbc988a2e2c` | 200 OK |
| `audit2047-admin@udupi-audit.invalid` | `aaffbb52-910f-43b4-a809-1087f39fb724` | 200 OK |
| `audit2047-buyer@udupi-audit.invalid` | `3c3510e0-6056-4e5c-b1f3-439048d28ab6` | 200 OK |

### Listings: two archived, one STRANDED

| Listing ID | Title | Final state | Cleanup |
|---|---|---|---|
| `fb4d0897-e22c-4e4d-8867-19e4cb8f7db3` | AUDIT-2047-lifecycle-chain | ARCHIVED | Archived via product API, 200 |
| `fefd5d9f-b6fa-4ba6-bab2-28650d5100d3` | AUDIT-2047-rejectcode-malformed | ARCHIVED | Archived via product API, 200 |
| `824df417-5458-4e8c-913a-413b8c273ec4` | AUDIT-2047-office-subtype-switch | **LIVE — STRANDED** | `POST /api/listings/{id}/archive` returned **404 "Listing not found"** to the broker who owns it |

### P8 — the stranded listing is itself a finding

This is reported rather than worked around. Direct SQL would have cleared it in one statement, and that is
exactly what the audit contract forbids: a state the product cannot reach is the finding, not an obstacle to
route around.

Observed: the broker who created the listing, holding a valid token, called the product's own archive
endpoint on a LIVE listing they own and received **404 "Listing not found"**. The same token archived the
other two listings successfully moments earlier, so this is not an auth, token or ownership-identity problem.

Read-only SELECT comparing the three rows — all share `created_by = 24423e11-...` — isolates two differences
on the stranded row:

| Row | status | property_type | address_confirmed | archive |
|---|---|---|---|---|
| fb4d0897 | ARCHIVED | commercial | `t` | 200 |
| fefd5d9f | ARCHIVED | commercial | `t` | 200 |
| **824df417** | LIVE | **warehouse** | **`f`** | **404** |

The stranded row is the one that went through the P1 subtype switch (`commercial` → `warehouse`) and the P7
`ARCHIVED → LIVE` admin approve (which is why `address_confirmed` is `f` — it never passed a completeness
gate).

**Mechanism NOT verified.** The 404 correlates with `property_type=warehouse` and/or
`address_confirmed=false`, but which one causes it — and whether the listing is invisible to its owner
everywhere or only on the archive path — was not established. The audit identities had already been deleted
as part of the same cleanup pass, so no broker token remained to probe further, and re-provisioning to chase
it would have re-opened hosted-Auth writes that the owner scoped tightly. Stating the correlation and
declaring the mechanism unverified, rather than guessing at a cause.

**Action required:** listing `824df417-5458-4e8c-913a-413b8c273ec4` remains LIVE in the local fixture DB.
It is a synthetic `AUDIT-2047-` record in a disposable local fixture, not production data, so the residue is
contained — but it is handed over explicitly rather than silently left behind. Recommend filing P8 alongside
P1 and P7, since all three were produced by the same sequence and P8 may well be a downstream consequence of
P1's stale-field state.

Dedup: no search performed for P8 — it surfaced during cleanup after the main dedup pass. Must be searched
before filing.

---

## 12. Acceptance criteria status

| AC | Status | Note |
|---|---|---|
| AC1 — every row carries a result | **PARTIAL** | Every row is present and carries a result, which is AC1's literal criterion. Graded PARTIAL rather than PASS because only 12 of 53 rows were executed: 32 remain BLOCKED because the fixture window closed, 6 are permanently BLOCKED for want of a device, and 3 are NOT_APPLICABLE. An earlier revision graded this PASS on the back of a headline that over-claimed full execution; the code-review gate caught both. See §1 for the exact split. |
| AC2 — four env verifications pass before any row | **PASS** | All four passed at 13:52Z BEFORE any row was recorded. Raw output committed at `evidence/environment-verification.txt`. Note the first run FAILED on CORS and on a bad canary probe; both were fixed and re-run rather than waived. |
| AC3 — a listing reaches the furthest lifecycle state | **PASS** | `fb4d0897` driven DRAFT -> PENDING_REVIEW -> REJECTED -> DRAFT -> PENDING_REVIEW -> LIVE -> ARCHIVED entirely through product endpoints. |
| AC4 — K-WIRE distinguishes DOM hiding from wire absence | **PASS (observed)** | Settled by live capture, not code analysis. A plain authenticated user — no role, no admin rights, no ownership — queried hosted Supabase directly and received the `contact_phone` and `contact_info` columns: HTTP 200, both keys present in the payload, backend not involved. The DOM-versus-wire distinction is therefore observed. **Important refinement:** 0 of 1847 LIVE listings carry contact data at any status, so the exposure is currently LATENT rather than active — the access boundary is wrong, but no personal data is reachable today. This lowers #2280's immediate severity while leaving the defect intact. Recorded in `evidence/AC4-K-WIRE-live-capture.md` under an aggregate-only protocol: narrowed projection, counts and key-presence only, no value ever fetched or printed. |
| AC5 — mobile rows BLOCKED with exact reason, no emulation | **PASS** | Device-farm absence verified repo-wide (3 Playwright configs + ci.yml + e2e-post-deploy.yml + package.json). No emulation substituted anywhere. |
| AC6 — no SQL-forced state; no attribution to closed #2242 | **PASS** | Every transition driven via product endpoints. SQL used ONLY for read-only SELECT verification. The stranded listing (P8) was left stranded rather than SQL-deleted. |
| AC7 — every listing ID recorded with disposition | **PASS** | All three recorded at creation in `evidence/created-listings.log`; final dispositions in §11, including the stranded one. |
| AC8 — every filed issue records its dedup search | **PASS** | Every filed issue has a recorded search with its query and result. P8/#2288 was initially filed before its dedup search — flagged by the code-review gate as a real process violation, not a documentation nit. The search was then run: "archive listing 404 not found owner broker" returned only #2288 itself plus two unrelated hits, and "listing not found owner archive endpoint scoping" returned nothing. No pre-existing duplicate, so #2288 stands — but it was filed out of order and that is recorded rather than smoothed over. |
| AC9 — diff only under `docs/audit/issue-2047/**` | **PASS** | Report plus `evidence/`. Verified by `git status --porcelain --untracked-files=all`. |
| AC10 — no secret/token/PII in any artefact | **PASS — scoped: no secrets, no tokens, no real-person PII** | **What is claimed, and what is not.** Demonstrated: no secrets, no credentials and no bearer tokens in any committed artefact, and no real-person PII. NOT claimed: that the evidence tree is free of identifiers — it is not, deliberately. The committed JSON, captured headers and logs retain **synthetic audit identifiers**: the `audit2047-*` Auth UUIDs (including where one appears inside a `storagePath`), `created_by`-adjacent identifiers, the audit listing IDs, and full listing records for listings this audit itself created. Every one of those belongs to a throwaway `audit2047-*` identity provisioned for this run and deleted at cleanup (§11, AC11); none maps to a real person, a customer record, or a canonical #1713 account. They are retained by design, because they *are* the evidence — stripping them would make the findings unverifiable. **How the narrower claim was established.** The service-role key was read at invocation only, passed by env var never argv, and never echoed or persisted; passwords were random and written only to a mode-600 file outside the repo; all contact data is synthetic. Gate F read the report and ~20 evidence files and found nothing, but flagged that its sweep was SAMPLED rather than exhaustive because the repo's read-guard hook blocks `grep`. That gap was then closed: a pattern scan over **all 74 files** in the report tree (JWT `eyJ...`, bearer-with-value, service_role, sb_secret, apikey values, credentialed postgres URIs, password assignments, Indian phone numbers) returned **zero real hits**. The only three matches were the bare response header `WWW-Authenticate: Bearer` carrying no token, where the pattern spanned a line break. That scan is exhaustive over the secret/token/phone-number patterns it defines, which is exactly why this row is certified in those terms and no wider: an earlier revision asserted "no PII" broadly while the scan had only actually tested phone-number patterns, and the external review at `a6ba1732` correctly flagged the certification as broader than the proof. The substantive findings are unaffected by this correction. |
| AC11 — dedicated `audit2047-*` identities, deleted at cleanup | **PASS** | **Four** identities were provisioned across the run, not three: `audit2047-broker`, `-admin` and `-buyer` for Phase 2 matrix execution, then a FOURTH short-lived `audit2047-buyer` (a distinct account, uuid `d1dbd82d-...`, reusing the email string) for the §2c AC4 capture. All four were deleted, HTTP 200 each. The count was corrected after the Gate F delta review caught §11 and this row still saying "three" once the AC4 capture added a fourth cycle — a factual error in a security self-certification table, which is precisely the class of defect this report treats as real elsewhere. Canonical #1713 accounts never used. |

---

## 13. Resumption

Phase 2 is **fully planned** — environment commands, the four fail-closed verifications, the four-subtype
representative set, the row list, and the traps to avoid are all specified. A resumed run executes
immediately rather than re-investigating.

**Preconditions:**
1. `pg-test-fixture` genuinely free — verify **both** `ps` for sibling-worktree java/vite/playwright
   processes **and** `pg_stat_activity` connection count = 0. Idle is not the same as unclaimed, and an
   attached backend with zero in-flight tests is still someone's environment.
2. A clear window of 45–60 minutes: fixture restore + backend boot (the script permits up to 240s) + Vite +
   the four verifications must all complete before the first row may legitimately be recorded.

**Recommended first rows on resumption — the 32 rows the fixture window closed on.** Enumerated in full so none is silently dropped: the per-subtype `C-APPLY-*` / `C-REQUIRED-*` / `C-PARITY-*` / `C-PERSIST-*` families across {SHOP, BUILDING, WAREHOUSE, LAND} (16); the contact rows `K-DEFAULTS`, `K-ANON`, `K-AUTH`, `K-WIRE` (4) — `K-WIRE`'s underlying question has ALREADY been settled by the §2c AC4 live capture — the exposure is confirmed observed. The matrix row remains formally BLOCKED only because it was never driven as a row; do not re-run it expecting a new answer; `L-PUBLICVIS`, `L-EDIT`, `L-PAUSE`, `L-TERMINAL` (4); and the resilience/accessibility set (8). Do NOT re-run `L-SUBTYPE-SWITCH` — it was executed, produced a confirmed defect, and is filed as #2289.

### Structural recommendation (not filed from this branch)

The root obstacle was not this issue. A single machine-wide fixture container with a **hardcoded name** and
an **unconditional `docker rm -f`**, shared by concurrent Mode-3 workers, makes environment-dependent work
serialise unpredictably and leaves every worker one command away from destroying another's run.
Parameterising `CONTAINER` alongside the already-parameterised `PG_TEST_PORT` in
`scripts/db/restore-test-fixture.sh` would let workers run genuinely isolated fixtures. That is an
infrastructure change and is out of scope for an AUDIT_ONLY branch.

### Tooling gaps worth carrying forward

- **jCodemunch `search_text` is unreliable in this repo.** It silently under-reported known content even
  after a full non-incremental reindex, and one query self-reported `absence_evidence.citable:false`. **Any
  absence claim resting on a `search_text` zero-hit must be treated as non-citable.** Structural tools
  (`find_importers`/`find_references`) plus direct `Read` proved reliable and were used for every absence
  claim in this report.
- `find_references` returns 0 for intra-file private methods — a known resolution gap, **not** evidence of
  dead code.
