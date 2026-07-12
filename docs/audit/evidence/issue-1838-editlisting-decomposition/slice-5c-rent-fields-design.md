# Slice 5c (rent-fields) — boundary adjudication & extraction design

**Scope:** roadmap row 5 (architecture-review.md §9), 3rd of 5 domain-field-hook PRs (agri→commercial→rent→residential→common). Extract rent-specific field state/hydration out of `EditListingForm.tsx` into `useRentFields()`, mirroring 5a/5b `{ values, setters, hydrate }`. Behaviour-preserving state-ownership extraction only. Investigated Phase 0.7 (architect + explorer-planner, read-only) + orchestrator direct reads. Citations are the slice-5c worktree.

## The boundary question (the crux, per the assignment's "surface messiness" mandate)

The two read-only specialists diverged on which fields are "rent-exclusive":

- **explorer-planner** classified **8** fields via `listingFieldConfig.ts` CONFIG_MAP: the 3 purpose-only (`monthlyRent`, `securityDepositMonths`, `lockInMonths`, gated `listingPurpose==='rent'||'lease'`) PLUS 5 dual-gated (`maintenanceIncluded`, `rentNegotiable`, `petsAllowed`, `availabilityTimeline`, `preferredTenants`, gated `isResidentialFamily AND listingPurpose==='rent'`).
- **architect** recommended **3** fields (the purely-`isRent`-gated ones), keeping the other 5 component-owned.

### Adjudication (plan author): recommend the 3-field boundary; surface the 5-field alternative for PLAN_REVIEW

The decisive distinction is the **gating axis**, confirmed against the frozen slice-3 builder `buildUpdatePayload.ts`:

| Field | Gate in buildUpdatePayload | Axis | Hydrate shape | Present for… |
|---|---|---|---|---|
| monthlyRent | `isRent ? intOrUndef : undefined` (:251) | PURPOSE only | `String()` | ANY type + rent |
| securityDepositMonths | `isRent ? intOrUndef : undefined` (:252) | PURPOSE only | `String()` | ANY type + rent |
| lockInMonths | `isRent ? intOrUndef : undefined` (:253) | PURPOSE only | `String()` | ANY type + rent |
| rentNegotiable | `fieldVisible('rentNegotiable')` (:296) | residential-family ∩ rent | `boolToTriState` (tri-state) | residential + rent |
| maintenanceIncluded | `fieldVisible('maintenanceIncluded')` (:294) | residential-family ∩ rent | tri-state | residential + rent |
| petsAllowed | `fieldVisible('petsAllowed')` (:297) | residential-family ∩ rent | tri-state | residential + rent |
| availabilityTimeline | `fieldVisible('availabilityTimeline')` | residential-family ∩ rent | `?? ''` | residential + rent |
| preferredTenants | `fieldVisible('preferredTenants') && length>0` | residential-family ∩ rent | array `?? []` | residential + rent |

- The **3 purpose-only fields** are the true "rent domain": gated solely by `isRent`, present for a rent listing of ANY property type, uniform `String()` hydrate, and rendered as one cohesive "Rent Details" JSX block (`EditListingForm.tsx:1390-1431`). This is a clean, same-shape cohesive set — exactly the shape of 5b's `useCommercialFields` (3 `String()` fields).
- The **5 dual-gated fields** are **not purely rent** — a *commercial* rent listing does not show them (residential-family gated). They are residential-*terms* fields that happen to be rent-only, co-located in the JSX residential-terms block beside `priceNegotiable` (which is **sale**-gated and stays), with tri-state/array hydrate shapes. Pulling only the rent-subset out of that cohesive residential-terms region would (a) mix two gate axes in a "rent" hook, (b) break the hook's clean single-coercion shape, (c) split a co-located block. They belong to the **residential-domain decision (slice 5d)** or an explicit cross-cutting "terms" grouping — not this slice.

This is the same lesson as 5a (excluded shared `ownershipType`) and 5b (excluded shared `carpetArea`/`floorNumber`/`furnishingStatus`): the domain hook owns only the fields that are exclusively and cohesively that domain's. **Recommendation: extract the 3 purpose-only fields; defer the 5 dual-gated to slice 5d / a terms decision.** The plan surfaces the 5-field alternative so PLAN_REVIEW can override if it reads "rent-exclusive" as the broader purpose-only-membership set.

## Extraction design (for the recommended 3-field boundary)

### Hook — `src/pages/broker/editListing/useRentFields.ts` (byte-for-byte clone of useCommercialFields.ts shape)
- `RentFieldValues { monthlyRent: string; securityDepositMonths: string; lockInMonths: string }`
- `RentFieldSetters { setMonthlyRent; setSecurityDepositMonths; setLockInMonths }`
- `UseRentFieldsResult { values; setters; hydrate }`
- `useState('')` defaults matching current `EditListingForm.tsx:181-183`.
- `hydrate = useCallback((listing: ListingResponse) => { setMonthlyRent(listing.monthlyRent != null ? String(listing.monthlyRent) : ''); ...deposit; ...lockIn }, [])` — VERBATIM from prefill lines `:273-275`. Stable `useCallback([])`.
- Imports only `react` + `type ListingResponse` (no cycle; same as useCommercialFields/useAgriFields).

### Threading (byte-identical JSX + builder input)
- Remove the 3 rent `useState` (`:181-183`); compose `const rent = useRentFields();` where commercial is composed; **bare-destructure** `const { monthlyRent, securityDepositMonths, lockInMonths } = rent.values;` + setters so identifiers are unchanged → the "Rent Details" JSX block (`:1390-1431`) is byte-identical (no JSX edit).
- Replace prefill lines `:273-275` with `rent.hydrate(listing);` right after `commercial.hydrate(listing);` in the EXISTING single prefill effect; add `rent.hydrate` to the effect dep array (`:326`).
- The payload state-bag keys (`buildUpdatePayload` call site) reference the same identifiers → literal byte-identical. `buildUpdatePayload.ts` + `buildUpdatePayload.test.ts` UNTOUCHED and stay green (the builder never learns state moved into a hook; non-optional `ListingFormState` is the compile-time safeguard).

### Purpose-axis nuance
State ownership and gating are orthogonal: the hook owns only `useState` + `hydrate`; ALL gating (`isRent` in the builder, `fieldVisible`/`isRent` in the JSX, the derived `const isRent`) stays exactly where it is, unchanged. Existing behaviour preserved — including the pre-existing detail that the payload's `isRent` checks `=== 'rent'` only while CONFIG_MAP allows rent||lease (NOT changed by this slice).

### Test strategy
- No `EditListing.rent.test.tsx` exists. **Author it baseline-first** (component-level, mirroring `EditListing.commercial.test.tsx`: hoisted mocks, `makeBaseListing`, `renderEditListing`), using `propertyType:'apartment'` + `listingPurpose:'rent'`. Assert: (a) prefill round-trip (monthlyRent/deposit/lockIn populated → inputs show values); (b) null→empty; (c) save-payload round-trip (typed values → `mockUpdateMutate` payload has the int-coerced rent fields); (d) **purpose-scoping** — a `sale` listing does NOT render the rent block AND the save payload has `monthlyRent`/`deposit`/`lockIn` `=== undefined` (guards the `isRent` axis — the highest-value guard, analog of commercial's type-scoping test).
- **Hook unit test `useRentFields.test.ts`: SKIP** (matches the 5b precedent — no `useCommercialFields.test.ts`; the component anchor exercises every hydrate branch + setters; agri's hook test existed only for its extra structured/tri-state coercion, which rent's 3 `String()` fields don't have). Low-cost to add if PLAN_REVIEW requests.
- **Mandatory before/after protocol:** run the new `EditListing.rent.test.tsx` + guard + residential + agri + commercial anchors + `buildUpdatePayload.test.ts` GREEN against the UNMODIFIED component (baseline; the new anchor must pass against unextracted code), then identically AFTER (equivalence).

### Files touched (exactly 3)
1. `src/pages/broker/editListing/EditListingForm.tsx` — remove 3 rent useState + compose hook + bare-destructure + `rent.hydrate(listing)` in the prefill effect + dep-array + import.
2. `src/pages/broker/editListing/useRentFields.ts` — NEW.
3. `src/pages/broker/__tests__/EditListing.rent.test.tsx` — NEW baseline anchor.
No hook unit test (recommend skip). No other file. No import cycle.

## Risks
| Risk | Catch |
|---|---|
| A rent setState site missed during identifier re-wire | tsc undefined-identifier; anchor (c) |
| hydrate coercion drift (`?? ''` vs `!= null ? String() : ''` → renders `'0'` for 0) | anchor (a)+(b); verbatim copy from :273-275 |
| `rent.hydrate` omitted from effect dep array → prefill not firing | react-hooks/exhaustive-deps lint; anchor (a) |
| Purpose-axis regression (rent fields sent on sale, or hidden on rent) | anchor (d) both directions — the slice-unique guard |
| Builder contract silently changes | buildUpdatePayload untouched; its test in the before/after set |
| Wrong boundary (5 dual-gated fields forced in) | surfaced to PLAN_REVIEW; recommend 3-field cohesive set |

## Process note (from 5a/5b)
All specialist edits/test runs MUST occur in the declared worktree `/Users/gouthamrao/Documents/workspaces/lovable/udupi-property-explorer-worktrees/issue-1838-slice5c-rent-fields` — verify `git status` there before trusting evidence (5a/5b had stale-worktree confusion). Concurrent-run lock: `.claude/active-runs/issue-1838.lock`.

## Open items (do not block the design)
1. PLAN_REVIEW to ratify the 3-field vs 8-field boundary (recommended: 3).
2. explorer flagged `availabilityTimeline` UI label ("Availability") vs code name — cosmetic, out of scope.
3. lease-purpose gating (`isRent` checks `=== 'rent'` only; CONFIG_MAP allows rent||lease) is PRE-EXISTING — preserve byte-identical, do not "fix" here.
