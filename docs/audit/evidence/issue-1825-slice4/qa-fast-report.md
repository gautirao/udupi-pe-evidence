# qa-fast pre-implementation report — issue #1825 Slice 4 (Cluster C)

Verdict: PASS. All 4 fixes confirmed smallest-surface + TEST-ONLY (zero product/source change). E2E authoring: NO.

## 1. listingFieldConfig.test.ts — OK
Current expected (10): `['landArea','waterSource','soilType','roadAccess','cultivationStatus','ownershipType','surveyNumber','landCategory','farmhouseAvailable','fencingDone']`. Product (listingFieldConfig.ts:305): `['landArea', ...AGRI_FIELDS(9), ...AGRI_FACING_FIELD(['facing'])]` = 11 (#1627). Fix: add `'facing'`, "(10 total)"→"(11 total)", keep assertExactFields strict.

## 2. routeAccess.test.ts — OK
Line 94 residential→false; product routeAccess.ts:99-100 intentionally allows it (#1719), mirrors commercial sibling (test 11 line 76 → true). git-blame: guard cbc5bf8e9 (07-03 10:10) < residential-allow 278954389 (07-03 18:00). Fix: line 94 → `.toBe(true)` + comment; lines 95-96 (non-routes /new/commercial/extra + /newcommercial) stay false/unchanged.

## 3. areaMarkerBucketing.test.ts — OK
Line 207 >=10; probe reps=8, all 4 quadrant edges present (guarantee holds). Product areaMarkerBucketing.ts:369-386 = #1815 collision-demotion (intended fewer reps). Fix: line 207 →`toBeGreaterThanOrEqual(8)`, keep `<=12`, update "~10-12"→"~8-12 (#1815 collision-demotion)"; keep quadrant asserts 213-217 + clusters + allAreaIds strict.

## 4. LandingPage.test.tsx — OK (unconfirmed detail RESOLVED)
The two Saved links are in RoleAwareHeader (src/components/layout/AppLayout.tsx:89-96) `userRoleNavigation`:
- `{ name: 'Saved', href: '/saved-areas', icon: Bookmark }`
- `{ name: 'Saved homes', href: '/saved-homes', icon: Heart }`  // #1566
Line 101 `getByRole('link',{name:/Saved/i})` matches BOTH (substring). Fix:
- line 101 → `expect(screen.getByRole('link', { name: /^Saved$/i })).toHaveAttribute('href', '/saved-areas');`
- ADD: `expect(screen.getByRole('link', { name: /Saved homes/i })).toHaveAttribute('href', '/saved-homes');`
- anon test line 95 (`queryByRole /^Saved$/i` absent) already exact-match → stays green (does not match "Saved homes").

All fixes tie to documented product intent (#1627, #1719, #1815, #1566). Confidence: High.
