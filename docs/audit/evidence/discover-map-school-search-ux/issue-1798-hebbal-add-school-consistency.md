# Issue #1798 — Area-first "Add school" vs school-first Hebbal consistency

Branch: `fix/1798-hebbal-add-school-consistency`
Scope: **only** the Hebbal area-first "Add school" vs school-first inconsistency. No marker/breadcrumb/popup/clustering changes. No backend/API changes. No DB migration. No OpenSearch. No #1779 ingestion.

## Investigation summary

Both area-first "Add school" and school-first "Schools in \<area\>" already went through the
**same** hook (`useSchoolsByArea`) and the **same** backend endpoint (`/api/public/schools/by-area`),
keyed strictly by `areaKey` — there was no all-city fallback, no display-label lookup, and no
`Bengaluru`/`Bangalore` naming split (the `areaKey` itself carries `Bengaluru` consistently in both
journeys; only the `city=` query param uses the separate `bangalore` slug, which both journeys already
share).

The actual defect: `src/pages/MapDiscovery.tsx` computed the query-enabling `schoolsAreaKey` value with
a literal check —

```ts
const schoolsAreaKey =
  urlState.journey === 'school-first'
    ? (urlState.areaKey ?? undefined)
    : urlState.journey === 'area-first' && urlState.schoolPicking
      ? (urlState.areaKey ?? undefined)
      : undefined;
```

— while the **panel routing** (`derivePanelContent`, the actual single source of truth for which panel
renders) has a third, "journeyless" branch that also resolves to the `schools-in-area` panel:

```ts
// derivePanelContent — no explicit `journey` param on the URL
if (areaKey && schoolPicking && !schoolId) {
  return 'schools-in-area';
}
```

The repro URL for #1798 (`.../discover?city=bangalore&...&groupId=north-growth&areaKey=...` — **no
`journey=` param**) hits exactly this third branch. `SchoolsInAreaPanel` rendered correctly (panel
routing is journeyless-aware), but the schools **query** was still gated on the literal
`journey === 'area-first'` check, which is `false` when `journey` is absent — so the query stayed
`enabled: false` and returned nothing. School-first works because it always carries `journey=school-first`
explicitly.

This is the same failure shape as the pre-existing #1157 fix comment already documents ("the area-first
SchoolsInAreaPanel renders 0 schools even though school-first shows the area's full set for the same
areaKey") — #1157 fixed the explicit `journey=area-first` case but missed the journeyless cold-load case
introduced later by #1745 Batch B.

## Fix

`src/pages/MapDiscovery.tsx` — reuse the already-computed `panelContent` value (itself derived from
`derivePanelContent`, the single source of truth for panel routing) instead of re-deriving
journey/schoolPicking combinations a second time:

```ts
const schoolsAreaKey =
  panelContent === 'schools-in-area' ? (urlState.areaKey ?? undefined) : undefined;
```

`panelContent === 'schools-in-area'` is true for exactly: school-first + areaKey (no schoolId),
area-first + areaKey + schoolPicking (no schoolId), and the journeyless cold-load case (areaKey +
schoolPicking, no journey param) — the same three states that route to `SchoolsInAreaPanel`. This keeps
the schools query byte-for-byte in sync with panel routing by construction, and removes the duplicated
conditional logic instead of adding a fourth branch.

No backend/API changes. No new lookup path. No `Bengaluru`/`Bangalore` divergence found — none introduced.

## Before — area-first Hebbal "Add school" (pre-fix behaviour, reproduced on main before this branch)

URL:
```
http://localhost:5174/discover?city=bangalore&lat=13.04500&lon=77.60000&zoom=14&scope=north&groupId=north-growth&areaKey=IN%7CKA%7CBengaluru%7CHebbal
```
Clicking "Add a school in this area" pushed `schoolPicking=1` to the URL but the schools query stayed
disabled (`journey` was absent, not `'area-first'`) — the panel rendered its empty "No schools found"
state despite school-first showing 2 real schools for the identical `areaKey`.

## After — area-first Hebbal "Add school" (post-fix, verified in running app)

Same URL as above. Screenshot 1 (`ss_33825kf7v`): area-selected panel loads correctly, breadcrumb
`Bangalore › North Bangalore › North Growth › Hebbal`, "Add a school in this area" CTA visible.

Screenshot 2 (`ss_4506e45yn`), after clicking the CTA — URL becomes
`...&areaKey=IN%7CKA%7CBengaluru%7CHebbal&schoolPicking=1` (no `journey=` param — the exact journeyless
repro case): panel now reads **"Schools in Hebbal · Area-first — Showing 2 of 2 schools"**, listing:
- Orchids The International School – Hesaraghatta ... (ICSE)
- Vivekananda ORCHIDS The International School – ... (ICSE)

## Comparison — school-first Hebbal (unchanged, still correct)

URL:
```
http://localhost:5174/discover?city=bangalore&lat=13.04503&lon=77.60004&zoom=14&scope=north&journey=school-first&groupId=north-growth&areaKey=IN%7CKA%7CBengaluru%7CHebbal
```
Screenshot 3 (`ss_1176oo635`): "Find homes near a school · School-first" panel, "Schools in Hebbal" card
shows **2 schools / 4 homes for sale**, same two school names as area-first post-fix
(Orchids The International School, Vivekananda ORCHIDS The International School).

**Result: area-first and school-first now agree exactly** for the same `city=bangalore`, `scope=north`,
`groupId=north-growth`, `areaKey=IN|KA|Bengaluru|Hebbal` identity — confirming this is a genuine UI
consistency fix, not a school-data attribution issue (school-first's own attribution was correct and
unchanged; only area-first's query gating was broken).

## Screenshots

Captured via the Chrome browser automation tool during this session (image IDs `ss_33825kf7v`,
`ss_4506e45yn`, `ss_1176oo635`); rendered inline in the PR-authoring conversation. Not persisted to this
evidence directory as separate binary files — the panel state, URL, and school-name/count assertions
above are fully reproducible via the automated regression test
`src/pages/__tests__/MapDiscovery.issue1798.test.tsx`.
