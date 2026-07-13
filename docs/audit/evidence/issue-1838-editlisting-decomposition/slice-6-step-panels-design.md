# Slice 6 (step panels) — sub-slicing strategy, stateless-panel design & prop-threading

**Scope:** roadmap row 6 (architecture-review.md §9) — extract the 5 wizard-step JSX render blocks from `EditListingForm.tsx` into STATELESS presentational components (DescribeStep, PhotosStep, LocationStep, BoundaryStep, ReviewStep). ~950 LOC total. DIFFERENT from 5a-5e: this moves RENDER/JSX (not state ownership) — state STAYS in EditListingForm; panels are props/callbacks-in, own no state. Investigated Phase 0.7 (architect + explorer-planner, read-only). Citations are the slice-6 worktree (`EditListingForm.tsx` measured at 1960 LOC).

## Per-panel measurement (drives the sub-slicing call)
| Panel | Lines | JSX LOC | Mount semantics | Prop surface |
|---|---|---|---|---|
| **DescribeStep** (step 1) | 604-1558 | **~955 (72%)** | always-mounted, `display:none` toggle | **~80 values/setters** across 5 hooks + base + ctx |
| ReviewStep (final step) | 1692-1955 | ~264 | conditional `currentStep === reviewStep &&` | ~20 values + ~5 callbacks |
| PhotosStep (step 2) | 1561-1624 | ~64 | always-mounted, `display:none` toggle | ~6 values + 2 callbacks |
| LocationStep (step 3) | 1627-1669 | ~43 | always-mounted, `display:none` toggle | listing subset + 2 callbacks |
| BoundaryStep (step 4, agri-only) | 1672-1689 | ~18 | conditional `currentStep === 4 && isAgriListing &&` | 3 values + 2 callbacks |

The risk profile is wildly asymmetric — DescribeStep is the only high-risk panel (misrouting across ~80 hook values); the other four (~389 LOC combined) are near-trivial read-mostly panels.

## Decision #1 — SUB-SLICE into 2 PRs (recommended)
- **6a (THIS plan's scope):** PhotosStep + LocationStep + BoundaryStep + ReviewStep. Establishes the `steps/` folder, the stateless panel-prop pattern, and the byte-identical extraction technique on four low/medium-risk panels (~389 LOC, small surfaces). Proves the pattern before the monster.
- **6b (follow-up PR):** DescribeStep alone (~955 LOC, ~80 props) — extracted once the pattern is proven and reviewers have a small diff to focus the prop-contract audit on.
Rationale: the dominant risk is prop/callback MISROUTING across DescribeStep's ~80-value surface. Bundling it with the four trivial panels yields a ~1350-LOC diff where the reviewer can't separate "did the folder/pattern land" from "is every one of 80 DescribeStep props threaded to the right JSX identifier." Two PRs isolate that audit. Mirrors how slice 5 was decomposed into 5 PRs.
**Fallback (surfaced, not recommended):** 3-way split — pull ReviewStep into its own PR — only if PLAN_REVIEW wants tighter isolation. ReviewStep's surface is moderate but mechanical (mostly one `listing` object + nav callbacks), so folding it into 6a is acceptable and saves a PR.

## Decision #2 — prop-threading: structured hook-result props + destructuring preamble (recommended)
Pass the composed hook RESULT objects as structured props + a `base` bag + a `ctx` bag + explicit handlers (~10 props, not ~80). Inside each panel, RE-DESTRUCTURE verbatim exactly as EditListingForm does today:
```
const { waterSource, soilType, /* … */ } = agri.values;
const { setWaterSource, /* … */ } = agri.setters;
const { bathrooms, /* … */ } = residential.values;   // etc.
```
→ every closure identifier the JSX already uses (`waterSource`, `setBathrooms`, `fieldVisible`, `isCommercialType`, …) is restored, so the JSX block relocates with ZERO token changes. The JSX never reads `props.agri.values.waterSource` — it reads `waterSource`, exactly as today. This neutralises the "`props.x.values.y` vs closure `y`" faithfulness risk.
**Stateless?** YES — the panel never CALLS `useAgriFields()` etc.; it receives already-constructed objects and only reads/invokes their members. No new coupling beyond the already-shared hook-result types (`ReturnType<typeof useX>`, a type-only import). This is the definition of a presentational component.
Rejected: (b) flat 80-prop bag (unmaintainable/unreviewable, maximal misrouting); (c) grouped-by-section (arbitrary regroup that forces JSX edits, breaks byte-identity). Only (a) keeps the prop contract small AND the JSX untouched.

## Byte-identical guarantee
The 5 `data-testid` wrappers + their mount/visibility semantics STAY IN THE PARENT (EditListingForm); the panels are the INNER CONTENT only:
```
<div data-testid="step-2-panel" style={{ display: currentStep === 2 ? 'block' : 'none' }}>
  {isSubmittable && <PhotosStep … />}
</div>
{currentStep === 4 && isAgriListing && (<div data-testid="step-4-panel"><BoundaryStep … /></div>)}
{currentStep === reviewStep && <ReviewStep … />}
```
Why this preserves DOM + tree: (1) a function component renders its children inline → NO extra DOM node; (2) the always-mounted vs conditional distinction is preserved — CRITICAL because step 2's `ImageUploader` must NOT remount (upload-state loss), so the parent keeps rendering `<PhotosStep>` unconditionally under the `display:none` wrapper (never behind `currentStep===2 &&`); (3) `data-testid` anchors literally unchanged → guard test + 4 render anchors pass without edits; (4) JSX inside each panel byte-identical via the destructuring preamble. The ONLY way byte-identity breaks is a JSX identifier rewrite — the destructuring-preamble rule forbids it; enforce via a whitespace-insensitive diff of the moved JSX against the original.

## Stateless-violation check
Swept all 5 blocks — NO violations. Every block reads EditListingForm-owned state; all thread cleanly as props/callbacks. PhotosStep: videoUrl/videoUrlError/handleVideoUrlChange/canSubmitImages/setCanSubmitImages are parent state; `ImageUploader`'s upload state is internal to ImageUploader and preserved by keeping PhotosStep always-mounted (AttachmentController folds into PhotosStep, NOT lazy-unmounted). BoundaryStep: `BoundaryDrawStep` owns its draw state; panel forwards initialCoords/onSave/onSkip. ReviewStep/DescribeStep: no local state.

## Child-component relocation
Child components (`AddressPicker`, `ImageUploader`, `BoundaryDrawStep`, `PoiManager`, `PriceField`, `AreaField`, `SingleChipGroup`/`MultiChipGroup`, `SectionCard`, `ListingPurposeToggle`, `PropertyTypeCardSelector`) are NOT physically moved — what relocates is the IMPORT + USAGE into the owning panel. `StepIndicator` stays in the parent (renders outside the step panels). WATCH: `SectionCard`/`Input`/`Label`/`Button`/`Select*`/`AlertTriangle`/`PriceField`/`AreaField`/chip groups are used by DescribeStep (which STAYS in the parent for 6a) — so for 6a do NOT remove those parent imports. Prune a parent import ONLY where NO remaining parent reference exists after the 4-panel move (reference-check each: candidates safely movable in 6a are `ImageUploader`, `AddressPicker`, `BoundaryDrawStep`, `PoiManager`, `extractYouTubeId`/`isInstagramUrl`, and icons only used in the moved panels — verify each).

## Test strategy
Per-panel RTL tests under `src/pages/broker/editListing/steps/__tests__/` (warranted at scale): PhotosStep (continue-gated on canSubmitImages, video preview, onCanSubmitChange wiring), LocationStep (AddressPicker prop wiring, continue gated on addressConfirmed, onLocalityConfirmed), BoundaryStep (renders with coords, save/skip callbacks), ReviewStep (summary rows, edit buttons call setCameFromReview(true)+setCurrentStep(n), submit-gate disabled logic, title-locality banner). **CRITICAL (repo lesson, commit e79526df / #1837): per-panel tests MUST mock the heavy children (ImageUploader, AddressPicker, BoundaryDrawStep, PoiManager, map-bearing components) to stable stubs — an unstable heavy-child mock caused a 4GB/10min OOM; the new specs will reproduce it if unmocked.** The 5 frozen EditListing anchors (incl. guard) MUST pass UNCHANGED before/after — RED-FLAG on any non-additive change.

## initialStep clamp (Open Item)
Stays in EditListingForm (lines 124-128: stepParam→initialStep clamp + currentStep/setCurrentStep ownership). Panels receive setCurrentStep as a callback only. Slice-7 territory — untouched here.

## Files touched — sub-slice 6a
NEW: `steps/PhotosStep.tsx`, `steps/LocationStep.tsx`, `steps/BoundaryStep.tsx`, `steps/ReviewStep.tsx` + `steps/__tests__/{PhotosStep,LocationStep,BoundaryStep,ReviewStep}.test.tsx`. MODIFIED: `EditListingForm.tsx` — replace the 4 inner JSX blocks with `<PhotosStep/>`/`<LocationStep/>`/`<BoundaryStep/>`/`<ReviewStep/>` (keeping the parent's data-testid wrappers + mount semantics), thread props, prune only genuinely-orphaned imports. DescribeStep stays in the parent for 6a. No frozen file touched.

## Risks (6a)
| Risk | Sev | Catch |
|---|---|---|
| Import-pruning error (still-used removed / unused left) | low | reference-check each candidate vs the post-extraction parent; tsc/lint/build |
| Mount-semantics regression — PhotosStep behind `currentStep===2 &&` → ImageUploader remount/upload-state loss | HIGH | parent keeps the always-mounted `display:none` wrapper verbatim; code-reviewer focus; PhotosStep test asserts always-mounted |
| Byte-identity drift (JSX identifier rewrite) | med | destructuring-preamble rule + whitespace-insensitive diff of moved JSX; anchors green |
| New-test OOM (unmocked heavy children) | HIGH (test-infra) | mandatory stable child mocks in every per-panel spec (#1837 lesson) |
| ReviewStep nav semantics (setCameFromReview true vs false per button) | med | assert exact cameFromReview value per button in ReviewStep spec |

## Open question for PLAN_REVIEW
data-testid wrapper + display toggle in the PARENT (recommended — anchors literally unchanged, lowest risk) vs inside the panel via an `active` prop. Recommend parent-owns-wrapper.

## Process note (from 5a-5e)
All specialist edits/test runs MUST occur in `/Users/gouthamrao/Documents/workspaces/lovable/udupi-property-explorer-worktrees/issue-1838-slice6-step-panels` — verify `git status` there. Run lock `.claude/active-runs/issue-1838.lock`.
