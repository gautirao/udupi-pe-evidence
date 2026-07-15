# PLAN_REVIEW — #1900 City Geography Curation Pipeline

**Reviewer role:** Principal architect (design-only; no code, branches, or migrations produced)
**Date:** 2026-07-15 (original review); **superseded 2026-07-15** by the provider-viability investigation below
**Verdict headline (CURRENT, post-supersession):** #1900 is an **offline extraction → reviewed artifact → #1887 batch/dry-run/apply MVP** — no database-backed multi-provider curation platform, no 4-way sub-issue split. See "SUPERSEDING DECISION" immediately below. The original "split into 4 sequenced sub-issues" headline and the architecture in §§0–9 that follows are a **historical snapshot** of the pre-investigation design, retained only as a future-scale option (see the superseding decision's "What is deferred, not discarded").

---

## SUPERSEDING DECISION (2026-07-15, post provider-viability investigation)

> After comparing this architecture proposal with merged #1887 PR1 and the
> actual provider investigation
> ([`issue-1900-provider-viability-review.md`](issue-1900-provider-viability-review.md)),
> **the database-backed multi-subsystem curation design below is deferred.**
> The MVP uses **offline extraction and reviewed, versioned file artifacts**,
> feeding directly into the existing #1887 batch/dry-run/apply model:
>
> ```text
> Approved source file
>     → offline city extraction (one generic OSM script + bbox/config input)
>     → raw candidate JSONL
>     → reviewer CSV/Excel
>     → human include/exclude/merge/rename/alias decisions
>     → versioned approved #1887 batch JSON
>     → #1887 dryRun/apply
> ```
>
> **Why:** the provider investigation found that OSM/Geofabrik viability rests
> on node/way-level candidate discovery (proven, reproducible, city-agnostic)
> plus mandatory human reconciliation of node/relation duplicates — not on a
> generic multi-provider database platform. #1887 PR1 already ships the
> staging tables, batch/version/checksum identity, dry-run classification, and
> alias foundation this MVP needs. Building a second, parallel database-backed
> curation subsystem now would duplicate that foundation before there is
> operational evidence (a working end-to-end OSM→#1887 flow for at least one
> real city) that the richer model in this document is actually needed.
>
> **What is deferred, not discarded** (revisit only once the offline MVP is
> running and a concrete limitation forces the issue):
> - `geo_provider` application registry tables (§2 below)
> - `geo_raw_candidate` (§2, §3 below)
> - `curated_area_candidate` (§3 below)
> - `curated_dataset` (DB-backed version/approval table)
> - the database-backed curation state machine (§6 below)
> - the change-event/versioning subsystem
> - the `GeoProvider` Spring SPI/bean-registry (§2 below)
> - a multi-user curation UI
> - a two-person approval/RBAC system
> - generic automatic multi-provider reconciliation
>
> The canonical PostgreSQL `areas`, aliases, and provenance produced by #1887
> remain the application's source of truth. Intermediate extraction and review
> artifacts (candidate JSONL, reviewer CSV, versioned batch JSON) do not all
> need to be application database tables — file-based, checked-in-or-archived
> artifacts are sufficient for the MVP's scale (a handful of cities at a time,
> reviewed by one curator).
>
> The rest of this document is retained as a **future-scale option**: if the
> offline MVP later needs multi-provider automatic reconciliation, a curation
> UI, or RBAC-gated multi-person review, the data model and provider
> architecture below are the design to return to — they are not wrong, just
> premature for the current stage.

---

## 0. Evidence base (what this review is grounded in)

> **HISTORICAL SNAPSHOT — read this whole section as "true at original-review
> time", not current fact.** The #1887 state described below (unmerged PR1,
> `CandidateInput`-only ingestion) is now stale. **Current, corrected facts:**
> #1887 PR1 is **merged to `main`** at commit `79b1dc70` ("feat(discover):
> city onboarding foundation + read-only dry-run validation (#1887 PR1/3)
> (#1901)", merged 2026-07-15), and the runner
> (`backend/src/main/java/com/example/realestate/discover/AreaOnboardingRunner.java`)
> now consumes a **batch wrapper** (`CandidateBatchFile`: `datasetId`,
> `datasetVersion`, `artifactChecksum`, `provider`, `inputSchemaVersion`,
> `sourceExtractedAt`, plus the `candidates` list) carrying dataset/provider/
> checksum identity — **not merely a bare `List<CandidateInput>`** as stated
> below. #1887 PR2 (`ec5705c4`, transactional apply of reviewed candidates
> into canonical `areas`/`area_alias`) also exists, on branch
> `issue-1887-city-onboarding-pr2`, not yet merged to `main`. See the
> SUPERSEDING DECISION above for what this means for #1900's scope.

### `[jcm]` retrieval note (historical — as of original review)
- jCodemunch main index (`local/udupi-property-explorer-96b7b666`, indexed 2026-07-14) contains **no Java/backend symbols** — the 2000-file index cap dropped the entire `backend/` tree (languages indexed: bash/css/js/json/python/sql/toml/tsx/ts/xml/yaml — no `java`). It also predates #1887.
- #1887 PR1 is **not on `main`**. It lives on unmerged remote branch `issue-1887-city-onboarding-pr1`, commit `53fa37ed` ("feat(discover): city onboarding foundation + read-only dry-run validation (#1887 PR1/3)"). It is therefore un-indexable. *(Superseded — see the correction box immediately above: PR1 has since merged as `79b1dc70`.)*
- **Direct-Read fallback via `git show <sha>:<path>` was required and used** for all #1887 and schema evidence below. This is the CLAUDE.md-sanctioned fallback ("If jCodemunch is unavailable or stale, bounded Read fallback is allowed").

### What #1887 PR1 actually shipped (historical snapshot, verified from pre-merge commit `53fa37ed` — now merged to `main` as `79b1dc70`; the runner has since gained the `CandidateBatchFile` wrapper described in the correction box above)
- **V115** `area_onboarding_foundation.sql` — additive-only STAGING tables: `area_onboarding_batch`, `area_onboarding_candidate` (with `matched_area_key` as a **plain-text soft reference, deliberately NOT an FK** — design decision D2), plus an **empty** `area_alias` table (population deferred to PR2 — D5). No `ALTER` of `areas`.
- **`GeometryTrust`** enum — `VERIFIED | PROVISIONAL | MISSING`, classified **only** from `geometry_source` + centre/bbox presence; never from listings. `geometry_source ∈ {OSM, MANUAL}` + full bbox ⇒ `VERIFIED`; centre present but bbox absent or `geometry_source IS NULL` ⇒ `PROVISIONAL`; no centre ⇒ `MISSING`.
- **`AreaKeyFormat`** — validator/normaliser for the 4-segment pipe key `"IN|KA|<District>|<AreaName>"`. **Explicitly NOT a key generator** ("it never invents a new area_key"). Ports the V79/V80 district CASE rules (`bangalore urban → bengaluru`, `dakshina kannada → mangalore`).
- **`CandidateOutcome`** — `READY_TO_CREATE | READY_TO_UPDATE | UNCHANGED` (clean) + `POSSIBLE_DUPLICATE | INVALID_GEOMETRY | OUTSIDE_CITY | MISSING_GEOMETRY | NEEDS_HUMAN_REVIEW`.
- **`ConflictType`** — `CANONICAL_KEY_CONFLICT | NORMALISED_NAME_CONFLICT | ALIAS_CONFLICT | DUPLICATE_EXTERNAL_SOURCE_ID | SIMILAR_OR_OVERLAPPING | OUTSIDE_CITY_BOUNDS | SAME_NAME_DIFFERENT_CITY` (last is informational, non-blocking).
- **`AreaOnboardingService.dryRun(int cityId, String sourceLabel, List<CandidateInput> candidates) → AreaOnboardingReport`** — pure classification, writes staging rows only, never canonical `areas`/`area_alias`/`city_regions`/`city_region_memberships`/`regional_area_overrides` (proven by `AreaOnboardingDryRunSafetyIT`).
- **`CandidateInput`** record (the handoff contract): `areaKey, name, geoCenterLat, geoCenterLon, minLat, minLon, maxLat, maxLon, geometrySource, externalSourceId` — note **a single `externalSourceId`**, **a single `geometrySource`**, **no aliases, no licence, no multi-provider provenance**.
- **`AreaOnboardingRunner`** — `ApplicationRunner`, gated by `@ConditionalOnProperty(app.area-onboarding.enabled=true)` (default false), **no HTTP endpoint**, dry-run only. *(As of the original review:)* loads candidates by Jackson-deserialising a JSON resource into `List<CandidateInput>`. **This is now stale** — see the correction box above: the merged runner deserialises a `CandidateBatchFile` wrapper (dataset/provider/checksum identity + the candidate list), not a bare `List<CandidateInput>`.

### Existing canonical schema (pre-#1887, on `main`)
- `cities(id, slug, name, geo_center_lat/lon, min/max lat/lon, default_zoom, is_active)` — V71.
- `areas(area_key TEXT PK = "IN|KA|District|Area", city_id FK, name, district, geo_center_lat/lon, min/max lat/lon)` — V71; + V113 added nullable `osm_element_type/id/version/osm_extract_date/geometry_source`.
- `city_region_policy / city_regions / city_region_memberships` — V113 (#1882); job-populated by `CityRegionOnboardingService.apply()`.
- V79/V80 established the school area-key + district-normalisation pattern that `AreaKeyFormat` mirrors.

---

## 1. Overall architecture

**Is #1900 as scoped sufficiently refined?** The *product intent* is excellent and the safety posture is right. But as an **implementation unit it is under-refined and too large** — it bundles a data model, a provider SPI, a reconciliation engine, a versioning system, a curation workflow, and an Excel adapter into one issue with a flat AC list. Three hard boundary contracts with #1887 are undefined, and one functional requirement ("detect duplicates/overlaps") silently **duplicates logic #1887 PR1 already shipped**.

**Undocumented assumptions that must be surfaced:**
1. **Who mints the `area_key`?** #1900 produces candidates for zero-listing cities where *no `area_key` exists yet*, but #1887's `AreaKeyFormat` is explicitly **not a generator**. Therefore **#1900 must own canonical-key minting** and emit keys already in `"IN|CC|District|Area"` shape. This is currently owned by neither issue. **(Top blocking gap.)**
2. **Provider identity is 1:N, but the handoff is 1:1.** The issue requires "provider and provider record ID retained for every candidate," and real areas are corroborated by *several* providers (an OSM relation + a revenue village + a PIN code). But #1887's `CandidateInput.externalSourceId` is a **single string**. The multi-provider model must live in #1900; the handoff must collapse to one *primary* external id.
3. **"Detect duplicates and overlapping geometries" overlaps #1887's `dryRun`.** #1887 already computes `SIMILAR_OR_OVERLAPPING`, `NORMALISED_NAME_CONFLICT`, `ALIAS_CONFLICT`, etc. **against canonical areas.** #1900 must NOT build a second conflict engine — it does *intra-batch / cross-provider* reconciliation (there is no canonical row yet), then **feeds the reconciled set through #1887's `dryRun` as the final pre-approval gate** and treats the returned `AreaOnboardingReport` as its "unresolved-conflict report."
4. **Excel's role is unstated** and the issue explicitly asks for a ruling (see §4).
5. **"Approved dataset" persistence layer is unspecified** — file artifact vs DB rows. The stated principle "PostgreSQL is the source of truth" forces DB-backed (see §4, §5).

**Tech debt eliminable now by getting the abstraction right upfront:**
- Define the **canonical-identity + provider-provenance data model once** (§3) so #1887 PR2/PR3 (alias + source-identifier resolution) consume a stable shape rather than being retrofitted.
- Establish **key-minting in one place** so listing ingestion (#1887 PR3) and curation share it.
- Reuse **`GeometryTrust` verbatim** rather than inventing a parallel confidence enum.

**Stage:** MVP → early-growth. Current reality: 4 cities, ~33 areas. Target: "hundreds of cities." Hundreds of cities × ~100–500 areas ≈ low tens of thousands of rows — **trivially Postgres**. No queue, no search infra, no separate service, no vector DB is justified by this scale. The "pipeline" is a set of Spring Boot services + Flyway staging tables + a CSV/JSON adapter + (later) an admin UI. Boring and correct.

---

## 2. Provider architecture

**Recommended: Spring-native bean registry keyed by `provider_key`, gated by data-driven approval.** Do **not** reach for Java `ServiceLoader`/SPI, a plugin classloader, or a config-DSL — those solve a dynamic-third-party-plugin problem this project does not have (all providers are first-party code in this repo).

**Interface shape (prose, not code):**
- `GeoProvider`:
  - `String providerKey()` — stable id (`"osm"`, `"ka-revenue-village"`, `"india-post-pincode"`, `"manual-csv"`).
  - `GeoProviderMetadata metadata()` — kind, licence code/URL, attribution text, `requiresAttribution`.
  - `boolean supportsCity(CityRef city)`.
  - `GeoRawExtract extract(ExtractRequest request)` — returns **raw, verbatim** records + per-record provider id + a licence snapshot. **No writes to canonical geography. No public request-path call to external providers** (#1887 rule) — extraction is an **offline/admin batch action** (upload a provider file, or read a vendored dataset), never a synchronous request path.
- `GeoProviderRegistry` — constructor-injects `List<GeoProvider>`, indexes into `Map<String, GeoProvider>` by `providerKey`, and **filters by `geo_provider.is_approved = true`** at lookup time. Approval/licensing is *data*, not code.

**Registration mechanism:** each provider is a `@Component` implementing `GeoProvider`. Adding a provider = new bean + one `geo_provider` row (metadata/licence) + optional config. **No pipeline-code change** — this is exactly what the AC "a third city can be curated without changing the pipeline code, except for provider/configuration data" requires.

**Provenance + licensing preservation strategy:**
- Every raw record is stored verbatim in `geo_raw_candidate` with its `provider_record_id` and full `raw_payload` (JSONB). Raw extracts are **never edited** and **never mixed** with curated output (separate tables — satisfies "keep raw provider extracts separate").
- Each extract run snapshots the licence in force at extract time (`geo_provider_extract.licence_snapshot`) so a later licence change cannot silently rewrite history.
- **Publish gate:** a dataset version cannot move to `APPROVED` unless every included candidate has ≥1 provenance row whose provider is `is_approved` and whose attribution obligations are recorded — this is the concrete enforcement of "validate that every approved row has sufficient provenance" and "do not publish provider data without confirming licence and attribution."

---

## 3. Canonical identity model

**Decision: surrogate PK + stable external natural key + 1:N provider-id mapping.**

- **Curation-side identity:** `curated_area_candidate.id` (surrogate `BIGSERIAL`). Curation churns; a surrogate is stable across renames/merges.
- **Canonical natural key:** `proposed_area_key` = the minted `"IN|CC|District|Area"` string that becomes `areas.area_key` on #1887 apply. This is the **stable external key** the rest of the platform already uses (listings, regions, schools all key on `area_key`). #1900 mints it; #1887's `AreaKeyFormat.normalise` validates it.
- **Key minting rule (owned by #1900):** `IN | <ISO-state-or-country-subdivision> | <normalised District> | <canonical Area name>`. District segment normalised through the **same** V79/V80/`AreaKeyFormat` CASE table (reuse, don't fork). Minting is deterministic from `(city → country/state/district) + canonical name`; collisions within a city are a **blocking conflict for human resolution**, never auto-suffixed.
- **Provider IDs are 1:N and live in their own table — never columns on the candidate.** `curated_candidate_provenance(candidate_id, provider_id, provider_record_id, is_primary, …)`. Exactly one row per candidate is `is_primary = true`; that row's `provider_record_id` is what collapses into #1887's single `externalSourceId` at handoff.
- **Alias model:** `curated_candidate_alias(candidate_id, alias, alias_normalised, lang, source_provider_id)` — 1:N, supports alternate-language names and provider-supplied synonyms. Feeds #1887's `area_alias` (populated in #1887 PR2).
- **Provider ID churn/reissue over time:** because provider ids are rows (not identity), a reissued OSM relation id is a **new provenance row** appended to the *same* candidate; the old row is retained with an `is_active=false`/`superseded_at` marker. Canonical `area_key` identity is unaffected. This is the mechanism that makes "provider renames/reissues" non-destructive (§8).

---

## 4. Dataset model — **Excel is an import/export adapter, NOT source of truth**

**Ruling (the issue asks for one explicitly): PostgreSQL is source of truth; Excel/CSV is a round-trip *adapter* only; JSON is the machine handoff to #1887.**

Reasoning:
- The project invariant is literally "PostgreSQL is the source of truth." Making a spreadsheet authoritative violates it.
- The AC demands **versioned, immutable, reproducible** approved output. Spreadsheets are none of those — two reviewers editing two `.xlsx` copies is precisely the "silently overwrite a prior approved version" corruption the Safety section forbids.
- #1887's runner **already reads JSON** (`List<CandidateInput>`). JSON is therefore the zero-friction handoff; Excel would need conversion anyway.

**Concrete model:**
- Curation happens against **DB-backed staging tables** (§ suggested DB model).
- **Excel/CSV export**: flatten `curated_area_candidate` (+ primary provenance + aliases) to a reviewer-friendly sheet, one row per candidate, with the issue's listed columns. Curators edit *decisions* (include/exclude/merge/alias/rename/reason/reviewer) in the sheet.
- **Excel/CSV import**: re-ingest **only the decision columns** back onto existing `curated_area_candidate` rows by `candidate_id`; never let the sheet create/mutate geometry or provenance silently (those come from providers). An import is itself an auditable event.
- **Approved dataset artifact** = an **immutable DB snapshot** (`curated_dataset` row, status `APPROVED`, checksummed) **plus** a generated, versioned JSON export (`areas-<citySlug>-v<N>.json`) that is exactly `List<CandidateInput>` — the thing #1887 consumes "without ad-hoc transformation."

---

## 5. Versioning strategy

**Model: immutable dataset versions + area-level change events.**

- `curated_dataset(city_id, version, status, based_on_version, dataset_checksum, approved_by/at, published_at)` — `UNIQUE(city_id, version)`. Once `status ∈ {APPROVED, PUBLISHED}` the row and its member candidates are **immutable**; a correction opens a **new** version (`based_on_version = N`, `version = N+1`). This is expand/contract at the dataset grain — never an in-place overwrite (satisfies "do not silently overwrite a prior approved dataset version").
- `curated_dataset_change(dataset_id, candidate_id, change_type ∈ {ADD, UPDATE, EXCLUDE, MERGE, ALIAS, RENAME, GEOMETRY_CHANGE}, before JSONB, after JSONB, changed_by, changed_at)` — the **diff/audit log**. Diffing two versions = querying change events between them.
- **Rollback** = re-publish an earlier `APPROVED` version's JSON export to #1887 (idempotent by construction, since #1887 apply is idempotent). No destructive undo.
- **Reproducibility** = `dataset_checksum` over the ordered candidate set + the JSON export being a pure function of the snapshot. Re-generating v3 always yields byte-identical JSON.

This deliberately does **not** adopt event-sourcing/CQRS — a versioned-snapshot + change-log table in Postgres is the fit-for-stage answer; full event sourcing here would be architecture astronautics for tens of thousands of rows.

---

## 6. Human curation workflow (state machine)

**Candidate lifecycle states** (on `curated_area_candidate.state`):

```
EXTRACTED        (raw provider rows land in geo_raw_candidate — immutable)
   │  normalise + mint proposed_area_key
   ▼
CANDIDATE        (one curated_area_candidate per reconciled real-world area)
   │  cross-provider reconcile (dedup/merge/overlap)
   ▼
RECONCILED       (no unresolved intra-batch/cross-provider conflict)
   │  curator decision
   ▼
REVIEWED         (decision ∈ INCLUDE | EXCLUDE | MERGE | ALIAS)
   │  run through #1887 AreaOnboardingService.dryRun
   ▼
VALIDATED        (dryRun applyAllowed == true for this candidate)
   │  approver seals the dataset version
   ▼
APPROVED         (member of a curated_dataset APPROVED version — immutable)
   │  export JSON → #1887 apply consumes it
   ▼
PUBLISHED        (materialised into canonical areas by #1887)
   │  next dataset version supersedes
   ▼
SUPERSEDED
```

**Transitions & who can do what:**
| Transition | Actor | Reversible? |
|---|---|---|
| EXTRACTED → CANDIDATE | Importer (or system) | yes (re-extract) |
| CANDIDATE → RECONCILED | Curator (merge/dedup decisions) | yes |
| RECONCILED → REVIEWED | Curator (include/exclude/alias) | yes |
| REVIEWED → VALIDATED | System (#1887 dryRun) | yes (auto on re-run) |
| VALIDATED → APPROVED | **Approver (must differ from Curator)** | **no** — new version only |
| APPROVED → PUBLISHED | System (#1887 apply, gated by ops) | no — rollback = re-publish prior version |

Everything up to `APPROVED` is a mutable draft. `APPROVED`/`PUBLISHED` are immutable; corrections flow through a **new version** (§5). Two-person rule (Curator ≠ Approver) is the control that satisfies "do not create canonical areas directly from provider output without review."

---

## 7. Geometry strategy — extend `GeometryTrust`, don't replace it

- **Storage: centroid required, bbox optional, polygon future.** Keep the current `areas` shape (centre + bbox) as the canonical target; #1900 candidates carry centre (mandatory for activation, per #1887 AC) + optional bbox. A real polygon column is a **later, additive** slice (V113 already reserved `osm_element_type/id/version` for exactly this) — do not block #1900 on polygons.
- **Confidence scoring = reuse `GeometryTrust` (VERIFIED/PROVISIONAL/MISSING) verbatim.** It already encodes precisely the semantic the issue wants (trusted-bounds vs centroid-only vs missing). #1900 computes each candidate's `geometry_trust` with the **same** classifier inputs (`geometry_source` + centre/bbox), so the value the curator sees equals the value #1887 will compute — no drift.
- **Missing geometry:** retained as `MISSING`; **never** inferred from listings (there are no listings yet, and the rule stands permanently). A `MISSING` candidate is includable but flagged; activation requires a valid centre.
- **Conflicting geometry from multiple providers:** store **each provider's geometry on its `geo_raw_candidate` row**; the `curated_area_candidate` holds the **chosen** geometry plus a pointer (`curated_candidate_provenance.geometry_contribution`) to which provider won. Choice is by a deterministic precedence (`MANUAL` > `OSM` > municipal > postal centroid) **surfaced for human confirmation** — never silently averaged or merged. A large disagreement between provider centroids raises a review flag.

---

## 8. Safety — mechanism per corruption scenario

| Scenario | Prevent / Detect / Recover mechanism |
|---|---|
| **Provider renames an area** | Provenance is keyed on `provider_record_id`, not name. A rename lands as an updated `raw_name` on the same provider-id row; the curated candidate's `canonical_name` only changes via a `RENAME` change-event with reviewer + reason. Old name auto-retained as an alias. |
| **Provider removes an area** | Detected as a provenance row present in version N but absent in the new extract → surfaced as a candidate `EXCLUDE` proposal for **human** decision. Canonical `areas` are **never** deleted by re-extract (#1887 apply preserves inactive/merged records); worst case the area becomes inactive, never dropped. |
| **Duplicate provider IDs** | `UNIQUE(candidate_id, provider_id, provider_record_id)` on provenance; intra-batch duplicate ids surface via #1887's `DUPLICATE_EXTERNAL_SOURCE_ID`. Cross-provider "same id different meaning" can't collide because ids are namespaced by `provider_id`. |
| **Conflicting geometries** | Per-provider geometry retained on raw rows; chosen geometry is explicit + human-confirmed (§7). #1887's `SIMILAR_OR_OVERLAPPING` catches overlapping bboxes at the dryRun gate. No silent averaging. |
| **Renamed neighbourhoods** | Same as provider-rename: old→new captured as `RENAME` change-event + alias; `area_key` identity (and therefore listing/region links) is preserved. |
| **Fuzzy name similarity** | Merges require an explicit `MERGE` decision + `merged_into_candidate_id`; the pipeline **never merges on name similarity alone** (issue safety rule) — similarity only *flags* for review (`NORMALISED_NAME_CONFLICT`). |
| **Licensing change** | `geo_provider.licence_code` change is a data event; the `APPROVED` gate re-checks licence/attribution obligations, and each extract carries a `licence_snapshot` so already-approved versions remain reproducible under the terms they were approved with. A newly non-permissive provider blocks new approvals without rewriting history. |
| **Listing text pollution** | Structurally impossible: listings are never a `GeoProvider`; `curated_area_candidate` rows only originate from `geo_raw_candidate` (approved providers). Listing locality text can, later, only append *gap-detection evidence*, never a candidate. |

---

## 9. Extensibility

- **More providers:** new `@Component GeoProvider` + `geo_provider` row. No engine change (§2).
- **Web curation UI (future):** the DB-backed staging model + explicit state machine (§6) means a UI is just a second front-end over the same services — the Excel adapter and a UI are peers, neither is privileged. Building Excel-first now does not foreclose the UI.
- **Automated validation:** already delegated to #1887's `dryRun` — additional validators are new `ConflictType`s, not new pipelines.
- **AI-assisted suggestions:** allowed **only** as *suggestions on candidates* (proposed aliases, likely-duplicate hints) written to advisory columns/flags — **never** as an authoritative source and **never** on a sync path (project invariant: AI is persist→enqueue→async, and #1900's own rule bars LLM-generated locality lists as authoritative). An AI suggestion is curator input, gated by the same human `REVIEWED` transition.
- **International cities:** the 4-segment key generalises (`IN|CC|District|Area` → `<country>|<subdivision>|<district>|<area>`); the **only** India-specific coupling is the district-normalisation CASE table (V79/V80/`AreaKeyFormat`), which is data-shaped and extendable per country without touching the pipeline. Flag: `AreaKeyFormat` currently hardcodes India CASE rules in Java — for true international scale that table should become data-driven, but that is a **later** concern, not a #1900 blocker.

---

## 10. Relationship with #1887 / #1898 / #1899 — clean boundaries

| Issue | Owns | Must NOT touch |
|---|---|---|
| **#1900 (this)** | Sourcing from approved providers; raw-extract storage; **canonical-key minting**; multi-provider provenance (1:N); cross-provider reconciliation; alias/alt-language capture; **dataset versioning + immutable approved snapshot**; licensing/attribution capture + gate; Excel/CSV round-trip adapter; JSON export to #1887. Produces the reviewed candidate set. | Canonical `areas`/`area_alias`/`city_regions` writes (that's #1887). Building a **second** conflict engine (reuse #1887 `dryRun`). Region-model design. OpenSearch. Listing ingestion. |
| **#1887** | Validating a reviewed dataset (`dryRun`) and **materialising** it into canonical `areas` (PR2 apply) + listing/alias/source-id resolution (PR3). Owns `GeometryTrust`, `AreaKeyFormat`, `CandidateOutcome`, `ConflictType`, staging tables. | Producing/sourcing datasets (that's #1900). Region regeneration inside the import txn. |
| **#1898** | Pruning stale `city_regions` rows **when a region *model* changes** (e.g. CARDINAL_8→CARDINAL_4). Blocked/unreachable until a policy-admin path exists. | Anything about area *sourcing* — orthogonal to #1900; do not couple them. |
| **#1899** | **Operational** one-time step: enable `app.city-region-onboarding.enabled` + run the runner for Bangalore/Udupi in prod so regions surface. Zero code. | Any code change; any #1900 data-model work. |

**Boundary seam that must be written into both #1900 and #1887:** the handoff artifact is **`List<CandidateInput>` JSON** (`areaKey, name, geoCenterLat/Lon, min/max Lat/Lon, geometrySource, externalSourceId`). #1900 guarantees: every `areaKey` is a valid minted 4-segment key; `externalSourceId` = the primary provenance row; `geometrySource ∈ {OSM, MANUAL, <approved provider tag>}` or null. #1887 consumes it unchanged. Aliases + full multi-provider provenance travel as a **sidecar** the #1887 PR2/PR3 alias path will read — this requires a small, explicit widening of #1887's plan (see §Issue improvements).

---

# Deliverables

## Architecture review — verdict

**#1900 is directionally correct but NOT implementable as written.** It is a multi-subsystem programme wearing a single-issue costume, and it silently overlaps #1887 PR1's shipped conflict engine. Approve the *intent*; **do not** start implementation until (a) it is split into the 4 sub-issues below, and (b) three boundary contracts with #1887 are pinned:

1. **Key minting** lives in #1900 and emits `AreaKeyFormat`-valid keys.
2. **Multi-provider provenance is 1:N in #1900**, collapsing to one primary `externalSourceId` at the JSON handoff; #1887 PR2 widens to read the alias/provenance sidecar.
3. **#1900 reuses #1887's `dryRun` as its final validation/conflict gate** rather than building a parallel detector; #1900's own detection is scoped to *cross-provider reconciliation* only.

With those pinned, the design is fit-for-stage, boring, Postgres-only, and scales to hundreds of cities without redesign.

## Risks (ranked)

1. **(High) Two divergent conflict engines.** If #1900 implements its own duplicate/overlap detection independent of #1887's `ConflictType`/`dryRun`, they *will* drift and disagree at the approval gate. **Mitigation:** mandate reuse of `AreaOnboardingService.dryRun` as the pre-approval gate; #1900 detection limited to intra-batch cross-provider merge.
2. **(High) Key-minting ownership vacuum.** Neither issue currently mints keys; #1887 explicitly refuses to. If unassigned, implementers will improvise inconsistent keys, corrupting the primary natural key used by listings/regions/schools. **Mitigation:** §3 minting rule assigned to #1900a, reusing V79/V80 normalisation.
3. **(Med) Handoff-contract impedance mismatch.** #1887's `CandidateInput` is 1:1 provider + no aliases/licence; #1900's model is 1:N + aliases + licence. Without an explicit sidecar contract, alias/provenance data is lost at the boundary. **Mitigation:** define JSON handoff + sidecar; widen #1887 PR2 plan.
4. **(Med) Excel-as-truth drift.** If Excel is treated as authoritative, versioning/immutability ACs are unmet and concurrent edits corrupt approved data. **Mitigation:** §4 ruling — Excel is adapter-only, DB is truth.
5. **(Med) `area_alias` UNIQUE(alias_normalised) is global, not per-city.** V115's `area_alias` uniques `alias_normalised` **globally**; legitimate same-name localities in different cities (an explicitly-supported case) would collide when #1887 PR2 populates aliases. **Mitigation:** flag to #1887 PR2 — likely needs `UNIQUE(city_id, alias_normalised)`; #1900 must model aliases per-city to feed it.
6. **(Low) India-hardcoded district normalisation** in `AreaKeyFormat` limits international scale. **Mitigation:** note as post-#1900 follow-up; not a launch blocker.
7. **(Low) Licence-snapshot vs live-licence reconciliation** could get complex. **Mitigation:** snapshot at extract, re-check only at approval; keep it simple.

## Suggested issue improvements (concrete edits to #1900)

- **Add an explicit AC:** "#1900 mints canonical `area_key`s in the `AreaKeyFormat` 4-segment shape and reuses the V79/V80 district-normalisation table."
- **Add an explicit AC:** "Duplicate/overlap detection against existing canonical areas is delegated to #1887 `AreaOnboardingService.dryRun`; #1900 owns only cross-provider intra-batch reconciliation. No second conflict engine."
- **Replace** "human-reviewable spreadsheet … source of truth ambiguity" with the §4 ruling: **DB is source of truth; Excel/CSV is a round-trip adapter; JSON is the #1887 handoff.**
- **Add:** "Provider record IDs are stored 1:N in a provenance table, never as columns on the area; the handoff collapses to a single primary `externalSourceId`."
- **Add:** "Approved dataset versions are immutable DB snapshots; corrections open a new version (expand/contract). No in-place overwrite."
- **Add a cross-issue note to #1887 PR2:** widen the apply path to consume the alias/provenance sidecar, and reconsider `area_alias` uniqueness to `(city_id, alias_normalised)`.
- **Split the issue** (see §Issue splits).

## Refined implementation plan (phased, PR-sized — PLAN only)

| PR | Scope | Depends on | Notes |
|---|---|---|---|
| **1900a** | Canonical identity + provider-provenance **data model**: `geo_provider`, `geo_provider_extract`, `geo_raw_candidate`, `curated_area_candidate`, `curated_candidate_provenance`, `curated_candidate_alias`, `curated_dataset`, `curated_dataset_change` (additive Flyway, staging namespace, no canonical `ALTER`). + **key-minting** service reusing V79/V80 normalisation. | #1887 PR1 (`GeometryTrust`, `AreaKeyFormat`) | Foundation; unblocks everything. Follows V115 additive-only convention. |
| **1900b** | `GeoProvider` SPI + `GeoProviderRegistry` + **one real provider** (manual-CSV/vendored-OSM) + raw-extract storage + normalisation into `CANDIDATE`. | 1900a | No public request-path to external providers. |
| **1900c** | Cross-provider **reconciliation** (dedup/merge/overlap) + curation **decision model + state machine** + **wire the reviewed set through #1887 `dryRun`** for the summary/unresolved-conflict report. | 1900b, #1887 PR1 | Explicitly *reuses* #1887; no parallel engine. |
| **1900d** | **Dataset versioning** (immutable approved snapshot + change-events) + **JSON export to #1887** + **Excel/CSV round-trip adapter** + licence/attribution approval gate. Bangalore + Udupi as contrasting trial cities. | 1900c | Closes the loop to #1887's runner (which already reads JSON). |
| **1900e** (deferred) | Web curation UI over the same services. | 1900d | Out of first delivery; issue already says Excel-first acceptable. |

## Suggested database model

All tables in the curation/staging namespace; **none** are canonical; additive Flyway only.

| Table | Key columns | Relationships / notes |
|---|---|---|
| `geo_provider` | `id PK`, `provider_key UNIQUE`, `display_name`, `provider_kind`, `licence_code`, `licence_url`, `attribution_text`, `requires_attribution`, `is_approved`, `created_at` | Registry; approval is data. |
| `geo_provider_extract` | `id PK`, `provider_id → geo_provider`, `city_id → cities`, `source_label`, `extract_date`, `licence_snapshot`, `raw_record_count`, `checksum`, `created_at` | One row per import run. |
| `geo_raw_candidate` | `id PK`, `extract_id → geo_provider_extract`, `provider_id`, `provider_record_id`, `raw_name`, `raw_admin_parent`, `raw_centre_lat/lon`, `raw_min/max_lat/lon`, `raw_geometry_ref`, `raw_payload JSONB`, `created_at` | Verbatim, immutable, never mixed with curated output. |
| `curated_area_candidate` | `id PK`, `dataset_id → curated_dataset`, `city_id → cities`, `proposed_area_key`, `normalised_area_key`, `canonical_name`, `admin_parent`, `centre_lat/lon`, `min/max_lat/lon`, `geometry_source`, `geometry_trust`, `decision`, `decision_reason`, `merged_into_candidate_id (self-FK)`, `state`, `confidence`, `reviewer`, `reviewed_at`, `notes`, `created_at`, `updated_at` | One per reconciled real-world area. `geometry_trust` reuses #1887 `GeometryTrust`. |
| `curated_candidate_provenance` | `id PK`, `candidate_id → curated_area_candidate`, `provider_id`, `provider_record_id`, `raw_candidate_id → geo_raw_candidate`, `is_primary`, `geometry_contribution`, `superseded_at`, `created_at`; `UNIQUE(candidate_id, provider_id, provider_record_id)` | **The 1:N provider-id map.** Exactly one `is_primary` per candidate. |
| `curated_candidate_alias` | `id PK`, `candidate_id`, `alias`, `alias_normalised`, `lang`, `source_provider_id`, `created_at`; `UNIQUE(candidate_id, alias_normalised)` | Feeds #1887 `area_alias`; per-candidate uniqueness (not global). |
| `curated_dataset` | `id PK`, `city_id → cities`, `version`, `status`, `based_on_version`, `dataset_checksum`, `approved_by`, `approved_at`, `published_at`, `notes`, `created_at`; `UNIQUE(city_id, version)` | APPROVED/PUBLISHED immutable. |
| `curated_dataset_change` | `id PK`, `dataset_id`, `candidate_id`, `change_type`, `before JSONB`, `after JSONB`, `changed_by`, `changed_at` | Diff/audit log. |

## Suggested provider abstraction (interface shape, prose)

- **`GeoProvider`** — `providerKey()`, `metadata() → GeoProviderMetadata{kind, licenceCode, licenceUrl, attributionText, requiresAttribution}`, `supportsCity(CityRef)`, `extract(ExtractRequest) → GeoRawExtract{ List<RawRecord>, licenceSnapshot }`. `RawRecord` = `{ providerRecordId, name, adminParent, centreLat/Lon, min/max Lat/Lon, geometryRef, rawPayload }`. **No canonical writes; no external sync request-path.**
- **`GeoProviderRegistry`** — injects `List<GeoProvider>`, maps by `providerKey`, filters `is_approved`. Lookup `require(providerKey)` throws if unknown/unapproved.
- **Adding a provider** = new `@Component` + `geo_provider` row + config. No engine edit.

## Suggested dataset format (schema)

- **Canonical machine handoff (to #1887):** JSON array of `CandidateInput` — `{ areaKey, name, geoCenterLat, geoCenterLon, minLat, minLon, maxLat, maxLon, geometrySource, externalSourceId }` — **byte-reproducible** from an APPROVED snapshot. This matches what `AreaOnboardingRunner` already deserialises.
- **Sidecar (to #1887 PR2/PR3):** parallel JSON keyed by `areaKey` carrying `aliases[]` (`alias`, `lang`, `sourceProvider`) + `provenance[]` (`providerKey`, `providerRecordId`, `isPrimary`) + `licence[]`.
- **Human round-trip (Excel/CSV):** one row per candidate with the issue's listed columns (city slug/id, provider name + record id [primary], source name, proposed canonical name + key, aliases, admin parent, centre lat/lon, bbox ref, geometry trust/status, decision, reason, reviewer, review date, extraction date, confidence, notes, dataset version). **Decision columns are the only re-importable fields.**

## Suggested workflow (curation state machine)

See §6. States: `EXTRACTED → CANDIDATE → RECONCILED → REVIEWED → VALIDATED → APPROVED → PUBLISHED → SUPERSEDED`. Mutable through `VALIDATED`; immutable from `APPROVED`. Two-person rule: `Approver ≠ Curator`. Corrections = new dataset version, never in-place.

## Issue splits worth doing before implementation

**Yes — split #1900 before any code.** Recommended:
- **#1900a — canonical-identity + provider-provenance data model + key-minting** (foundation; must land first).
- **#1900b — provider SPI + one real provider + raw-extract ingestion/normalisation.**
- **#1900c — cross-provider reconciliation + curation state machine + #1887 `dryRun` integration** (explicitly reuses #1887).
- **#1900d — dataset versioning + immutable approved snapshot + JSON export + Excel adapter + licence gate.**
- **#1900e — web curation UI (deferred; out of first delivery).**

Plus **one cross-issue edit to #1887 PR2**: consume the alias/provenance sidecar and reconsider `area_alias` uniqueness to `(city_id, alias_normalised)`.
