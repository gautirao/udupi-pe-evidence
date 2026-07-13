# Slice 5e (common/shared-fields) — final boundary decisions, hook design & closing inventory

**Scope:** roadmap row 5 (architecture-review.md §9), 5th and FINAL domain-field-hook PR (agri→commercial→rent→residential→**common**). Extract the shared/common field state out of `EditListingForm.tsx` into a hook. This slice CLOSES the domain-field-hooks row. Investigated Phase 0.7 (architect + explorer-planner, read-only) + orchestrator direct reads. Citations are the slice-5e worktree.

## Governing rule
The hook owns the coherent terminal bucket: **type-adaptive attribute fields, `fieldVisible`-gated, shared across ≥2 property-type domains, with no single-domain home.** Fields owned by a frozen prior hook, single-domain fields, and base measurement scaffold do NOT belong. The hook owns only `useState` + `hydrate`; all gating stays in the frozen buildUpdatePayload + JSX, unchanged.

## Three final boundary decisions (all surfaced for PLAN_REVIEW; all recommended below, none re-deferred)

### Decision #1 — `useSharedFields` owns 7 fields (recommended)
The PRIMARY set deferred from 5b/5d — **carpetArea, carpetAreaUnit, floorNumber, totalFloors, furnishingStatus** (residential ∩ commercial per CONFIG_MAP) — PLUS **facing, ownershipType** (residential ∩ agri: facing via `AGRI_FACING_FIELD` listingFieldConfig.ts:202; ownershipType via `AGRI_FIELDS` :186 + RESIDENCE_SHARED :270 + PLOT_ONLY :284). All 7 are type-adaptive `fieldVisible`-gated shared attributes with no single-domain home (their would-be homes — agri (5a), commercial (5b), residential (5d) — are all FROZEN and each already declined them as "shared"). Leaving facing/ownershipType inline would fail the closure mandate (2 shared attributes left un-hooked). All 7 are set ONLY in the prefill effect + their JSX onChange (no reset/handler coupling — grep-confirmed). ownershipType renders in two Selects (agri path :792 + residential path :1075) both bound to the same identifier — bare-destructure keeps both byte-identical.

### Decision #2 — bedrooms stays component-owned (recommended)
`fieldVisible('bedrooms')`-gated = RESIDENCE-only (RESIDENCE_SHARED_FIELDS only; not plot/agri/commercial). Single-domain; its rightful home `useResidentialFields` is FROZEN and slice 5d already classified it as an excluded base field (useResidentialFields.ts:19). A "shared" hook must NOT own a single-domain field. This is the sole attribute-type field that remains inline — a documented single-domain exception, not a gap.

### Decision #3 — builtArea/builtAreaUnit/landArea/landAreaUnit stay component-owned (recommended)
Base measurement scaffold rendered in the "Describe" step. **The decisive disqualifier is COMPANION STATE** (stronger/more accurate than "ungated" — they ARE fieldVisible-gated in JSX at :632/:830): they carry `landAreaUnitError`/`builtAreaUnitError` validation state (EditListingForm:139-140, cleared :346-347), the derived `showLandArea`/`showBuiltArea` booleans threaded SEPARATELY into `buildListingUpdatePayload` (:426), and a propertyType-dependent unit default at prefill (:259 agri→'acre' else 'cent'). Extracting them would drag validation state + payload-gating booleans + conditional-default logic into a "shared attributes" hook = a grab-bag. They are base scaffold, not clean type-adaptive attributes → stay inline (the assignment explicitly anticipates base fields remaining inline).

## One hook vs two — ONE hook
Considered an axis-split (`useSharedResidentialCommercialFields` for the 5 + separate handling for facing/ownershipType). REJECTED: all four prior hooks partition by primary DOMAIN, not by "sharing axis"; introducing a second taxonomy for the final slice yields a 2-field hook, doubles files/imports/hydrate calls, and gives zero functional benefit (neither is reused outside EditListingForm). The 7 share one real, nameable invariant (governing rule above). One hook is the simplest correct design.

## Hook name — `useSharedFields`
Accurate to "shared across domains," avoiding the "common = base/universal" misread that would wrongly invite builtArea/landArea/bedrooms. (`useCommonFields` is an acceptable team synonym since the slice is titled common-fields; recommend `useSharedFields` + a header comment enumerating the 7 and explicitly listing what is NOT here.)

## Hook shape — `src/pages/broker/editListing/useSharedFields.ts`
Mirror `useResidentialFields.ts` (interfaces `SharedFieldValues`/`SharedFieldSetters`/`UseSharedFieldsResult`; values/setters/hydrate; stable `useCallback([])`). Per-field default + hydrate VERBATIM from the current lines:
- `carpetArea: number | null` = `useState<number | null>(null)`; hydrate **`setCarpetArea(listing.carpetArea)` — RAW/DIRECT (matches :266), do NOT normalise to `?? null`** (that is how superBuiltArea is written; carpetArea is NOT — this is the headline fidelity trap, the inverse of 5d's superBuiltArea trap).
- `carpetAreaUnit: string` = `useState('sqft')`; hydrate `listing.carpetAreaUnit ?? 'sqft'`.
- `floorNumber: string` = `useState('')`; hydrate `listing.floorNumber != null ? String(listing.floorNumber) : ''`.
- `totalFloors: string` = `useState('')`; hydrate `listing.totalFloors != null ? String(listing.totalFloors) : ''`.
- `furnishingStatus: string` = `useState('')`; hydrate `listing.furnishingStatus ?? ''`.
- `facing: string` = `useState('')`; hydrate `listing.facing ?? ''`.
- `ownershipType: string` = `useState('')`; hydrate `listing.ownershipType ?? ''`.
Imports only `react` + `type { ListingResponse }` — no cycle. (No boolToTriState/arrays here — all string/number|null.)

## Threading (byte-identical)
Delete the 7 useState (EditListingForm:163-167, 203, 211) + the 7 prefill lines (:266-270, 273, 283); add `const shared = useSharedFields();` + bare-destructure all 7 values + setters (identifiers unchanged → JSX at :792/866-867/926/1075/1210/1225-1237/1253-1273 + the buildListingUpdatePayload call-site are byte-identical, untouched); replace the 7 prefill lines with `shared.hydrate(listing);` in the EXISTING single prefill effect; add `shared.hydrate` to the dep array (:275, stable useCallback → no re-fire). Frozen buildUpdatePayload.ts + its test stay green. No coupling (no setX outside prefill+JSX).

## Test strategy
Primary anchors: EditListing.residential.test.tsx + EditListing.commercial.test.tsx (carpetArea/floorNumber/totalFloors/furnishingStatus) + EditListing.agri.test.tsx (facing/ownershipType). Byte-identical → all anchors stay GREEN UNCHANGED. Additive assertions OPTIONAL. **RED-FLAG RULE:** if any existing anchor needs a NON-additive (changed/removed) assertion to pass, STOP — that signals behavioural drift (a fidelity bug, e.g. the carpetArea raw-vs-`?? null` trap), NOT test maintenance; surface it, do not edit the anchor. Hook unit test: SKIP (series-consistent). Mandatory before/after: guard/residential/agri/commercial/rent anchors + buildUpdatePayload.test.ts GREEN vs UNMODIFIED then identically AFTER.

## Closing inventory (roadmap row CLOSED — clean handoff to slice 6)
After this slice, `EditListingForm.tsx` component-owned state is exclusively NON-shared-attribute:
- **Base measurement scaffold:** landArea/landAreaUnit, builtArea/builtAreaUnit, landAreaUnitError/builtAreaUnitError, derived showLandArea/showBuiltArea.
- **Base scalars:** title, description, priceRupees, propertyType (drives fieldVisible), listingPurpose (drives isRent), locality, reraNumber, bedrooms (residence-only base field — the sole documented single-domain exception, frozen home).
- **Wizard/UI state:** currentStep, cameFromReview, titleManuallyEdited, confirmedLocality, canSubmitImages, videoUrl/videoUrlError, boundaryCoords.
- **Image state:** via useListingImages(id).
- **Domain hooks:** agri (5a), commercial (5b), rent (5c), residential (5d) FROZEN + `shared` (5e, new).
CLOSURE CONFIRMED: the only attribute-type field left inline is `bedrooms` (single-domain, frozen home, 5d-classified base). NO shared/cross-domain attribute field remains un-hooked. Slice 6 (step panels) inherits a clean {base measurement | base scalar | wizard/UI | 5 field hooks} split.

## Risks + files
Files: `src/pages/broker/editListing/useSharedFields.ts` (new) + `src/pages/broker/editListing/EditListingForm.tsx` (remove 7 useState + 7 prefill; add hook+destructure+hydrate+dep+import). Anchors: no edits (additive-only if PLAN_REVIEW requests). No import cycle.
| Risk | Catch |
|---|---|
| carpetArea hydrate drift (`?? null` instead of raw) — the headline trap | verbatim copy of :266; commercial anchor carpetArea round-trip; before/after |
| Missed identifier in a two-path render (ownershipType :792/:1075, totalFloors, furnishingStatus) | bare-destructure all 7 pairs; residential+agri+commercial anchors jointly cover both paths |
| shared.hydrate omitted from dep array | exhaustive-deps lint (established pattern) + prefill anchors |
| shared field mistakenly left inline / base field mistakenly pulled in | Decisions #2/#3 exclude bedrooms/builtArea/landArea; agri/commercial anchors green |

## Process note (from 5a-5d)
All specialist edits/test runs MUST occur in `/Users/gouthamrao/Documents/workspaces/lovable/udupi-property-explorer-worktrees/issue-1838-slice5e-common-fields` — verify `git status` there. Run lock `.claude/active-runs/issue-1838.lock`; ports FE 5195 / BE 8095.
