# Slice 6b — DescribeStep extraction: design evidence

**Issue:** #1838 · sub-slice 6b (`slice-6b-describe-step`) · the FINAL PR of roadmap row 6 "Presentational step panels"
**Risk:** medium (slice) / high-risk (programme). Largest single-panel extraction in the programme.
**Worktree:** `/Users/gouthamrao/Documents/workspaces/lovable/udupi-property-explorer-worktrees/issue-1838-slice6b-describe-step` (branch `issue-1838-slice6b-describe-step`, off origin/main incl. merged 6a).
**Investigation:** explorer-planner + architect (read-only). This doc is the measured baseline the plan cites.

## 1. Measurement (post-6a, current EditListingForm.tsx)

- **DescribeStep / step-1 render block: lines 600–1554 (955 LOC).** The extractable inner content is the single `<form onSubmit={handleStep1Save} className="space-y-6">` at 601–1553.
- Confirmed the ONLY remaining large inline step block — PhotosStep/LocationStep/BoundaryStep/ReviewStep are now `<PhotosStep/>` etc. component calls (6a, merged).
- Three visual sections inside the form: "Listing basics" (property type / listing purpose), "Property details" (the field-dense middle, ~624–1499, ~875 LOC — where ~92% of the misrouting risk lives), "Listing information" (title / locality / price / description).

## 2. Mount semantics — PRESERVE VERBATIM (but R1 is lower-severity than 6a)

- Current wrapper (line 600): `<div data-testid="step-1-panel" style={{ display: currentStep === 1 ? 'block' : 'none' }}>` — **ALWAYS-MOUNTED, display:none toggle** (not `currentStep === 1 &&`).
- **Preserve this wrapper byte-identical in the PARENT**; `<DescribeStep/>` is its inner content. Do NOT convert to a conditional mount, do NOT move the wrapper into the panel.
- **Severity assessment:** unlike 6a's PhotosStep (ImageUploader upload state) / LocationStep (AddressPicker map state), DescribeStep's children are ALL controlled inputs whose source of truth is parent state (`value`/`onChange` every keystroke). AreaField/PriceField seed internal state from `initialArea`/`initialRupees` props reflecting the last-saved parent value — a remount would re-seed identically, so there is no in-flight state to lose. The always-mounted wrapper must still be preserved (frozen anchor + guard test), but the code-reviewer's attention budget should go to prop-routing (§5), not this.

## 3. Prop surface — the reframe that keeps the audit tractable

The "~80 props" figure counts **destructured hook internals**, not the prop interface. Under the 6a Decision-#2 hook-result-object pattern, DescribeStep's ACTUAL interface is **~34 props**:
- **5 composed hook-result objects** — `agri / commercial / rent / residential / shared` as `ReturnType<typeof useX>` (type-only imports). These are **misrouting-safe by construction** (`agri={agri}` cannot be miswired), collapsing ~130 of the ~150 potential mis-wires off the audit surface. DescribeStep is the FIRST/ONLY consumer of the 5-hook pattern (the 4 6a panels read `listing`, not the hooks).
- **~25 flat base scalars/setters** (parent `useState`) — mirror ReviewStep's realized flat-prop style: `title/setTitle/setTitleManuallyEdited`, `description/setDescription`, `priceRupees/setPriceRupees`, `propertyType/setPropertyType`, `locality/setLocality`, `landArea/setLandArea/landAreaUnit/setLandAreaUnit`, `bedrooms/setBedrooms`, `builtArea/setBuiltArea/builtAreaUnit/setBuiltAreaUnit`, `reraNumber/setReraNumber`, `listingPurpose/setListingPurpose`. Flat identity-pairs are `tsc`-checkable (string-setter vs number-setter differ) and eye-scannable at the call site.
- **2 derived flags** — `fieldVisible: (key) => boolean` + `isCommercialType: boolean` (both computed in the PARENT; §4).
- **2 handlers** — `handleStep1Save`, `updateListing` (mutation hook result).

### Decision D1 — prop shape: 5 hook objects + FLAT base scalars. REJECT section-bags.
A `basics`/`details`/`info` bag would require the parent to hand-build an object literal (`base={{ title, setTitle, ... }}`), which **re-introduces exactly the misrouting risk the bag claims to remove** (a `title: setDescription` typo) and loses the "pre-assembled from a hook" safety property. So: hook objects for domains (safe by construction), flat props for residual scalars (mirror `steps/ReviewStep.tsx`).

### Byte-identity mechanism
Inside DescribeStep, a **destructuring preamble** reproduces the parent's current destructures verbatim (`const { carpetArea, ... } = shared.values; const { setCarpetArea, ... } = shared.setters;` etc.) so every bare identifier the JSX uses is restored and the moved `<form>` relocates with ZERO token changes. Module-scope consts the JSX reads (label maps `LAND_CATEGORY_LABELS`/`FACING_OPTIONS`/`APARTMENT_AMENITY_OPTIONS`/chip option arrays, and the pure `KNOWN_*` lists derived via `Object.keys(...)`) are RE-IMPORTED / re-derived at DescribeStep module scope (mirrors PhotosStep re-importing `extractYouTubeId`), NOT threaded as props.

## 4. fieldVisible / conditional visibility — stays in parent

- `fieldVisible` (parent line ~331) closes over `propertyType` + `listingPurpose` → `isListingFieldVisible(...)` reading the FROZEN `listingFieldConfig.ts` CONFIG_MAP. Thread it as a **function prop**; never recompute inside the panel.
- Also thread **`isCommercialType`** (bool) and **`propertyType`** (already a base prop — needed for direct `propertyType === 'apartment'` checks, the AreaField `propertyType` prop, the totalFloors house/villa branch ~1213, amenities-list selection ~1024, RERA block ~1486).
- **Do NOT thread `showLandArea`/`showBuiltArea`/`isRent`** — verified NONE appear in the step-1 JSX (used only in `handleStep1Save`/`buildUpdatePayload`, which stay in the parent). The JSX gates land/built area via `fieldVisible('landArea')`/`fieldVisible('builtArea')`. Threading them = dead props.

## 5. Headline risk — prop MISROUTING (type-invisible AND anchor-invisible)

Residual risk after the hook-object collapse lives in ~30 flat identity-pairs and, critically, TWO structurally-identical tri-state Select grids + adjacent same-option chip groups:
- **Boolean Select grid A (lines ~986–1015):** 7 booleans hasLift / hasPowerBackup / isGated / hasGarden / hasTerrace / hasCompound / hasServantRoom.
- **Boolean Select grid B (lines ~1125–1152):** 6 booleans isCornerPlot / hasBoundaryWall / isGatedLayout / hasWaterConnection / hasElectricityConnection / hasDrainage.
- Both driven by `[key, label, val, setter]` tuples — a swapped tuple (e.g. `hasGarden` wired to `setHasTerrace`) is **invisible to tsc** (all same type) and **invisible to the full-form anchors** (they don't toggle every boolean).
- **Adjacent same-option chip groups:** bathrooms/balconies, parking2wCount/parking4wCount (identical option sets, setters differ only by suffix).
- **One non-identity wiring:** `maintenanceIncluded` value transform (~1433–1434, `'INCLUDED' ↔ 'true'`) must be preserved both directions.

### Decision D2 — single PR. Confirmed.
One contiguous `<form>` under one wrapper. A basics/details/info split peels off only trivial wrappers and leaves the monster middle section intact (no audit benefit), while adding component boundaries inside one `<form>` (threatens byte-identity / mounted tree) or serializing 3 PRs on one contiguous block (rebase churn). REJECT. Also REJECT (log as slice-7+ cleanup) extracting the two identical Select grids into a shared `BooleanSelectGrid` helper — it rewrites JSX/DOM and breaks byte-identity.

## 6. Test strategy

**Regression net:** the 4 full-form anchors (EditListing.residential/agri/commercial/rent.test.tsx) render the whole form in situ and MUST pass **unchanged** before/after — RED-FLAG any non-additive edit. + EditListing.guard.test.tsx (unmodified) + buildUpdatePayload.test.ts (frozen).

**NEW `steps/__tests__/DescribeStep.test.tsx`** — targets what the anchors miss (the type-invisible, structurally-identical wirings):
1. **Headline:** for EACH boolean in both Select grids (A: 7, B: 6), change its Select and assert ONLY its own setter fires with the expected value.
2. Adjacent same-option chip groups (bathrooms/balconies, parking2w/4w): each writes its own setter.
3. `maintenanceIncluded` value transform preserved both directions.
4. **Value round-trip** (catches value-side misrouting, not just setters): seed e.g. `agri.values.waterSource='BOREWELL'`, assert the Select shows "Borewell"; likewise one residential field.
5. **fieldVisible threading:** `propertyType='land'` → residential/apartment fields absent; switch to `'apartment'` → bedrooms/bathrooms/amenities appear + amenities uses APARTMENT list. Confirms flags are wired, not recomputed.

### Decision D3 — heavy-child mocking (adjudicated divergence)
explorer-planner recommended mocking PropertyTypeCardSelector/AreaField/PriceField (conservative #1837 posture). architect found DescribeStep holds **NO map/canvas/upload/network child** (no ImageUploader/AddressPicker/BoundaryDrawStep class), so per #1837 no heavy-child mock is *required* for OOM safety, and rendering the REAL controlled children exercises true wiring (the whole point of a misrouting test). **Adjudication (plan author):** the #1837 OOM root cause was an UNSTABLE mock of a genuinely heavy child, not the absence of a mock. DescribeStep has no OOM-class child. So the new test SHOULD render real controlled children (they are cheap in JSDOM and rendering them is what validates prop routing); IF any child is stubbed for isolation, it MUST use a STABLE module-scope `vi.mock` identity (never an inline/unstable factory). This is surfaced to PLAN_REVIEW as a boundary decision. Note: existing anchors already stub AreaField/PriceField via stable module mocks — the new test may reuse that approach for those two if convenient, but must render the boolean Selects/chip groups real (they ARE the audit target).

## 7. Import prune (large surface — reference-check each)
Removing from the parent only imports with no remaining parent reference (post-extraction). Large candidate set: `Select*`, `Textarea`, `Input`, `Label`, `PriceField`, `AreaField`, `SingleChipGroup`/`MultiChipGroup`, `PropertyTypeCardSelector`, `ListingPurposeToggle`, all `*_OPTIONS`/`*_LABELS`, `Loader2`. KEEP `AlertTriangle`/`Badge`/`Alert`/`StepIndicator` (used outside step-1). `handleStep1Save` references the *values* + `buildListingUpdatePayload`, NOT the option lists — so option-list imports move to the panel. Verify each candidate individually.

## 8. Code-review tier — OPUS (both specialists concur)
"Route slice 6b to an opus code-review override — the mechanical JSX relocation is sonnet-tractable, but the ~34-prop / ~80-identifier DescribeStep wiring contains two structurally-identical tri-state Select grids and adjacent same-option chip groups whose misrouting is both type-invisible and full-form-anchor-invisible; that per-identifier routing audit is precisely the subtle, high-consequence review an opus tier is warranted for."

## 9. Specialist sequence (proposed)
qa-fast → frontend-engineer → **code-reviewer (OPUS override)** → qa (verification). security-reviewer NOT_REQUIRED (no Gate F — presentational render extraction). e2e NOT_REQUIRED (byte-identical render relocation; 4 full-form anchors + new DescribeStep RTL test provide the signal).

## 10. Risks
- **R1 (MED, was HIGH in 6a) — always-mounted wrapper:** preserve verbatim; but genuinely lower-severity (controlled inputs, no in-flight state). Mitigation: hard_constraint + wrapper stays in parent.
- **R2 (HIGH, headline) — prop misrouting in the two boolean Select grids + adjacent chip groups:** type-invisible + anchor-invisible. Mitigation: hook-object props collapse most of the surface; new DescribeStep test asserts per-boolean setter isolation + value round-trip; OPUS code-review per-identifier audit.
- **R3 (MED) — byte-identity drift** across 955 relocated LOC: destructuring preamble + module-const re-import + whitespace-insensitive diff + anchors green.
- **R4 (MED) — import prune error** (large surface): per-candidate reference check + tsc/lint/build.
- **R5 (LOW) — test over-mocking** hiding a real misrouting: D3 — render real controlled children; stable mock only if needed.
