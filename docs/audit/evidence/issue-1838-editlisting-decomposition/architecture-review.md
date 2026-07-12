# EditListing.tsx — Architecture Review (Issue #1838)

**Scope:** behaviour-preserving architectural decomposition of `src/pages/broker/EditListing.tsx` (2281 lines). Multi-PR stacked programme. This review is the MANDATORY first-phase deliverable required BEFORE any production code change (acceptance-intent item 4). It is explicitly **NOT** an OOM fix — the #1825 OOM was a test-harness issue fixed in PR #1837.

**Method:** read-only investigation via `architect` + `explorer-planner` specialists (Phase 0.7), grounded by direct reads of the target file. All line citations are `src/pages/broker/EditListing.tsx` unless noted.

**Tooling note:** the worktree repo index was not built at review time, so specialists used targeted direct `Read` on the known target/test files (blast-radius `find_references` could not be run via jCodemunch — see Open Items #1). Moved symbols in the recommended first slice are module-local (non-exported), so their blast radius is in-file by construction.

---

## 1. Responsibility inventory

The single default-export component fuses these distinct responsibilities:

| # | Responsibility | Lines |
|---|---|---|
| 1 | Route/role guard (`useAuth`, `canAccessRoute`, authLoading spinner) | 503–515 |
| 2 | Listing load + fetch-state gating (loading / error / not-found) | 517–544 |
| 3 | Edit-lock gating (`LOCKED_STATUSES` read-only; `SUBMITTABLE_STATUSES` → `isSubmittable`) | 547–573, 849 |
| 4 | State hydration (server DTO → ~80 setters, with mapping logic) | 403–500 |
| 5 | Per-property-type field groups (common / residential / commercial / rent / agri) — state + render + payload gating | throughout |
| 6 | Wizard/step orchestration (dynamic `WIZARD_STEPS`, `reviewStep`/`boundaryStep`, `currentStep`, `cameFromReview`, save-then-advance) | 278–289, 745–807 |
| 7 | URL step seeding (read-once `?step=` → clamped `initialStep`; **no write-back**) | 283–287 |
| 8 | Address/map (AddressPicker + confirm/unconfirm mutations + locality→title regen) | 1955–1971, 814–825 |
| 9 | Image upload (ImageUploader + `canSubmitImages` signal) | 1890, 302 |
| 10 | Boundary draw (agri) — BoundaryDrawStep + persist/skip | 1993–2010, 791–807 |
| 11 | POI (PoiManager, gated on `addressConfirmed`) | 2176–2188 |
| 12 | Validation (video-URL regex; unit errors — effectively dead; submit gates) | 68–69, 758–764, 299–300, 875–882 |
| 13 | Save/submit (`handleStep1Save` DTO build + mutate; partial step saves; `handleSubmitForReview`) | 629–847 |
| 14 | Review rendering (summary rows, edit deep-links, readiness checklist) | 2013–2276 |
| 15 | Toast/error handling (success toasts inline; submit error-body parsing) | 833–845 |
| 16 | Presentational primitives (`SingleChipGroup` / `MultiChipGroup` + option consts) | 121–250 |

## 2. State ownership matrix (~80 useState)

**H** = hydrated by the `[listing]` effect (403–500); **C** = child-driven; **L** = local/UI.

| Domain | States | Source |
|---|---|---|
| Common/basics | title, description, priceRupees, propertyType, locality, landArea(+Unit), builtArea(+Unit), bedrooms, videoUrl, reraNumber, listingPurpose | H (title/locality also mutated by locality-confirm) |
| Commercial | carpetArea(+Unit), floorNumber, totalFloors, furnishingStatus, washrooms, parkingCount, roadFrontageFt, commercialUsage, numberOfUnits | H |
| Rent | monthlyRent, securityDepositMonths, lockInMonths | H |
| Agri | waterSource, soilType, roadAccess, cultivationStatus, ownershipType, surveyNumber, landCategory, farmhouseAvailable, fencingDone, boundaryCoords | H (boundaryCoords also C via `handleStep4Continue`) |
| Residential (M38-13A) | ~40 fields incl. bathrooms, balconies, facing, superBuiltArea(+Unit), ~18 tri-state booleans, amenities[], specialLocationViews[], preferredTenants[] | H |
| Wizard | currentStep, cameFromReview | L (currentStep seeded from URL once) |
| Validation/error | landAreaUnitError, builtAreaUnitError (dead — only ever `''`), videoUrlError | L |
| UI/interaction | titleManuallyEdited, confirmedLocality (C), canSubmitImages (C) | L/C |

**Key findings:**
- The overwhelming majority of states are **H** — pure server→form projections that partition cleanly by property-type domain. Each domain's hydrate-slice, render-slice, and payload-slice share the same field set → clean vertical seams.
- The only genuinely cross-cutting / bidirectional states are `title`/`titleManuallyEdited`/`confirmedLocality` (title auto-regen coupling), `boundaryCoords` (H + child), `canSubmitImages` (child).
- **No state is global.** Server truth already lives in the TanStack Query cache → **no Redux/Zustand/XState is justified** (constraint satisfied by evidence).

## 3. Effect graph

There is exactly **ONE** `useEffect` in the component.

| Effect | Deps | External sync | Embedded business logic |
|---|---|---|---|
| Hydrate form from listing (403–500) | `[listing]` | server DTO → ~80 setters (legitimate external→local sync) | Yes — unit fallbacks, `String()` coercions, `boolToTriState`/tri-state literals. This mapping should become pure functions the effect merely applies. |

- **No URL-write effect.** `?step=` is read once into `initialStep`; step navigation is pure local state. A nav-controller extraction MUST NOT introduce URL write-back (would change history behaviour).
- Child components (AddressPicker/Leaflet, ImageUploader, PriceField, AreaField) own their internal effects — already encapsulated, out of scope.
- **Latent behaviour to preserve (not fix):** `initialStep` clamps against `WIZARD_STEPS.length` computed while `propertyType===''` (BASE_STEPS len 4); a deep-link `?step=5` on an agri listing clamps to 4 and is not re-expanded after hydration flips to AGRI_STEPS. Any nav extraction must reproduce this exactly or change it deliberately behind a test.

## 4. Render graph & heavy-child mounting

| Step | Lines | Strategy | In DOM when inactive? |
|---|---|---|---|
| 1 Describe | 925–1879 | display-toggle (`display: none`) | Yes |
| 2 Add Photos | 1881–1945 | display-toggle, inner `{isSubmittable && …}` | Yes (if isSubmittable) |
| 3 Pin Location | 1947–1990 | display-toggle, inner `{isSubmittable && …}` | Yes (if isSubmittable) |
| 4 Draw Boundary (agri) | 1993–2010 | conditional `{currentStep===4 && isAgriListing}` | No |
| Review & Submit | 2013–2276 | conditional `{currentStep===reviewStep}` | No |

**Heavy children:**
- `ImageUploader` (1890) — mounted unconditionally for any editable listing (gated on `isSubmittable`, not `currentStep`); owns in-flight upload state; drives `canSubmitImages`.
- `AddressPicker` → Leaflet `MapContainer` (1955) — mounted unconditionally; the expensive one (map tiles/Leaflet init).
- `BoundaryDrawStep` (1999) and `PoiManager` (2177) — already conditionally mounted.

**Smallest safe change to lazy-mount heavy children (asymmetric):**
- **AddressPicker is the safe target.** Its meaningful state is server-authoritative (confirm/unconfirm write straight to the listing via `updateListing.mutate`; all initial props come from `listing`). Gating on `currentStep===3` unmounts/remounts with no lost local state.
- **ImageUploader is NOT a safe naive target** — it holds in-flight upload state and is the source of `canSubmitImages`; naive unmount risks dropping uploads + a gate-value flash on remount.
- Recommendation: treat "lazy-mount AddressPicker on step 3" as its own isolated slice with map-init and confirm-state characterisation; **do not couple it to ImageUploader**; defer it behind the structural extraction.

## 5. Validation ownership

| Validation | Location | Notes |
|---|---|---|
| Video URL | `VIDEO_URL_REGEX` (68–69), `handleVideoUrlChange` (758–764) → `videoUrlError` | Pure regex + state-setting wrapper; cleanly extractable. |
| Area units | `landAreaUnitError` / `builtAreaUnitError` (299–300) | Effectively dead — only ever `''` (636–639); `AreaField` now owns unit selection. Cleanup candidate. |
| Step-1 required fields | `step1Complete` (577–579), `requiredFieldsComplete` (875–877) | Two near-duplicate expressions of the same rule → single source of truth on extraction. |
| Title/locality consistency | `showTitleLocalityWarning` (861–867) | Derived; also a submit blocker via `allConditionsMet`. |
| Submit gate | `allConditionsMet` (878–882) = images + addressConfirmed + requiredFields + !warning | |
| Payload type-gating | `fieldVisible(key)` (625–626) applied per field in DTO (658–742) | **Highest-regression-risk logic** — prevents 400s on mid-edit type switch. |

## 6. Save/submit ownership

- **DTO construction** is inline in `handleStep1Save` (643–743): ~100 lines mapping the flat state sea → update payload, each field gated by `fieldVisible(...)` / type / `isRent` predicates. Pure, deterministic; today only exercisable by rendering the whole component. Prime seam: `buildListingUpdatePayload(state, ctx)`.
- **Save-then-advance / `cameFromReview`**: every step handler shares mutate → onSuccess → if `cameFromReview` return to `reviewStep` else advance (745–807). Review "Edit" buttons set `cameFromReview=true` + jump.
- **Partial saves**: step 2 `{videoUrl, applyVideoUrl:true}`; step 3 lat/lng/addressConfirmed via AddressPicker callbacks; step 4 `{boundary: toGeoJsonString(coords)}`.
- **Submit**: `handleSubmitForReview` (827–847) — mutate, success toast + navigate, ApiError body parsing.

## 7. Module dependency graph & already-extracted helpers

`EditListing.tsx` already delegates to shared modules (do NOT re-extract these):

- `@/lib/listing-utils` — `intOrUndef` / `floatOrUndef`.
- `@/lib/listing-constants` — option lists + `PropertyType`.
- `@/lib/listingFieldConfig` — `isListingFieldVisible` (property-type + purpose scoped) + `ListingFieldKey` (source of the `fieldVisible` gating).
- `@/lib/geoJsonUtils` — `fromGeoJsonString` / `toGeoJsonString`.
- `@/lib/agriFieldLabels` — label maps → derived `KNOWN_*` value lists.
- `@/lib/listing-id` — `formatListingId`.
- Data hooks: `@/hooks/useBrokerListings` (`useGetListing` → `{data, isLoading, isError}`; `useUpdateListing`/`useSubmitListing` → mutations with `mutate`/`isPending`, queryClient invalidation) and `@/hooks/useListingImages`.

**Shared child components** (also used by `ResidentialListingForm`, so prop-shape changes have cross-flow blast radius): ImageUploader, PriceField, AreaField, AddressPicker, PropertyTypeCardSelector, BoundaryDrawStep, StepIndicator, SectionCard, ListingPurposeToggle.

**House-style decomposition precedent (explorer-planner):** `ResidentialNewListingPage.tsx` (~50-line thin page: AppLayout + role guard + navigate pass-through) → `ResidentialListingForm` (component owning state/business logic). The team already separates a thin page layer (routing/auth) from a form-component layer (logic). The eventual `EditListing` structural split (roadmap slice 4) should match this precedent.

## 8. File metrics

- `EditListing.tsx`: **2281 lines**. Rough regions: imports 1–66; module helpers/constants 68–256; component preamble + data hooks 258–267; state sea 269–397; hydration effect 403–500; guards 503–573; derived flags/steps 575–626; payload builder + save/advance 629–756; step handlers 758–807; locality/submit 814–847; submit gates 849–882; render/JSX 884–2280 (~1400 lines).
- Existing test anchors: `EditListing.guard.test.tsx` (role-guard, mounts real component with mocked hooks), `EditListing.residential.test.tsx` (M38-13A type-scoped field visibility / mid-edit type switch omits prior-type fields from PUT), `EditListing.agri.test.tsx` (#1458 agri prefill + null-safety + legacy preservation).

## 9. Extraction roadmap (ordered: safest → largest)

Guardrails held throughout: default export `EditListing` signature + mounted component tree stay identical at every slice boundary (keeps the guard test a passing anchor); no global-state library; effects for external sync only; presentation stateless; no giant single hook (domain-partitioned); no big-bang.

| # | Slice | Extracted | Target shape | ~LOC | Risk | Independently shippable |
|---|---|---|---|---|---|---|
| **1** | **Pure value-mapping helpers** | tri-state + video-url + youtube/instagram helpers | `lib/editListing/valueMappers.ts` | ~40 | **Very low** | Yes — direct unit tests; guard test unchanged. **RECOMMENDED FIRST** |
| 2 | Chip primitives | `SingleChipGroup`/`MultiChipGroup` + option consts | `components/broker/ChipGroup.tsx` | ~130 | Low | RTL tests |
| 3 | Pure payload builder | DTO construction from `handleStep1Save` | `lib/editListing/buildUpdatePayload.ts` (pure) | ~110 | Medium | Exhaustive per-type unit tests on the 400-gating (highest value) |
| 4 | Guard/gate → child split | load+guard+lock gating as wrapper; form becomes child | `EditListing` (loader/guard) → `<EditListingForm listing/>` (matches ResidentialNewListingPage precedent) | ~70 moved | Medium | Guard test → wrapper; form test → ready listing |
| 5 | Domain field hooks (one PR each: agri → commercial → rent → residential → common) | per-domain state + hydration slice + payload slice | `useAgriFields()` … each `{values, setters, hydrate, toPayload}` | 5 × ~60–200 | Medium | Hook unit tests; depends on #1, #3 |
| 6 | Presentational step panels | step render blocks | `DescribeStep`/`PhotosStep`/`LocationStep`/`BoundaryStep`/`ReviewStep` (stateless) | ~950 | Medium | RTL per panel |
| 7 | Navigation controller | currentStep/cameFromReview, WIZARD_STEPS, advance branching, URL seed | `useEditListingNavigation()` | ~90 | Medium | Hook unit tests incl. cameFromReview + agri branch + latent clamp |
| 8 | Lazy-mount AddressPicker | mount Leaflet only on step 3 | conditional render on `currentStep===3` | ~5 | Medium | Characterisation: confirm/unconfirm persists; map re-inits from server |
| — | Cleanup (opportunistic) | remove dead unit-error state; dedupe `step1Complete`↔`requiredFieldsComplete` | inline | ~10 | Low | Assert never-rendered / single predicate |

Mapping to the user's illustrative (non-binding) shape: `useListingLoader`+`useListingPermissions` → slice 4; `ResidentialJourney/…` → split into field-state hooks (slice 5) + stateless panels (slice 6) rather than a monolithic "Journey" object (keeps presentation stateless per constraint); `ValidationController` → slices 1+3; `AttachmentController` → the `canSubmitImages`/ImageUploader concern folded into slice 6's PhotosStep (NOT lazy-unmounted); `useNavigationController` → slice 7. Evidence supports these seams; a per-type "Journey" that re-fuses state+render+payload is explicitly rejected (recreates a smaller monolith).

## 10. Recommended first slice

**Slice 1 — extract pure value-mapping helpers into `src/lib/editListing/valueMappers.ts`.** Rationale, exact scope, and characterisation tests are carried into `team-lead-plan.toml`. In short: lowest blast radius (all moved symbols pure + module-local, non-exported), purely mechanical move, establishes the `lib/editListing/` module + Vitest harness that the higher-value payload-builder (slice 3) and domain hooks (slice 5) depend on, trivially characterised in isolation, and deliberately decoupled from the heavy-child mount change (slice 8). Chosen over the higher-value-but-medium-risk payload builder precisely because the first slice must be the safest possible proof of the decomposition harness.

## Open items (architecture-material)

1. **Blast radius unverified via jCodemunch** (unindexed worktree). The six symbols moved in slice 1 are module-local `function`/`const` declarations (no `export` at lines 68–104), so they cannot be imported elsewhere — but confirm with `find_references` once the index is available before the slice lands.
2. **Dead unit-error state** (`landAreaUnitError`/`builtAreaUnitError`): confirm no test asserts their presence before deleting in the cleanup pass.
3. **Latent `initialStep` clamp** for agri deep-links: decomposition must PRESERVE it; a fix is a separate behavioural change with its own test — a decision to make at slice 7, not an accident.
