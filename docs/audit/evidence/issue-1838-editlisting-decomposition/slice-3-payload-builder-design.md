# Slice 3 (payload-builder) — extraction design & regression-safety plan

**Scope:** roadmap row 3 (architecture-review.md §5/§6/§9) — extract the inline PUT-payload construction from `EditListing.tsx`'s `handleStep1Save` into a pure `buildListingUpdatePayload(state, ctx)`. **Highest-regression-risk slice so far** (§5: the field gating "prevents 400s on mid-edit type switch"). Investigated Phase 0.7 (architect + explorer-planner, read-only) + orchestrator direct reads. Line citations are the slice-3 worktree (branch `issue-1838-slice3-payload-builder`, off origin/main incl. slices 1+2).

**This is NOT a byte-identical verbatim move** (slices 1-2 were). It closes ~74 local-state values + 4 derived predicates into function arguments. The design below is explicit about exactly what stays byte-identical and what necessarily changes shape.

## Current shape (ground truth)

`handleStep1Save` at `EditListing.tsx:469-596`:
1. `e.preventDefault()` (470)
2. derived locals `bedroomsNum`/`landAreaVal`/`builtAreaVal` (472-474), `carpetAreaVal` (481)
3. `setLandAreaUnitError('')` / `setBuiltAreaUnitError('')` (478-479)
4. `updateListing.mutate(PAYLOAD, { onSuccess })` — PAYLOAD is the object literal at **486-582** (74 fields)
5. `onSuccess` (585-594): toast + `cameFromReview` branch + `setCurrentStep`

ctx predicates in component scope (declared just before the handler): `isCommercialType` (447, render-only — NOT in payload), `isRent` (448 = `listingPurpose === 'rent'`), `showLandArea` (449-454), `showBuiltArea` (455-459), `fieldVisible` (465-466 = `propertyType !== '' && isListingFieldVisible(key, propertyType, listingPurpose)`).

Return DTO: `UpdateListingRequest`, exported at `src/hooks/useBrokerListings.ts:121` (all fields optional). Helpers used: `intOrUndef`/`floatOrUndef` (`@/lib/listing-utils`), `triStateToBool` (`@/lib/editListing/valueMappers`, slice-1), `isListingFieldVisible`/`ListingFieldKey` (`@/lib/listingFieldConfig`).

## Design decision — Option A (state bag + already-derived ctx)

New module `src/lib/editListing/buildUpdatePayload.ts` exporting:

- `buildListingUpdatePayload(state: ListingFormState, ctx: UpdatePayloadCtx): UpdateListingRequest` — **pure**. Destructures `state` + `ctx` at the top so the payload literal (486-582) stays **character-for-character identical** (bare `title`, `fieldVisible`, `isRent`, `bedroomsNum` identifiers). The 4 derived locals (472-474, 481) move inside the function, computed from raw `state` fields (identical text).
- `makeUpdatePayloadCtx(propertyType, listingPurpose): UpdatePayloadCtx` — reproduces predicates 448-466 **verbatim** (isRent/showLandArea/showBuiltArea/fieldVisible). Used by unit tests so they exercise the REAL derivation per type with zero hand-rolled ctx.

```
interface UpdatePayloadCtx { isRent: boolean; showLandArea: boolean; showBuiltArea: boolean; fieldVisible: (key: ListingFieldKey) => boolean; }
interface ListingFormState { /* all 74 raw values, typed EXACTLY as the component useState decls; fields NON-OPTIONAL */ }
```

**Why Option A over "derive inside the builder" (Option B):** in both options the ~74 field expressions are byte-identical. Option B would DUPLICATE `showLandArea`/`showBuiltArea`/`isRent`/`fieldVisible`, because the component STILL needs them at render scope (447-466) across the 2119-line file — slice 3 does NOT remove those. Duplicated behaviour-relevant predicates = divergence risk, the opposite of what a high-regression slice wants. Option A keeps the component's render predicates as the single source of truth and passes them in. The self-contained-testability of B is recovered via the exported `makeUpdatePayloadCtx` factory (also available for a future component de-dup, out of scope now).

`UpdateListingRequest` imported as `import type` (erased at build → no runtime cycle even though it lives in a hook file). New module imports only leaf lib modules → no cycle. One-directional: component → new module.

## Byte-identical vs necessarily-changed

**Byte-identical (character-for-character):** the entire payload literal (486-582, all 74 field expressions) via top-of-function destructure; the 4 derived-local expressions; `makeUpdatePayloadCtx` reproducing 448-466.

**Necessarily changed:** closure reads → param reads (text unchanged when destructured); the handler body shrinks to `const payload = buildListingUpdatePayload({...74 fields}, { isRent, showLandArea, showBuiltArea, fieldVisible }); updateListing.mutate(payload, { onSuccess })`. **Side effects STAY in the handler** — `preventDefault`, both `setError` clears, `mutate`, `onSuccess` wizard advance. The pure function does NO setState/mutate/toast. (Review must confirm the derived-locals move did not drag the `setError` clears at 478-479 into the function.)

## Regression-safety / test strategy (per the high-risk mandate)

**(a) Existing component anchors = the characterisation net (must pass UNCHANGED, run green BEFORE and AFTER):**
- `EditListing.residential.test.tsx`: house→apartment omits `hasGarden/hasTerrace/hasCompound/propertyAge/residentialWaterSource`; house→residential_plot omits pre-existing type-scoped `bedrooms/furnishingStatus/totalFloors` (+ new M38-13A fields); house→commercial omits `bedrooms/bathrooms/totalFloors`; apartment sale→rent omits `ownershipType`. Assertions read `mockUpdateMutate.mock.calls[0][0]`.
- `EditListing.agri.test.tsx`: agri fields present on save; `farmhouseAvailable`/`fencingDone` stay `undefined` when loaded null (null-not-coerced).
Because the extraction is byte-identical, these should pass with zero edits — the primary regression guarantee.

**(b) NEW exhaustive per-type UNIT tests** for `buildListingUpdatePayload` (fast, no render), using `makeUpdatePayloadCtx`: one describe per property type (apartment/house/villa/residential_plot/representative commercial/agricultural_land) asserting present-vs-omitted; PLUS the key mid-edit-type-switch case (state carries populated house-only fields but `ctx = makeUpdatePayloadCtx('apartment','sale')` → those keys `undefined`); PLUS isRent gating (sale→price present/rent fields undefined; rent→inverse); PLUS empty-multiselect omission (`amenities: []` → undefined); PLUS tri-state edge (`farmhouseAvailable=''` → undefined, `'false'` → `false` — guards the inline mapping vs `triStateToBool` distinction); PLUS empty-string trim.

**(c) Pre-refactor snapshot?** Not needed — the anchors already pin the exact PUT-payload shape at the component boundary incl. every type-switch omission. Optional cheap insurance: capture one representative type's baseline payload into a fixture and deep-equal it in the new unit test.

## Threading risks (74 fields) & how tests catch them

| Risk | Failure mode | Caught by |
|---|---|---|
| Silent omission of a field from the state bag | field silently `undefined` → stale value kept / 400 | **non-optional `ListingFormState` → tsc compile error**; per-type unit test asserting field present |
| Destructure/key typo | wrong/undefined value | tsc (unknown property); unit test |
| ctx boolean swapped (showLandArea↔showBuiltArea) | unit gating flips | assert BOTH `landAreaUnit` and `builtAreaUnit` explicitly per type |
| `fieldVisible` stubbed always-true in tests | type-switch omission silently broken | mid-switch unit test uses REAL `makeUpdatePayloadCtx`; component anchors use real fieldVisible |
| inline `reraNumber` propertyType check lost | rera sent for wrong types → 400 | per-type test: rera present only for apartment/house/villa/residential_plot |
| tri-state `''` ↔ `false` confusion | wrong boolean sent | tri-state edge unit test + agri null-not-coerced anchor |

Strongest single safeguard: **`ListingFormState` fields NON-OPTIONAL** so a dropped field at the call site is a compile error, not a runtime 400.

## Blast radius / concurrency

Touches exactly 3 files: `EditListing.tsx` (replace payload construction in handleStep1Save; keep `intOrUndef`/`floatOrUndef`/`triStateToBool`/`isListingFieldVisible` imports if still used at render scope — verify before pruning), new `src/lib/editListing/buildUpdatePayload.ts`, new `src/lib/editListing/__tests__/buildUpdatePayload.test.ts`. No import cycle (type-only DTO import).

**Concurrent-run check (#1824 MapDiscovery decomposition):** recent #1824 commits (a68dbb27, d0994a2f) touch only `src/…discover…` files (useReducedMotion, useDiscoverInteractionState) — NO overlap with `EditListing.tsx` or `src/lib/editListing/`. Already merged, not concurrent uncommitted work. No conflict.

## Open items
1. Reproduce the component's `fieldVisible` EXACTLY (3-arg `isListingFieldVisible(key, propertyType, listingPurpose)`) — do NOT "improve" it (e.g. add a commercialSubtype 4th arg the component doesn't currently pass). Byte-identical reproduction preserves whatever the component does today.
2. Keep the inline tri-state mapping for `farmhouseAvailable`/`fencingDone` (they use `=== 'true' ? true : === 'false' ? false : undefined` inline, NOT `triStateToBool`) — two distinct code paths, both must survive.
