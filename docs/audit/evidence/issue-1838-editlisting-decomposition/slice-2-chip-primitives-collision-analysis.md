# Slice 2 (chip-primitives) — ChipGroup collision analysis & target decision

**Scope:** roadmap row 2 (architecture-review.md §9) — extract EditListing.tsx's inline chip primitives + option consts. Behaviour-preserving. Investigated Phase 0.7 (architect + explorer-planner, read-only) + orchestrator direct reads. Line citations are the slice-2 worktree (branch `issue-1838-slice2-chip-primitives`, off origin/main incl. slice-1 merge).

## The collision (decisive)

`src/components/broker/ChipGroup.tsx` ALREADY EXISTS (created for the residential single-page form) and exports `ChipOption`, `SingleChipGroup`, `MultiChipGroup`, `boolToTriState`, `triStateToBool`. EditListing.tsx keeps its OWN local (non-exported) `SingleChipGroup`/`MultiChipGroup` + `ChipOption` + five `*_CHIP_OPTIONS` consts. **The two same-named components have DIVERGED** — a naive "import from ChipGroup.tsx" is NOT behaviour-preserving.

### Exact divergences

**SingleChipGroup** — EditListing (`EditListing.tsx:146-192`) vs ChipGroup.tsx (`28-58`):

| Aspect | EditListing (local) | ChipGroup.tsx (shared) |
|---|---|---|
| Wrapper testid | `data-testid={`chip-group-${id}`}` | none |
| Label | `<Label id={`${id}-label`}>` — no className | `<Label htmlFor={id} className="text-[13px] font-semibold">` |
| a11y association | `aria-labelledby={labelId}` on ToggleGroup | `htmlFor` only — a **no-op** (ToggleGroup root is a `<div>`, not a labelable control) |
| onValueChange guard, variant/item classes | identical | identical |

**MultiChipGroup** — EditListing (`203-228`) vs ChipGroup.tsx (`68-91`): differ in **exactly one** way — ChipGroup.tsx's Label has `className="text-[13px] font-semibold"`, EditListing's has none. `useId`/`aria-labelledby`/`data-testid={testId}` identical.

Also: `ChipOption` is duplicated (EditListing local + ChipGroup export, structurally identical); `BHK_CHIP_OPTIONS` and siblings are independently duplicated in `ResidentialListingForm.tsx:67` (separate copy, no import edge). The ChipGroup.tsx header comment referencing `NewListing.tsx` is stale — no such file exists.

## Blast radius (critical correction from investigation)

`ChipGroup.tsx` is imported by **THREE** journeys, not one: `ResidentialListingForm.tsx`, `CommercialListingForm.tsx`, `AgriculturalListingForm.tsx` (find_importers). Their shared `MultiChipGroup` testIds are pinned by unit tests (`ResidentialListingForm.fieldGrouping.test.tsx`) **and an E2E** (`e2e/commercial-create-listing-1684.spec.ts:456-629` asserts `chip-group-utilities`, `chip-group-suitable-uses`). Any edit to shared `ChipGroup.tsx` puts all three journeys + that E2E in scope.

EditListing renders the local primitives 7×: SingleChipGroup for bedrooms/bathrooms/balconies/parking2w/parking4w; MultiChipGroup for amenities (`testId='chip-group-amenities'`) and specialLocationViews. No EditListing test currently queries `chip-group-*` (searched `src/pages/broker/__tests__/*.tsx`, zero hits) — but the `chip-group-${id}` testid is live DOM and must be preserved to stay behaviour-preserving.

## Decision: Option B (new colocated module) — Option A rejected for this slice

- **Option A (merge into shared ChipGroup.tsx) REJECTED.** To keep all four consumers byte-for-byte, the shared component would need a superset signature (`testId?`, `labelClassName?`, `labelAssoc?: 'htmlFor'|'aria-labelledby'`) because the 3 shared-form call sites render no-testid + font-semibold label + htmlFor, while EditListing renders testid + plain label + aria-labelledby. No default satisfies both sets, so you must either change the shared component's defaults (silently altering 3 sibling journeys' DOM/a11y — the htmlFor→aria-labelledby swap is a genuine cross-journey a11y change, not a no-op) or edit all 3 call sites. Both drag 3 other journeys + their unit tests + the commercial E2E into a slice scoped to EditListing → violates "behaviour-preserving at every slice boundary / smallest cohesive slice / no big-bang."
- **Option B (new colocated module) CHOSEN.** Extract EditListing's exact local versions verbatim to a NEW non-colliding module colocated with the page. Zero edits to `ChipGroup.tsx` and the 3 sibling forms → zero blast radius outside EditListing. EditListing's DOM (testid), a11y (aria-labelledby), and styling stay identical. The name collision is dissolved by module path, so the eventual consolidation is a pure import-path swap. Cost: two near-duplicate primitives coexist temporarily — the acceptable, reversible price of a strictly-scoped slice.

**Deferred to a follow-up slice (its own issue):** consolidating the two primitive copies into one shared component, standardising on EditListing's `aria-labelledby` a11y form (a net a11y improvement over ChipGroup.tsx's no-op `htmlFor`) + an optional `testId`, carrying all 3 sibling forms' unit tests + the commercial E2E in scope, and deduping the parallel `ChipOption` / `*_CHIP_OPTIONS` copies.

## Recommended slice-2 scope

- **New file:** `src/pages/broker/editListing/chipGroups.tsx` (colocated with the page; mirrors slice-1's `src/lib/editListing/` grouping and signals EditListing-ownership until consolidation).
- **Exports (verbatim moves of EditListing.tsx:92-228, logic/markup unchanged):** `ChipOption`, `SingleChipGroup`, `MultiChipGroup`, `BHK_CHIP_OPTIONS`, `BATHROOM_CHIP_OPTIONS`, `BALCONY_CHIP_OPTIONS`, `PARKING_CHIP_OPTIONS`, `FLOORS_CHIP_OPTIONS`. Module imports only `useId` (React), `Label`, `ToggleGroup`/`ToggleGroupItem` — deps EditListing already pulls.
- **EditListing.tsx edits:** delete local 92-228; add one import from `./editListing/chipGroups`; remove now-unused imports (`useId`, `ToggleGroup`/`ToggleGroupItem`, `Label`) ONLY after verifying no other in-file use.
- **No-regression characterisation:** rendered DOM for all 7 chip instances byte-identical (`data-testid="chip-group-bedrooms"` etc., `<Label id="…-label">` no className, `aria-labelledby` association, no added `font-semibold`); `chip-group-amenities` MultiChipGroup unchanged; new RTL tests for the extracted primitives (roadmap row 2); the 3 EditListing anchors (guard/residential/agri) stay green with NO test edits; ChipGroup.tsx + 3 sibling forms + commercial E2E untouched.

## Open items
1. The `chip-group-${id}` single-chip testid is currently unpinned by tests — the new RTL tests should assert it so the behaviour is locked going into consolidation.
2. The `*_CHIP_OPTIONS` / `ChipOption` duplication across EditListing, ChipGroup.tsx, and ResidentialListingForm is intentional-for-now; consolidation is the deferred follow-up's job.
