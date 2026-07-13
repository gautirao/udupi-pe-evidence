# Slice 8 — lazy-mount AddressPicker: design evidence

**Issue:** #1838 · slice-8 (`slice-8-lazy-address-picker`) · roadmap row 8 (final substantive slice)
**Risk:** medium (slice) / high-risk (programme). ~5 LOC — the difficulty is correctness, not size.
**Worktree:** `/Users/gouthamrao/Documents/workspaces/lovable/udupi-property-explorer-worktrees/issue-1838-slice8-lazy-address-picker` (branch `issue-1838-slice8-lazy-address-picker`, off origin/main incl. merged 1-7).
**Investigation:** explorer-planner + architect (read-only). Both converged independently.

## HEADLINE FINDING F1 — the "server-authoritative" premise is FALSE (risk-changing)

The assignment/architecture-review's stated safety basis for lazy-mounting AddressPicker is: *"AddressPicker's meaningful state is server-authoritative (confirm/unconfirm → updateListing.mutate; all initial props from the listing prop); gating on currentStep===3 unmounts/remounts with no lost local state."* **This is not true against the current code.** AddressPicker holds meaningful UNSAVED instance-local state that the `listing` prop does NOT reflect and that is persisted to the server ONLY on an explicit confirm action:

- **Dragged-but-unconfirmed pin (the make-or-break case)** — `AddressPicker.tsx` `handleMarkerDragEnd`/`handleMapClick`/`handleUseMyLocation` (~332-388) all do `setPinPosition(newPos); setConfirmed(false); setDragged(true)` WITHOUT calling `onConfirm`. The new pin lives in local state until the broker clicks "Confirm Location" (`handleConfirmClick` ~443-466 → `onConfirm` → `updateListing.mutate`). On remount, `pinPosition` resets to `initialLatitude/initialLongitude` (last server-confirmed coords) — the dragged pin + its pending Confirm button vanish.
- **`localityOverridden` / reconciliation warning** (~151) — explicitly commented "Component-state only; not persisted." Lost on remount.
- **In-progress search** — `query`/`results`/`displayName`/`parsedAddress`; unselected typed text lost on remount.

Today (6a always-mounted `step-3-panel` wrapper) this in-flight state SURVIVES a step-away-and-back. **EditListingForm.tsx:581-583 documents this invariant verbatim: "always-mounted (display:none toggle, not conditional currentStep===3 &&) so AddressPicker's in-flight map state survives step navigation."** The spec'd Option A directly reverses slice 6a's documented rationale.

Verified file:line: `AddressPicker.tsx` local state ~136-167; drag handlers ~332-388; confirm ~443-466. `LocationStep.tsx` renders AddressPicker directly/unconditionally (~30-75). `EditListingForm.tsx` outer wrapper + call-site ~580-592 (LocationStep does NOT currently receive `currentStep`).

Note: explorer-planner suggested a backend-engineer consult for "server state contracts" — DISCOUNTED. There is no server-contract change here; the finding is purely client-side React mount semantics. No backend involvement needed (and backend-engineer is execution-forbidden for this slice anyway).

## Option analysis

| Design | Abandoner (never reaches step 3) | Completer (bounces steps) | In-flight pin state | Map re-init risk |
|---|---|---|---|---|
| Status quo (6a always-mounted) | Leaflet inits at wizard load | inits once | PRESERVED | none |
| **Option A (as specified — unmount on !==3)** | no init | **RE-INITS every return** | **LOST** (regression) | **yes** (Leaflet remount) |
| **Option C (mount-on-first-visit, never unmount)** | no init | inits once | PRESERVED | none |

Option A is *worse* than the status quo for the common case (a completing broker must reach step 3 to submit, and bounces between steps → re-inits Leaflet on every step-3 return) AND loses unsaved work. Option C achieves the assignment's stated INTENT ("avoid paying Leaflet's init cost for users who never reach step 3" + lighter initial wizard render) with ZERO correctness cost.

## DECISION D1 — REJECT Option A. Do NOT ship the unmount/remount gate.
Per the assignment's explicit instruction ("if the investigation finds AddressPicker holds meaningful local state that would be lost on unmount ... surface this explicitly to PLAN_REVIEW as a risk-changing finding — do not silently proceed"), Option A must not ship. It is a behavioural regression that reverses slice 6a's invariant.

## DECISION D2 — RECOMMEND Option C (mount-on-first-visit latch)
Latch the map's first mount on `currentStep===3` and NEVER unmount thereafter. LocationStep stays mounted (unchanged outer wrapper), so the latch persists across step navigation:
```tsx
const [hasMountedMap, setHasMountedMap] = useState(false);
useEffect(() => { if (currentStep === 3) setHasMountedMap(true); }, [currentStep]);
// ...
{hasMountedMap ? <AddressPicker .../> : <MapPlaceholder />}
```
- Defers Leaflet init until step 3 is first reached (abandoners pay nothing; initial wizard render lighter).
- NEVER unmounts once mounted → no state loss, no map re-init risk, no "container already initialized" risk.
- Bonus: mounting only while the panel is `display:block` sidesteps the "initialised while hidden (0×0)" NaN-center path that `MapFlyTo`'s `invalidateSize` guard (~66-84) papers over.
- Honest magnitude: for completers the map still inits exactly once (they must reach step 3 to submit) — the net win is (i) abandoners pay nothing and (ii) lighter step-1 initial render. Modest but strictly positive, zero downside.

## FALLBACK — close as no-op if the perf win isn't judged worth it
If PLAN_REVIEW / the user judges the modest perf win not worth ~5 LOC + a new prop + a placeholder, the correct outcome is to CLOSE THE SLICE AS NO-OP (Option A must not ship). This is a legitimate terminal outcome for the final substantive slice.

## Scope (Option C)
- `steps/LocationStep.tsx` — add a `currentStep` prop; the `hasMountedMap` latch (useState + useEffect); gate AddressPicker (with a lightweight `<MapPlaceholder/>` else-branch) — around AddressPicker ONLY, not the whole body (the "Save & Continue" button + `listing.addressConfirmed` gating stay always-rendered).
- `steps/__tests__/LocationStep.test.tsx` — ADDITIVE characterisation tests (add `currentStep` to baseProps default 3 so existing tests keep mounting the stub).
- `EditListingForm.tsx` — ONE line: thread `currentStep={currentStep}` to `<LocationStep/>` (read from the FROZEN slice-7 nav hook as a pure consumer). The outer `step-3-panel` display:none wrapper is NOT touched.
- FROZEN / untouched: the outer wrapper, PhotosStep/ImageUploader (out of scope + genuinely unsafe — in-flight uploads), useEditListingNavigation.ts (slice 7, read-only consumer), the other 4 step panels, the 5 domain hooks, buildUpdatePayload, the 5 EditListing anchors, AddressPicker.tsx itself (NOT modified — lifting its state to make Option A safe is a separate future change, explicitly out of scope).

## Test strategy (Option C) — mount-tracking stub
Extend LocationStep.test.tsx additively. Upgrade the AddressPicker stub to track mount/unmount + reflect listing-derived props on each mount:
```tsx
const mountSpy = vi.fn(); const unmountSpy = vi.fn();
vi.mock('@/components/broker/AddressPicker', () => ({
  AddressPicker: (props) => { React.useEffect(() => { mountSpy(); return () => unmountSpy(); }, []);
    return <div data-testid="address-picker-stub"><span data-testid="ap-lat">{props.initialLatitude}</span>{/* existing confirm/unconfirm/locality buttons */}</div>; },
}));
```
Characterisation tests (prove the latch invariant):
1. **Not mounted before first visit** — currentStep=1 → stub null; mountSpy not called.
2. **Mounts on first step-3 visit** — rerender currentStep=3 → stub present; mountSpy called once.
3. **STAYS mounted after navigating away (load-bearing)** — rerender 3→1 → stub STILL present; unmountSpy NEVER called. This is what proves no state loss / no re-init.
4. **Reflects server coords on mount** — initialLatitude from the listing prop appears in the stub.

NOTE (reviewer-relevant): an Option-A-style "confirm state persists across unmount/remount" test would PASS on the stub while completely FAILING to characterise the real regression (the dragged-but-unconfirmed pin lives in Leaflet-internal state the stub doesn't hold) — the regression is invisible to a stubbed test. Another reason to reject A. The 2 characterisation behaviours the roadmap asked for (confirm/unconfirm persists; map re-inits from server) are reframed under Option C as "state persists because the map is never unmounted" (test 3) + "server coords drive the single mount" (test 4).

## Code-review tier — OPUS (Decision D3)
~5 LOC, but the correctness argument is a subtle mount-semantics / unsaved-state question that directly REVERSES a prior slice's documented invariant. The reviewer must reason about what state is server-authoritative vs instance-local — sonnet is under-powered for that. (Contrast slice 7's sonnet: there the traps were narrow + test-pinned; here the trap is a premise-level safety reversal.)

## Risks (Option C)
- **R1 (HIGH → mitigated by choosing C) — unsaved-state loss.** Option A loses the dragged-unconfirmed pin. Option C eliminates this (never unmounts). If PLAN_REVIEW insists on Option A, this is a blocking safety regression.
- **R2 (LOW) — the latch never resets.** Intended: once mounted, stays mounted for the wizard session. Correct by design.
- **R3 (LOW) — anchor step-3 assertions.** An anchor asserting AddressPicker is in the DOM while on step 1/2 would now fail (it isn't mounted until step 3 first reached). Neither specialist found such an anchor, but the engineer MUST run the anchors GREEN at baseline + after and confirm. (explorer-planner could not locate EditListing.residential/agri/commercial/rent.test.tsx by path in the worktree — same as slice 7; the slice-7 engineer confirmed they exist + ran 96 tests. The engineer confirms the path at baseline.)
- **R4 (LOW) — prop threading.** currentStep threaded as one new LocationStep prop from EditListingForm (read-only from the frozen nav hook). tsc + anchors catch a miswire.
