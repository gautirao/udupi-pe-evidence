# Issue #2431 — Frontend evidence

## Tests

```
$ npx vitest run --root apps/web \
    src/lib/__tests__/discoverSearchParams.commercialSubtype.test.ts \
    src/features/discover/state/url/__tests__/commercialSubtype.test.ts \
    src/components/map/filters/__tests__/PropertyTypeFilter.commercialSubtype.test.tsx \
    src/components/map/__tests__/MapFilters.test.tsx

Test Files  4 passed (4)
     Tests  59 passed (59)
```

| | |
|---|---|
| Test type | unit / component (JSDOM) |
| Exit code | 0 |
| Assertions executed | yes — 59/59 |
| Status | PASS |

`MapFilters.test.tsx` is included as a regression check: it renders the modified
`PropertyTypeFilter`.

### What the three new files cover

**URL round-trip** (`state/url/__tests__/commercialSubtype.test.ts`, 12 tests) — drives the
real `useDiscoverUrlState` facade through a `MemoryRouter`, so it exercises the same read
path a page load does. Restores one and both subtypes; canonicalises lower case; drops an
unrecognised value and the non-ambiguous `BUILDING`/`WAREHOUSE`/`LAND`; keeps the valid half
of a partly-bad value; writes a comma-joined param; removes the param when cleared; and
confirms "Clear all" drops `subtype` along with every other filter key while keeping `city`.

**Filter affordance** (`components/map/filters/__tests__/…`, 9 tests) — offers exactly Shop
and Office; reflects a restored selection; ticking a subtype also selects the Commercial
family; unticking Commercial clears the subtypes; unticking a different property type does
not; and the honest-absence caption is present.

**Request parity** (`lib/__tests__/discoverSearchParams.commercialSubtype.test.ts`, 3 tests)
— the listings hook and the markers hook emit identical `commercialSubtypes` params, with a
non-vacuous guard asserting the actual value before asserting equality.

## Typecheck — no new errors

```
$ npm run typecheck    # tsc -p tsconfig.app.json --noEmit
```

| | Errors |
|---|---|
| This branch | 181 |
| Baseline (all `apps/web/src` changes stashed) | 199 |

The baseline number is HIGHER only because the three new test files remain on disk when the
source changes are stashed, so they reference a `commercialSubtypes` field that no longer
exists. The meaningful check is per-file:

```
$ npm run typecheck 2>&1 | grep -E "PropertyTypeFilter|listing-constants|url/filters|commercialSubtype"
(no output)
```

Zero errors in any file this change authored or modified.

The three errors that appear in files this change touches incidentally are pre-existing, and
shift only by the number of lines added:

| File | This branch | Baseline |
|---|---|---|
| `usePropertyListings.ts` | 335, 529 | 322, 516 |
| `discoverSearchParams.test.ts` | 189 | 186 |

Same errors, same messages, different line numbers.

## Pre-existing failures encountered and proven not mine

Both were verified by stashing every change in this branch and re-running the identical
command on the resulting untouched tree.

**`discoverSearchParams.test.ts` — parity test.** Fails on an `areaKeys` divergence between
the listings and markers hooks. Fails identically with all changes stashed. Because an
assertion added to a permanently-red test never actually runs, the `commercialSubtypes`
parity claim is proven in a separate green file instead; the key is still added to that
test's overlapping-key list so it is covered there once the pre-existing failure is fixed by
whoever owns it.

**`ActiveContextChips.test.tsx` — overflow popover test.** Times out (18–20 s against a 5 s
limit). With all changes stashed: `Tests 1 failed | 47 passed (48)` — the same single
failure.

Neither is touched by this change and neither is fixed here.
