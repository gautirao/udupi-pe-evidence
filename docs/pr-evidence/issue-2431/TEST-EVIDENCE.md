# Issue #2431 — Test evidence

Every row records the command actually run and its actual exit code. Nothing is
recorded as passing unless the command exited 0 **and** the assertions ran.

## Backend integration test (real Postgres, Testcontainers)

```
$ mvn -f apps/api/pom.xml test -Dtest=CommercialSubtypeFilter2431IT -DfailIfNoTests=true
Tests run: 14, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

| | |
|---|---|
| Test type | integration (real `postgis/postgis:15-3.4` container) |
| Exit code | 0 |
| Assertions executed | yes — 14/14 |
| Status | PASS |

Covers: subtype present on the DTO for a seeded Shop and Office; stored lower-case
canonicalised on read; the `LEFT JOIN` does not multiply page rows; `SHOP` and
`OFFICE` each return only their own members; input case-insensitivity; selecting both
subtypes does **not** collapse to "no filter"; omitting the param leaves membership
unchanged; markers and listings agree by id for all three filter shapes; markers
exclude legacy NULL rows; a contradictory property-type combination returns zero;
unknown values, `BUILDING`/`WAREHOUSE`/`LAND`, an empty list and an over-long list all
reject with 400 on both endpoints.

## HTTP binding — the gap the integration test cannot see

`CommercialSubtypeFilter2431IT` invokes the controller **method** directly, so it proves SQL
semantics but is blind to Spring's request binding. A typo in the `@RequestParam` name, or a
param that never reaches the query object, would pass that test and fail in production.

Eight tests were added to the existing `DiscoverListingsControllerTest` (a `@WebMvcTest`, so
the parameter is bound from a real query string):

```
$ mvn -f apps/api/pom.xml test -Dtest=DiscoverListingsControllerTest
Tests run: 45, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

Covers: single value binds and reaches the query object; a repeated param binds both values;
an absent param arrives as null; unknown, non-ambiguous and over-long values each return 400
**and never call the service** (asserted as a side effect, not just a status code); the
subtype is serialised onto the response JSON when present; and it is **absent from the JSON
entirely** — not `null` — when the listing has no recorded subtype.

### Mutation — proof the binding tests actually bind

`@RequestParam(name = "commercialSubtypes")` → `"commercialSubTypes"` (one character):

```
Tests run: 45, Failures: 5, Errors: 0
BUILD FAILURE
```

Five tests killed by a single-character typo. Reverted; `git diff --stat` on the controller
returns empty, and the combined suite is green:

```
$ mvn test -Dtest='DiscoverListingsControllerTest,CommercialSubtypeFilter2431IT,DiscoverMarkersControllerTest'
Tests run: 96, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

## Mutation testing — proof the assertions are not vacuous

A green suite proves nothing if the assertions cannot fail. Two mutations were applied
to the shipped predicate, the suite re-run against each, and the mutation reverted.

### Mutation A — drop the `UPPER()` column normalisation

`UPPER(lcsd.commercial_subtype) IN (...)` → `lcsd.commercial_subtype IN (...)`

```
Tests run: 14, Failures: 2, Errors: 0
  filter_shop_returnsOnlyShops
  filter_bothSubtypes_doesNotCollapseToNoFilter
BUILD FAILURE
```

Two tests killed. The `UPPER()` is load-bearing, not decoration.

### Mutation B — classify a legacy NULL subtype as SHOP (the "guess it" bug)

`UPPER(lcsd.commercial_subtype) IN (...)` →
`COALESCE(UPPER(lcsd.commercial_subtype), 'SHOP') IN (...)`

```
Tests run: 14, Failures: 3, Errors: 0
  filter_shop_returnsOnlyShops
  filter_bothSubtypes_doesNotCollapseToNoFilter
  markers_excludeLegacyNullSubtype
BUILD FAILURE
```

Three tests killed, on both the cards path and the markers path. The central claim of
this issue — that a legacy commercial row is never silently classified as Shop or
Office — is genuinely enforced by the suite rather than merely asserted in a comment.

### Revert verified

```
$ git diff --stat HEAD -- .../DiscoverListingPredicateBuilder.java
(no output — byte-identical to the committed version)

$ mvn -f apps/api/pom.xml test -Dtest=CommercialSubtypeFilter2431IT
Tests run: 14, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

## Regression suite — apples-to-apples baseline

The Discover / navigation / markers / area-group / summary suites were run **twice**:
once on this branch, and once on a clean detached worktree at the base commit
`e80865da`, using the byte-identical command.

```
$ mvn -f apps/api/pom.xml test -Dtest='Discover*,*Navigation*,*Marker*,*AreaGroup*,*Summary*' -DfailIfNoTests=false
```

| | This branch | Clean base `e80865da` |
|---|---|---|
| Tests run | 843 | 843 |
| Failures | 5 | 5 |
| Errors | 11 | 11 |

Failing classes, identical in both runs:

| Class | Failures | Errors |
|---|---|---|
| `DiscoverSummaryServiceIT` | 1 | 0 |
| `EndToEndNavigationPipelineIT` | 1 | 0 |
| `NavigationResolveIT` | 3 | 1 |
| `DiscoverRateLimitFilterTest` | 0 | 10 |

**Verdict: PRE-EXISTING, not introduced here.** The signature is identical on an
untouched checkout of the base commit.

The `DiscoverRateLimitFilterTest` errors are a `@WebMvcTest` slice that does not
register a `NavigationGraphCache` bean, which `DiscoverListingsController` has required
since #2087:

```
NoSuchBeanDefinitionException: No qualifying bean of type
'com.example.realestate.discover.navigation.NavigationGraphCache' available
```

This change adds no constructor dependency to either controller — only a request
param — so it cannot be the cause, and the baseline run confirms it is not.

## Compile

| Step | Command | Exit |
|---|---|---|
| Backend main | `mvn -q compile` | 0 |
| Backend tests | `mvn -q test-compile` | 0 |
