# Slice 7 — navigation controller extraction: design evidence

**Issue:** #1838 · slice-7 (`slice-7-nav-controller`) · FIRST PR of roadmap row 7 "Navigation controller"
**Risk:** medium (slice) / high-risk (programme). ~90 LOC. STATE hook (like slice 5), NOT a stateless panel (slice 6).
**Worktree:** `/Users/gouthamrao/Documents/workspaces/lovable/udupi-property-explorer-worktrees/issue-1838-slice7-nav-controller` (branch `issue-1838-slice7-nav-controller`, off origin/main incl. merged 1-6b).
**Investigation:** explorer-planner + architect (read-only). Measured baseline the plan cites.

## 1. Nav surface located (current post-6b EditListingForm.tsx)

- **L33-34** — `BASE_STEPS` (4 steps) / `AGRI_STEPS` (5 steps) module consts.
- **L42** — `const [searchParams] = useSearchParams();` — destructures the FIRST tuple element ONLY (no `setSearchParams`). Basis of the no-URL-writeback guarantee.
- **L58-61** — `isAgriListing = propertyType === 'agricultural_land'`; `WIZARD_STEPS = isAgriListing ? AGRI_STEPS : BASE_STEPS` (a plain ternary, NOT a useMemo); `reviewStep = WIZARD_STEPS.length`; `boundaryStep` derived.
- **L65-67** — `stepParam = searchParams.get('step')` → `initialStep = clamp(1, WIZARD_STEPS.length, parseInt)` → `useState(initialStep)`. THE CLAMP TRAP (§3).
- **L69** — `cameFromReview` state.
- **cameFromReview branch** duplicated at **369-374** (handleStep1Save) and **393-396** (handleStep2Continue); `setCameFromReview(false)` transitions at **403-406** (handleStep3Continue); `setCurrentStep(reviewStep)` at **417/425** (handleStep4Continue/Skip).

**Stays in the PARENT** (not nav-pure): `handleStepClick` (249-254, reads the `steps` completion-gate array), the `steps` completion array (234-247, mixes nav labels + business `isComplete` gate state), all `updateListing.mutate`/`submitListing.mutate` calls + the step handler BODIES (they call the hook's setters but own persistence), `navigate(...)` for the submit-for-review redirect (~450, unrelated to step nav), and `propertyType`/`listingPurpose` state (base scalars — passed to the hook as ARGS).

## 2. Hook shape — mirror slice-5 DISCIPLINE, nav-appropriate INTERFACE (Decision D1)

Slice 5's `{values, setters, hydrate}` shape does NOT cleanly fit: there is no `hydrate` — nav state is seeded ONCE from the URL at mount, not from `ListingResponse`. Forcing a `hydrate` would be cargo-culting. Mirror slice 5's *discipline* (a single typed result object, `Dispatch<SetStateAction<T>>` setter types, `useState` defaults verbatim — as `useSharedFields.ts:33-47`) with a nav interface:

```ts
export interface UseEditListingNavigationResult {
  currentStep: number;
  setCurrentStep: Dispatch<SetStateAction<number>>;
  cameFromReview: boolean;
  setCameFromReview: Dispatch<SetStateAction<boolean>>;
  wizardSteps: readonly string[];   // was WIZARD_STEPS
  reviewStep: number;
  boundaryStep: number;
  isAgriListing: boolean;
  advanceAfterSave: (sequentialNext: number) => void;   // see Decision D2
}
export function useEditListingNavigation(
  propertyType: PropertyType | '',
  listingPurpose: 'sale' | 'rent',
): UseEditListingNavigationResult
```

**Byte-identical parent threading:** panels receive `currentStep`/`setCurrentStep`/`cameFromReview`/`setCameFromReview` (lines ~538/636/637). The hook returns them under the same names; the parent destructures and threads unchanged. For `WIZARD_STEPS`, ALIAS on destructure — `const { wizardSteps: WIZARD_STEPS, reviewStep, boundaryStep, isAgriListing, ... } = nav;` — so every existing `WIZARD_STEPS`/`reviewStep`/`boundaryStep` reference in the parent JSX + StepIndicator stays literally identical.

**WIZARD_STEPS ownership (Decision D3):** own it IN the hook and return it (single source of truth; feeds the clamp initializer from the same binding). The parent's `steps` completion array (234-247) STAYS in the parent (not nav-pure). Move `BASE_STEPS`/`AGRI_STEPS` consts into the hook module.

## 3. THE LATENT CLAMP QUIRK — preserve VERBATIM (Constraint B / Decision D-clamp)

Current behaviour (L65-67 + the L55-57 comment): `initialStep` clamps against `WIZARD_STEPS.length` computed while `propertyType===''` (i.e. BASE_STEPS, length 4) BEFORE listing data hydrates and flips `WIZARD_STEPS` to AGRI_STEPS (length 5). A deep-link `?step=5` on an agri listing clamps to `min(5,4)=4` and is NEVER re-expanded after hydration — because the `useState` initializer runs exactly once. This is a KNOWN quirk to PRESERVE and characterise, NOT fix.

**Preserve it by keeping the clamp a one-shot `useState` LAZY initializer** that reads `wizardSteps.length` at mount:
```ts
const isAgriListing = propertyType === 'agricultural_land';
const wizardSteps = isAgriListing ? AGRI_STEPS : BASE_STEPS;
const [currentStep, setCurrentStep] = useState<number>(() => {
  const stepParam = searchParams.get('step');
  return stepParam ? Math.max(1, Math.min(wizardSteps.length, parseInt(stepParam, 10) || 1)) : 1;
});
```
At mount `wizardSteps.length===4` (pt=''); the initializer runs once; `?step=5` → 4, never recomputed when pt later flips. Bit-for-bit identical to today.

**FORBIDDEN refactors — each would ACCIDENTALLY "fix" the quirk (plan must forbid by name):**
1. A `useMemo` keyed on `propertyType`/`wizardSteps` to compute `initialStep`, then seeding `currentStep` from it — re-expands to 5 post-hydration. **Most likely accidental fix.**
2. A `useEffect(() => setCurrentStep(initialStep), [propertyType])` or any effect re-seeding `currentStep` when steps change.
3. Eager `useState(initialStep)` (non-lazy) combined with any reset — the lazy `() =>` form is MANDATORY.
4. Deriving the clamp bound from `AGRI_STEPS.length` unconditionally, or hoisting the clamp above the propertyType-dependent branch so it sees the agri length.

The characterisation test (§5 case 3) is the guard that makes any of these fail loudly.

## 4. No URL write-back (Constraint A)

Confirmed by construction: the hook's ONLY URL interaction is `searchParams.get('step')` inside the lazy initializer, once at mount. Plan forbids inside the hook: destructuring/using the SECOND tuple element of `useSearchParams()` (`setSearchParams`); any `navigate`/`useNavigate`; any `history.pushState`/`replaceState`/`window.location` mutation. Step navigation after mount stays pure local `useState`; back-button/history behaviour unchanged.

## 5. Decision D2 — advanceAfterSave (dedup) vs inline branches — SURFACE TO PLAN_REVIEW

The `cameFromReview` branch is currently DUPLICATED inline at 369-374 and 393-396 (`if (cameFromReview) { setCameFromReview(false); setCurrentStep(reviewStep); } else { setCurrentStep(sequentialNext); }`). The architect recommends the hook expose `advanceAfterSave(sequentialNext)` collapsing both copies:
```ts
const advanceAfterSave = useCallback((sequentialNext: number) => {
  if (cameFromReview) { setCameFromReview(false); setCurrentStep(reviewStep); }
  else { setCurrentStep(sequentialNext); }
}, [cameFromReview, reviewStep]);
```
Parent calls `advanceAfterSave(2)` (step 1) / `advanceAfterSave(3)` (step 2) inside the existing `updateListing.mutate` onSuccess; the mutation stays in the parent.

- **PRO (architect's recommendation):** this IS the "navigation controller" concern; leaving the branch duplicated in the parent misses the slice's point. Behaviour-equivalent; the cameFromReview unit test pins both paths.
- **CON / conservative alternative:** it changes the two handler call-sites (not byte-identical parent code, unlike the pure state members). A stricter reading of the programme's behaviour-preservation discipline would keep the two branches inline in the parent and have the hook own only state+derived.
- **NOTE:** a STATE-hook slice's bar is BEHAVIOURAL equivalence (proven by the anchors + the hook unit test), NOT byte-identical code (that was slice 6's panel-JSX bar). advanceAfterSave is within that bar.
- **Recommendation:** adopt advanceAfterSave (architect's design), with the cameFromReview unit test asserting BOTH paths, but surface the choice explicitly to PLAN_REVIEW so the dedup is ratified rather than assumed.

## 6. Test strategy — `useEditListingNavigation.test.ts` (renderHook + MemoryRouter)

The hook calls `useSearchParams`, so tests wrap in `MemoryRouter`. Cases:
1. **cameFromReview edit-jump-back branch:** `act(setCameFromReview(true))` then `act(advanceAfterSave(2))` → assert `currentStep===reviewStep` AND `cameFromReview===false`; then the false path → `currentStep===2`.
2. **agri WIZARD_STEPS branch:** `renderHook` with `pt='agricultural_land'` → `wizardSteps.length===5`, `reviewStep===5`, `boundaryStep===4`, `isAgriListing===true`; non-agri → `wizardSteps.length===4`.
3. **Latent clamp characterisation (the landmine guard):** `MemoryRouter initialEntries={['/edit/x?step=5']}`, `renderHook` `initialProps: { pt: '' }` → assert `currentStep===4` (clamped to BASE_STEPS.length at mount); then `act(rerender({ pt: 'agricultural_land' }))` (simulates the hydration flip) → assert `currentStep` is STILL 4 (CURRENT quirky behaviour, not re-expanded). Comment in the test that this pins a KNOWN quirk, not correct behaviour. renderHook subtlety: the pre→post transition is a `rerender` prop change, not a remount; if `currentStep` ever becomes 5 after rerender, a forbidden §3 refactor was used.

**Regression net:** the 4 full-form anchors (EditListing.agri/residential/commercial/rent) exercise step navigation incl. the agri step count + the cameFromReview edit-jump-back; MUST pass unchanged before/after (RED-FLAG on non-additive edit). + guard.test.tsx (unmodified) + buildUpdatePayload.test.ts (frozen). NOTE: explorer-planner could not locate these anchor files by path in the worktree in its pass — the engineer must confirm their exact path (src/pages/broker/__tests__/) at baseline and run them.

## 7. Code-review tier — SONNET sufficient (Decision D4)

Architect: sonnet is sufficient PROVIDED the review prompt carries BOTH invariants verbatim (preserve-the-clamp, no-URL-writeback) and the three characterisation tests exist. Unlike 6b's broad ~80-identifier misrouting audit (which needed opus breadth), this is ~90 LOC with two NARROW, well-characterised traps that the tests pin and fail loudly on. Residual risk: a well-intentioned reviewer "fixing" the clamp quirk — mitigated by passing the "PRESERVE, do not fix" note into the reviewer context so the quirk is expected.

## 8. Specialist sequence (proposed)
qa-fast → frontend-engineer → code-reviewer (sonnet, frontend) → qa (verification). security-reviewer NOT_REQUIRED (no Gate F — client-side nav state; the one-time searchParams READ is not a security surface). e2e NOT_REQUIRED (behaviour-preserving state extraction; 4 full-form anchors + the new hook unit test provide the signal).

## 9. Risks
- **R1 (HIGH, headline) — accidentally fixing the latent clamp quirk** via any of the §3 forbidden refactors. Mitigation: hard_constraint forbidding them by name + the clamp characterisation test (§6 case 3) that fails loudly if the quirk is "fixed".
- **R2 (MED) — introducing URL write-back** (setSearchParams/navigate/history in the hook). Mitigation: hard_constraint + read-once lazy-initializer design + code-review focus.
- **R3 (MED) — cameFromReview edit-jump-back regression** if advanceAfterSave miswires the branch or a call-site passes the wrong sequentialNext. Mitigation: the cameFromReview unit test (both paths) + the agri anchors that exercise the flow.
- **R4 (MED) — parent threading drift**: a WIZARD_STEPS/reviewStep/boundaryStep reference not aliased back, or a panel losing currentStep/setCurrentStep. Mitigation: alias-on-destructure keeps parent references identical; tsc/anchors.
- **R5 (LOW) — moving non-nav logic into the hook** (payload build, handleStepClick, the steps completion array). Mitigation: explicit "stays in parent" list (§1).
