# E2E retirement assertion map - PR-6 batch B (auth / security / anon seam)

Issue #2836 (parent #2750), Stage B2 FINAL. Base `182d8d61`. Final statuses per owner ruling comment 6246476795 (https://github.com/gautirao/udupi-property-explorer/pull/2846#issuecomment-6246476795): S1 and A1 RETIRED (deleted in B2), subject to canonical T2 / T11 + harness smoke passing in both CP4 gate runs (the Team Lead records them after the gate); S2 and A2 retained, manifest `SCHEDULED(PR-7)`. The B1 text below is kept as the review record; the "Preliminary verdict" lines are superseded by the final statuses here.
Line numbers in the "legacy lines" column are legacy-spec lines at base. Evidence (gitignored handoff dir `.claude/handoffs/issue-2836/evidence/`): `mut/register.tsv` + `mut/MUT-Bnn/{mut.diff,red.log,red.exit,green.log,green.exit,revert-check.txt,result.toml}`, `b1/tests.tsv` + `b1/logs/`, `b1/n5-n6-resolution.md`, `b1/eslint.exit`, `b1/inventory-check.exit`.

Verdict words follow `[retirement_rule]` of the approved plan. `COVERED_EXISTING` / `COVERED_NEW`: the covering test passes at the B1 head and every MUT tied to the row is KILLED. `COVERED_CANONICAL`: owned by a canonical T-test, NOT_RUN at B1, proven only by the two CP4 gate runs. `OBSOLETE`: no product assertion (reason recorded; confirmed by reviewers at CP2). `LOSS`: nothing citable asserts it. `OUT_OF_SCOPE_COMPOSITION`: needs page composition, so the spec is KEEP. A `SURVIVED` or `INVALID` MUT is never relabelled covered. There were none in B1.

## Per-spec index

| spec | anchor | final status (B2; the B1 column header was 'preliminary verdict') | pending |
|---|---|---|---|
| `e2e/auth-open-redirect-hardening-2232.spec.ts` (S1) | [`#auth-open-redirect-hardening-2232`](#auth-open-redirect-hardening-2232) | **RETIRED** (owner 6246476795): S1-1..S1-6 and S1-8 covered with every tied MUT KILLED, S1-7 OBSOLETE; S1-8 APPROVED by the security-reviewer | canonical T2 in both CP4 gate runs (S1-6), recorded by the Team Lead |
| `e2e/discover/issue-1956-pr4-price-auth-contract.spec.ts` (S2) | [`#issue-1956-pr4-price-auth-contract`](#issue-1956-pr4-price-auth-contract) | **RETAINED** (SCHEDULED(PR-7)): S2-2 (and the areaKeys and `intent` -> `listingPurpose` halves of S2-7 / S2-16) is OUT_OF_SCOPE_COMPOSITION; the other 15 rows are covered / obsolete | none; security-reviewer REJECT_WITH_KEEP S2-2/S2-7 |
| `e2e/journey/anon-teaser.spec.ts` (A1) | [`#anon-teaser`](#anon-teaser) | **RETIRED** (owner 6246476795, A1-2 ACCEPTED): 5 OBSOLETE, 1 COVERED_CANONICAL, 8 covered with every tied MUT KILLED, 1 LOSS (A1-2, accepted) | canonical T2 (A1-14), T11 and the harness smoke (A1-6) in both CP4 gate runs, recorded by the Team Lead |
| `e2e/discover-commercial-card-summary.spec.ts` (A2) | [`#discover-commercial-card-summary`](#discover-commercial-card-summary) | **RETAINED whole** (SCHEDULED(PR-7); A2-2 is OUT_OF_SCOPE_COMPOSITION, A2-5 UNCOVERED) | none |

## New and extended tests (B1)

| id | file | its | result at B1 head |
|---|---|---|---|
| N1 | `apps/web/src/pages/__tests__/Auth.returnToMatrix2836.test.tsx` | 38: 6 hostile values x {returnTo, redirect} for the authed navigate and for the anon OAuth redirectTo, 2 accept arms x 2 params, S1-8 sub-arm (6 hostile + 1 control), location-spy canary | 38/38, exit 0 |
| N2 | `apps/web/src/pages/__tests__/AuthCallback.returnToMatrix2836.test.tsx` | 16: 6 hostile on the existing-session path (:32) and on the onAuthStateChange path (:39), accept arms, canary | 16/16, exit 0 |
| N3 | `apps/api/.../CityAreaListingsServiceTest.java` (extended) | +10 (5 parameterized methods x area path / bbox path), each asserting the full positional bind sequence (Codex-1): rent binds `'rent'`, sale binds `'sale'`, padded purpose trimmed, null and blank add no clause | 33/33, exit 0 |
| N4 | `apps/api/.../CityAreaListingsIT.java` (extended) | +3: Bearer `test-token` -> isAuthenticated=true + Cache-Control exactly `no-store`, no header -> anon + Cache-Control exactly `max-age=60, public` (both exact via `is(...)`, Codex-1 sibling recheck), rejected token -> 401 and the service is never called | 12/12, exit 0 |
| N5 | `.../results/__tests__/useAreaLeafResultSource.test.ts` (extended) | +4 positive-arm its for the fallback producer | 8/8, exit 0 |
| N6 | `apps/web/src/hooks/__tests__/useDiscoverCityListings.requestShape2836.test.ts` | 4: `listingPurpose=rent` on the wire, sale control, absent without intent, signed-in rent + Bearer | 4/4, exit 0 |
| N7 | `.../layout/__tests__/RoleAwareHeader.anonSignInReturnTo2836.test.tsx` | 7: desktop href (exact), control href, click -> `openAuthModal({returnTo})`, sheet closed precondition, mobile sheet href, control, click | 7/7, exit 0 |
| N8 | `apps/web/src/lib/__tests__/discoverMappers.test.ts` (extended) | +4: exact facts + subtype, zero-valued fact, null control, residential | 22/22, exit 0 |

Notes on how the tests are built:
- N1 mocks only the supabase client and `useNavigate`. The REAL `Auth` page, `AuthProvider` and `AuthForms` run. The anon "forwarded prop === null" row is therefore asserted by its observable consequence in the real `AuthForms`: the OAuth `redirectTo` is exactly `<origin>/auth/callback` with no `returnTo`. `Auth.consumerInvariant.test.tsx` (b) still captures the prop directly.
- The location spies replace `window.location` wholesale (same technique as the consumerInvariant files). The first `it` of N1 and of N2 is a canary that writes `href`, `assign` and `replace` and asserts the spies saw them, so every "never written" assertion is live.
- Hostile list = the 5 legacy values + bare host `evil.com`. The sixth value exists because the scheme regex at `authUtils.ts:50` still rejects `https://evil.com` when the leading-slash check at `:43` is removed; only a value with no slash and no scheme separates them (MUT-B31).
- N4 stubs `JwtDecoder` (a `@MockitoBean`), so it proves filter wiring and the `isAuthenticated` mapping through the production `JwtConfig` chain, NOT signature validation. The rejected-token arm observed status 401 (exact `isUnauthorized()`). Sibling recheck (Codex-1 addendum): the service verify pins `eq(true)` / `eq(false)` at the isAuthenticated slot with the other args `any()`/`isNull()`; the Cache-Control assertions were contains-based and are now exact (MUT-B11p/B11q). N6 (`useDiscoverCityListings.requestShape2836.test.ts:77-78, 84-86, 102`) was already exact: URL-parsed `getAll("listingPurpose")` `toEqual(["rent"])` / `["sale"]` and `getAll("areaKeys")` `toEqual([AREA_KEY])`, Bearer header `toBe("Bearer test-token")`; no change and no MUT.
- N3 asserts `pl.listing_purpose = ?` as a BOUND parameter (`'rent'` is not in the SQL text), on the area path (`CityAreaListingsService.java:341`) and on the bbox-only path (`:1138`).

## MUT outcomes (41 register lines: 32 plan ids; B08b, B16a/b, B19a/b are sub-MUTs; B09p, B10p, B09-r2, B10-r2, B11p, B11q added by the Codex-1 fix pass)

41 run serially, 41 KILLED, 0 SURVIVED, 0 INVALID, 0 NOT_APPLICABLE. Each went RED (exit 1) and was reverted with the file hash back to base, then GREEN at the base count. For MUT-B09p, B10p, B11p and B11q no expected-RED list was written down before the run (`expected_red_tests = UNRECORDED`), and for those four plus MUT-B09-r2 and B10-r2 the revert time was not recorded (`reverted_utc = UNRECORDED`). In every case the failing tests were exactly the strengthened N3/N4 arms the mutation targets. Deviation from the plan wording: `revert-check.txt` scopes `git diff --stat` to the target file, because the working tree intentionally holds the uncommitted new tests. `mvn clean test` ran for every Java RED and GREEN (`tests_run` 89 in both). Observations worth keeping:
- MUT-B31 (drop the leading-`/` requirement): killed by the bare-host rows of N1/N2 (10 failures) and the existing `rejects a bare host with no leading slash`. The `https://evil.com` rows do not fail under it, which confirms the sixth value was necessary.
- MUT-B32 (`Auth.tsx:31` uses the raw `returnTo`): 21 failures: 6 S1-8 sub-arm its, 12 authed matrix its, 3 existing `Auth.consumerInvariant` its. **The S1-8 sub-arm itself kills it** (all six hostile sub-arm its are red), as do the authed matrix rows and the existing invariant file.
- MUT-B06 (`explicitTarget = null`): `Auth.consumerInvariant` (a) stays GREEN (default landing is also `/discover`, which is why the query-string accept arm exists); 9 failures elsewhere.
- MUT-B09 (area-path purpose clause removed): only the 3 N3 `[1]` its fail. MUT-B10: only the 3 N3 `[2]` its. No existing test went RED, which proves the S2-9 gap. Codex-1 (4303980719): the original N3 pinned only the clause text and `containsOnlyOnce("rent")`, so it could not see a mis-slotted bind. N3 now asserts the COMPLETE positional bind sequence per path (area `[purpose?, city, areaKey, 5]`, bbox `[city, west, south, east, north, purpose?, 20]`, written out literally), `count(?) == params.length`, and that `params[index of the purpose ?]` equals the purpose; null/blank arms assert the full sequence without the purpose. MUT-B09p (area: purpose and city binds swapped, SQL text identical) KILLED, red exit 1 with only the 3 N3 `[1]` its failing in `assertBindSequence`, green exit 0 at 89; MUT-B10p (same swap on the bbox path) KILLED, only the 3 N3 `[2]` its. The pre-fix N3 would have SURVIVED both (derived, not run: the clause is present and `rent` still appears exactly once). MUT-B09-r2 / MUT-B10-r2 re-run B09 / B10 against the strengthened N3: both KILLED (red exit 1, 3 failures each, green exit 0 at 89).
- MUT-B14: the 3 new N5 arms fail, the existing 4 stay GREEN. MUT-B17: the 3 N8 passthrough its fail, `PropertyCard.test.tsx` stays GREEN (the seam gap). MUT-B22 replaced the value (`projectedPricePaise = pricePaise;`), no compile error.
- MUT-B08 / B08b drop only the `to=` href; the click -> `openAuthModal` its stay GREEN, the two href its fail.

## auth-open-redirect-hardening-2232

Spec `e2e/auth-open-redirect-hardening-2232.spec.ts`: 5 generated hostile tests (3 `expect`s each: L91 settles on `/discover`, L94 origin unchanged, L95 URL lacks `evil.com`) + 1 control (L99-113). The whole spec `test.skip`s when `SMOKE_USER_*` credentials are absent. Destination: N1, N2, `authUtils.getSafeReturnTo.test.ts` (24/24), existing `Auth.consumerInvariant` (8/8), `AuthCallback.consumerInvariant` (6/6), `Auth.issue2238.redirectRace` (4/4).

| row | legacy lines | assertion | covering test(s) | passes at head | MUT (observed) | verdict |
|---|---|---|---|---|---|---|
| S1-1 | 78-96, L91/94/95 | hostile `/\evil.com`: lands `/discover`, same origin, no `evil.com` | authUtils `rejects a backslash-prefixed value` (exact null); N1 authed + anon + S1-8 rows (exact `navigate('/discover',{replace:true})` once, exact redirectTo); N2 both paths | N1 38/38, N2 16/16, authUtils 24/24, exit 0 | B01 KILLED, B04 KILLED | COVERED_EXISTING + COVERED_NEW |
| S1-2 | same, `/\/evil.com` | same triple | authUtils `rejects a slash-backslash-slash value`; the N1/N2 rows (the consumer-level gap) | as above | B01, B04, B05 KILLED | COVERED_NEW (was WEAK) |
| S1-3 | same, `/HTTP://evil.com` | same triple | authUtils uppercase/mixed-case; consumerInvariant uppercase its; N1/N2 rows | as above | B03, B04, B05 KILLED | COVERED_EXISTING + COVERED_NEW |
| S1-4 | same, `//evil.com` | same triple | authUtils `rejects a protocol-relative URL`; N1/N2 rows now exact through `returnTo` (the old consumer check was negative-only via `?redirect=`) | as above | B02, B04, B05 KILLED | COVERED_NEW (was WEAK) |
| S1-5 | same, `https://evil.com` | same triple | authUtils `rejects a full https URL`; N1 authed navigate (new) and bare-host row; AuthCallback `re-sanitises` | as above | B31 KILLED (by the bare-host rows), B04, B05 KILLED | COVERED_EXISTING + COVERED_NEW |
| S1-6 | 99-113 | control: safe `/discover?city=udupi` honoured, same origin | N1/N2 accept arms (exact value); authUtils `preserves query string exactly`; canonical T2 for the real browser | unit exit 0; T2 NOT_RUN | B06 KILLED (T2 pending CP4) | COVERED_CANONICAL + unit; pending CP4 (T2 in both gate runs) |
| S1-7 | 69-75, 79, 100 | `clearCookies` isolation + credential skip | none | n/a | none | OBSOLETE: harness isolation / skip gate, not a product property (the spec is silently vacuous without credentials) |
| S1-8 | 94-95 | a REAL sign-in leaves the origin unchanged | N1 describe `S1-8`: REAL `AuthForms` form submit -> `signInWithPassword` mock fires `SIGNED_IN` into the REAL `AuthProvider` -> `Auth` navigates. 6 hostile its: exactly one `navigate('/discover',{replace:true})`, no `href`/`assign`/`replace` write, `JSON.stringify` of every auth mock call lacks `evil.com`; control it: `/listing/123` is honoured exactly | N1 38/38, exit 0 | B32 KILLED (21 red incl. all 6 sub-arm its) | COVERED_NEW under `s1_8_rule`. Limit, stated for the security-reviewer: the sub-arm proves the navigate argument and the mock-call contents in jsdom, not a real-browser property (`window.location.origin` after navigation). Source evidence: `AuthForms.tsx` has no router import and no navigation; its only `window.location` read is `.origin` at :35 (Google redirectTo); `signInWithPassword` (`AuthContext.tsx:172`) takes no redirect option; the Google `redirectTo` receives only the sanitised `explicitTarget` (`Auth.tsx:56`), asserted exactly by the N1 anon rows |

8 rows: S1-1..S1-5 covered, S1-6 covered with canonical T2 pending, S1-7 obsolete, S1-8 closed. If the security-reviewer rules the jsdom limit does not close S1-8, S1-8 becomes UNCOVERED and the spec is KEEP (no owner acceptance is available for a security row).

LOSS rows: none non-security. S1-8 is listed for transparency: it is a security row, and "closed" rests on MUT-B32 KILLED plus the reviewer's ruling.

Final status: **RETIRED** (owner comment 6246476795; subject to canonical T2 in both CP4 gate runs).

## issue-1956-pr4-price-auth-contract

Spec `e2e/discover/issue-1956-pr4-price-auth-contract.spec.ts`: 2 tests (anon, authed); each does a Buy fetch and a Rent fetch of `/api/discover/cities/bangalore/listings` for `node=a:IN|KA|Bengaluru|Basaveshwara Nagar`. Destination: `CityAreaListingsServiceTest`, `CityAreaListingsIT`, `CityAreaListingsControllerTest`, `PriceBandTest`, `MonthlyRentBandTest` (mvn, 89 + 32 tests, exit 0), `useDiscoverCityListings.anonAuthHeader2817` (3/3), N6, `useAreaLeafResultSource.test.ts` (N5). Issue #2818 is mentioned by no test (confirmed at plan time); only #2817 is cited.

| row | legacy lines | assertion | covering test(s) | passes at head | MUT (observed) | verdict |
|---|---|---|---|---|---|---|
| S2-1 | 51 | anon request has NO Authorization header | `anonAuthHeader2817` A (allow-list of headers) and A2 (empty token); IT `anon: controller passes isAuthenticated=false`; N4 no-header arm | 3/3; IT 12/12 | B16a KILLED (A, A2), B16b KILLED (B + N6 signed-in), B11 KILLED | COVERED_EXISTING |
| S2-2 | 52, 79, 113, 133 | exactly one areaKeys value on the wire for a single-area leaf | hook half: 2817 A/B and N6 (`getAll('areaKeys')` equals `[AREA_KEY]`); caller half pinned for producer #2 only (N5) | 8/8; 4/4 | B14 KILLED (N5 arms; existing 4 stay GREEN) | **OUT_OF_SCOPE_COMPOSITION**. The request the spec observes comes from `useDiscoverMapData.ts:859` (page composition, see `b1/n5-n6-resolution.md`), which no test pins. S2 = KEEP |
| S2-3 | 54-55, 81-82, 115-116, 135-136 | `listings.length > 0` | fixture-liveness guard | n/a | none | OBSOLETE: unit tests are non-vacuous by construction |
| S2-4 | 57 | anon: `pricePaise` key absent | ServiceTest matrix (sale,false); IT `anon: pricePaise KEY absent`; ControllerTest ac1 | exit 0 | B12 KILLED (matrix) | COVERED_EXISTING |
| S2-5 | 61-64, 92-95 | anon: `monthlyRentRupees` absent | ServiceTest matrix (rent/lease,false) + mixed-columns arm; IT rent-anon | exit 0 | B13 KILLED | COVERED_EXISTING |
| S2-6 | 65-70 | anon sale listing has a priceBand | matrix (exact `₹50L–1Cr`); PriceBandTest; IT | exit 0 | B21 KILLED | COVERED_EXISTING |
| S2-7 | 77-79 | anon rent: no Authorization, one areaKeys, intent reaches the wire | 2817 A (header); N6 (`listingPurpose=rent` exactly once, sale control); areaKeys half as S2-2 | exit 0 | B15 KILLED (3 N6 its; `cityListingsQueryParams.test.ts` stays GREEN), B14, B16a KILLED | header half COVERED_NEW; purpose half: N6 pins the hook once it is given `listingPurpose`, but the URL `intent=rent` -> `listingPurpose` step is page composition (OUT_OF_SCOPE_COMPOSITION, like the areaKeys half) |
| S2-8 | 81-82, 135-136 | `rentListings.length > 0` | fixture-liveness | n/a | none | OBSOLETE |
| S2-9 | 83-87, 137-141 | every listing under intent=rent is rent/lease | N3: SQL has `AND pl.listing_purpose = ?` and the COMPLETE positional bind sequence is pinned per path (area `[purpose, city, areaKey, 5]`, bbox `[city, west, south, east, north, purpose, 20]`), `?` count == params length, `params[purpose ? index]` == purpose; `rent` / `sale` / padded-trimmed; null/blank add nothing and the sequence omits the slot | ServiceTest 33/33, IT 12/12, ControllerTest 44/44 | B09 KILLED (3 N3 `[1]` its), B10 KILLED (3 N3 `[2]` its), B09p KILLED (area bind slot swapped, 3 N3 `[1]` its), B10p KILLED (bbox bind slot swapped, 3 N3 `[2]` its), B09-r2 / B10-r2 KILLED against the strengthened N3 | COVERED_NEW (was UNCOVERED). Server filtering, as the spec observed a DB, is not claimed; the DB-backed ITs were not run |
| S2-10 | 88-91 | anon rent/lease: `pricePaise` absent | matrix (rent/lease,false) + AC14 mixed columns + IT | exit 0 | B22 KILLED (replace-value mutant) | COVERED_EXISTING |
| S2-11 | 92-95 | anon rent/lease: `monthlyRentRupees` absent | as S2-5 | exit 0 | B13 KILLED | COVERED_EXISTING |
| S2-12 | 96-99 | anon rent/lease: non-empty `monthlyRentBand` | matrix exact `₹20–35K`; MonthlyRentBandTest; AC4/AC5/R16 | exit 0 | B23 KILLED | COVERED_EXISTING |
| S2-13 | 112 | authed request carries Authorization | 2817 B (exact `Bearer dummy-token`); IT `authed: isAuthenticated=true`; N4 Bearer arm (filter wiring through the production `JwtConfig` chain, decoder stubbed) | exit 0 | B11 KILLED (33 of 89 red, incl. the N4 bearer it), B11p KILLED (authed header `must-revalidate, no-store`; the old contains/not-contains pair would survive it), B11q KILLED (anon header gains `must-revalidate`, same), B16b KILLED | COVERED_NEW (was WEAK). Limit: wiring + `isAuthenticated` mapping, not signature validation |
| S2-14 | 118 | authed: `priceBand` falsy | matrix (sale,true); IT authed priceBand key absent | exit 0 | B24 KILLED | COVERED_EXISTING |
| S2-15 | 119-124 | authed sale: `pricePaise` > 0 | matrix (sale,true exact); IT authed exact value | exit 0 | B25 KILLED | COVERED_EXISTING |
| S2-16 | 131-133 | authed rent: Authorization present, one areaKeys | as S2-13 and S2-2/S2-7 | exit 0 | B11, B14, B15, B16b KILLED | header half COVERED; purpose half: N6 pins the hook once it is given `listingPurpose`, but the URL `intent=rent` -> `listingPurpose` step is page composition; areaKeys half OUT_OF_SCOPE_COMPOSITION |
| S2-17 | 142-153 | authed rent: bands falsy, `monthlyRentRupees` > 0 | matrix (rent/lease,true) + AC5/R16 (0 and negative -> absent) + IT exact 25000 | exit 0 | B26 KILLED (rentZero/rentNegative arms) | COVERED_EXISTING |
| S2-18 | 105 | two separate sessions (storage states) | none: the comparison is made one layer down (2817 A vs B; isAuthenticated false vs true) | n/a | none | OBSOLETE: two-session test shape |

Tally: 18 rows = 10 COVERED_EXISTING (S2-1, 4, 5, 6, 10, 11, 12, 14, 15, 17) + 2 COVERED_NEW (S2-9, S2-13) + 3 OBSOLETE (S2-3, S2-8, S2-18) + 3 OUT_OF_SCOPE_COMPOSITION (S2-2, and S2-7 / S2-16 for their areaKeys and purpose halves; only their header half is covered).

LOSS rows: none non-security. The OUT_OF_SCOPE_COMPOSITION row is not a LOSS the owner can accept: per `[retirement_rule]` the spec is KEEP.

Final status: **RETAINED** (SCHEDULED(PR-7), owner ruling 6246476795).

## anon-teaser

Spec `e2e/journey/anon-teaser.spec.ts`: 6 tests (AT1 AT2 AT2b AT2c AT3 AT4). AT2/AT2b/AT2c/AT3 read a fixture listing id and skip silently when it is absent; AT3/AT4 also skip without credentials. Plan-time triage correction: AT1 and AT4 are OBSOLETE, not duplicates; canonical T2b does NOT cover AT3 (its own comment, `auth-session.canonical.ts:711-712`). AT3 = `getSafeReturnTo('/listing/123')` + `Auth.consumerInvariant` + the N1 `/listing/123` arm + canonical T2.

| row | legacy lines | assertion | covering test(s) | passes at head | MUT (observed) | verdict |
|---|---|---|---|---|---|---|
| A1-1 | 52-55 | AT1 body: `test.fixme(true)` first, nothing executes | n/a | n/a | none | OBSOLETE: inert |
| A1-2 | 56-59 | anon `goto('/')` stays at `/`, no redirect to `/auth` | none: never ran (fixme); `LandingPage.test.tsx` is red at base and must not be cited; no canonical test visits `/` | n/a | none | **LOSS (non-security). ACCEPTED by the owner by name (comment 6246476795, CP3).** |
| A1-3 | 62-64 | h1 `Find Your Perfect Home with Trust & Clarity` visible | n/a: the string exists in no product source | n/a | none | OBSOLETE: target gone |
| A1-4 | 66-69 | first `a[href='/discover']` on the landing page | n/a (fixme reason: CTA absent) | n/a | none | OBSOLETE: inert, documented stale |
| A1-5 | 75-83 | AT2 precondition: skip when fixture null / not LIVE | n/a (harness gate); canonical T11/T12 use the seeded literal id and cannot skip | n/a | none | OBSOLETE: skip gate |
| A1-6 | 85 | anon `/listing/<id>` keeps its URL (no redirect) | canonical T11 (anon page reaches the real h1) + `canonical-harness-smoke` (genuinely public route) | NOT_RUN | none (no unit MUT can observe a real-browser non-redirect) | COVERED_CANONICAL; pending CP4 (T11 + harness smoke in both gate runs) |
| A1-7 | 93-95 | anon sees h2 `Request a viewing time`, no sign-in wall | `ListingDetail.test.tsx` `anonymous users get the same interactive viewing-request panel` (heading level 2 + `sign-in-gate` absent; real page + real data hook, only `api.get` mocked) | 45/45 | B27 KILLED (exactly that it) | COVERED_EXISTING |
| A1-8 | 100-103 | first `a[href*='/auth?returnTo']` on `/listing/<id>` carries the encoded path (at image index 0 the lock is not rendered, so `.first()` is the HEADER Sign-in link, `AppLayout.tsx:628`) | N7: desktop href exactly `/auth?returnTo=%2Flisting%2Fabc-123%3Fx%3D1%26y%3D2`, control `/discover?city=udupi` href differs, click -> `openAuthModal({returnTo: '/listing/abc-123?x=1&y=2'})`; mobile sheet (opened) same three arms. The gallery-gate link is separate and already exact (A1-12) | N7 7/7 | B08 KILLED (desktop its), B08b KILLED (sheet its; the sheet is really opened, precondition it proves it was closed) | COVERED_NEW (was WEAK) |
| A1-9 | 108-118 | AT2b: no `Sign in to view all photos` at index 0 | `ListingDetail.test.tsx` `anon: first image visible - no locked overlay at index 0`, paired with the positive `clicking next image shows locked overlay` | 45/45 | B19a KILLED (that it + 3 more) | COVERED_EXISTING |
| A1-10 | 120-123 | AT2b conditional: skip when the Next button is absent | `ListingDetail.test.tsx` AC3 (arrows present when imageCount>1, absent when hasMoreLocked is false) | 45/45 | B28 KILLED (AC3 absent + AC7 counter) | COVERED_EXISTING (the else-branch of a skip; the canonical version, T11, seeds 2 images and cannot skip) |
| A1-11 | 125-126 | click Next -> `Sign in to view all photos` visible | `ListingDetail.test.tsx` `anon: clicking next image shows locked overlay`, `pressing prev clears overlay` | 45/45 | B19b KILLED (5 its) | COVERED_EXISTING |
| A1-12 | 127-131 | last `a[href*='/auth?returnTo']` is the gate CTA for `/listing/<id>` | `ListingDetail.test.tsx` `locked overlay CTA links to /auth with returnTo` and the zero-preview placeholder twin (exact encoded href) | 45/45 | B20 KILLED (both its; mutated the overlay variant, `SignInGateCard.tsx:47`) | COVERED_EXISTING |
| A1-13 | 137-155 | AT2c authed: no lock after Next, tab strip visible | `ListingDetail.test.tsx` `logged-in: no locked overlay when navigating to image 2`, `logged-in: thumbnail strip is rendered` | 45/45 | B29 KILLED | COVERED_EXISTING |
| A1-14 | 161-187 | AT3: sign in through `/auth?returnTo=/listing/<id>`, land on the listing | N1 authed accept arm `/listing/123` via `returnTo` (exact navigate) and via `redirect`; the S1-8 control it (same value through a real form sign-in); authUtils `getSafeReturnTo('/listing/123')`; canonical T2 for the real browser | N1 38/38; T2 NOT_RUN | B07 KILLED (returnTo read dropped), B06 KILLED | COVERED_EXISTING + COVERED_NEW; pending CP4 (T2 in both gate runs) |
| A1-15 | 195-219 | AT4: authed `goto('/')` -> `/discover`; anon-only text absent | n/a: `test.fixme(true)`; `/` has no authed redirect; the asserted text is in no product source; the leaflet try/catch swallows its own failure. Authed landing on `/discover` is canonical T1 | n/a | none | OBSOLETE |

Tally: 15 rows = 5 OBSOLETE (A1-1, A1-3, A1-4, A1-5, A1-15) + 1 LOSS (A1-2) + 1 COVERED_CANONICAL (A1-6) + 8 covered (A1-7..A1-14). The plan-time map counted A1-2 among 6 OBSOLETE rows; this map classes it as the LOSS row, per the approved plan.

Final status: **RETIRED** (owner comment 6246476795, A1-2 ACCEPTED; subject to canonical T2, T11 and harness smoke passing in both CP4 gate runs).

## discover-commercial-card-summary

Spec `e2e/discover-commercial-card-summary.spec.ts`: 2 tests. Kept whole by lead decision Q3; nothing in this spec is edited in B1. `e2e/canonical/commercial-lifecycle.canonical.ts:846` cites it in a comment only (the canonical file is not touched).

| row | legacy lines | assertion | covering test(s) | passes at head | MUT (observed) | verdict |
|---|---|---|---|---|---|---|
| A2-1 | 48-52 | describe-level skip when `user-auth.json` is absent | n/a (harness gate) | n/a | none | OBSOLETE: skip gate |
| A2-2 | 57-65 | authed VIEWPORT journey (`rscope=vp&rvp=...`) renders >=1 listing card | none: no canonical test drives `rscope=vp`; URL state -> `useDiscoverListings` VIEWPORT -> panel is composition | NOT_RUN | none | **OUT_OF_SCOPE_COMPOSITION** => spec KEEP |
| A2-3 | 67-77 | >=1 `listing-commercial-summary` on the VIEWPORT journey | card: `PropertyCard.test.tsx` (`keeps the area fact when commercialFacts is spread in after it`, `suppresses the generic specs row once any fact arrives` with its control); selection: `commercialSummary.test.ts`; the VIEWPORT data seam `discoverMappers.ts:188-195` is N8 | PropertyCard 102/102, commercialSummary 21/21, discoverMappers 22/22 | B17 KILLED (3 N8 its; PropertyCard stays GREEN, proving the seam gap), B18 KILLED (2 PropertyCard its) | COVERED_NEW for the mapper spread only (N8); how `useDiscoverListings` parses the response is not covered (was WEAK). The e2e oracle (`count>0`, text length>0) passes on an area-only fact, so even a green legacy run never proved the facts arrive |
| A2-4 | 79-84 | anti-vacuity: first summary's innerText non-empty | `PropertyCard.test.tsx` exact-text its; `commercialSummary.test.ts` exact arrays | as above | B30 KILLED (the same 2 PropertyCard its), B18 KILLED | COVERED_EXISTING (strictly dominated by the unit assertions) |
| A2-5 | 97-105 | test 2: area journey renders >=1 listing card | canonical `discover-area-first.canonical.ts` (area cards) | NOT_RUN | none | **UNCOVERED, duplication unverified.** The authenticated area-journey `cards > 0` is a real product assertion; no canonical T-id has been shown to cover it on an authenticated session. A2 is KEEP whole regardless. Kept untouched |
| A2-6 | 106-113 | test 2: summary count recorded via `testInfo.annotations`, never asserted | n/a: no `expect()`; its premise (`Expected 0 until #2516`) is stale, #2516 merged | n/a | none | OBSOLETE: vacuous by construction. Kept untouched |

**A2 test-2 candidate (for the owner, recorded not executed):** test 2 (lines 97-113) has one `expect()` (cards > 0, A2-5, UNCOVERED, duplication by canonical area-first unverified) and one annotation with no pass/fail power (A2-6, OBSOLETE, stale premise). The owner's default is KEEP. Rule in CP3: `A2 test 2: DELETE` or `A2 test 2: KEEP`. A DELETE ruling is NOT executed in this lane (editing a `test()` inside a kept spec is forbidden here) and is handed to the Main Agent as a scope decision.

Final status: **RETAINED whole** (SCHEDULED(PR-7), owner ruling 6246476795; named gaps A2-2 and A2-5).

## Open items for the reviewers and the owner

- security-reviewer (CP2): rule explicitly on S1-8 (jsdom closure), on the S1/S2 per-row table in the approved plan `[security_verification].row_checks`, and on S2-2/S2-7 (APPROVE the OUT_OF_SCOPE_COMPOSITION classification or REJECT_WITH_KEEP).
- code-reviewer (CP2): confirm every OBSOLETE row reason above (S1-7, S2-3/8/18, A1-1/3/4/5/15, A2-1/6; A2-5 is UNCOVERED, not OBSOLETE).
- owner (CP3): A1-2 ACCEPT / REJECT by name; the A2 test-2 candidate; delete only by full path.
- CP4: canonical T2 (S1-6, A1-14), T11 and `canonical-harness-smoke` (A1-6) must pass in BOTH gate runs, else the spec is restored.
- B1 record (true at H_B1 d708af43): no production file was modified, nothing was deleted, no manifest status changed, and `e2e/**` was untouched. In B2 the two owner-named specs were deleted and four manifest statuses changed (see the header).

## Cost / yield

| spec | tests added / extended | MUT ids | final outcome | minutes | specialist calls |
|---|---|---|---|---|---|
| S1 `auth-open-redirect-hardening-2232` | N1 (38), N2 (16) | B01-B07, B31, B32 (9) | 9/9 KILLED; RETIRED (owner 6246476795) | NOT MEASURED per spec | NOT MEASURED per spec |
| S2 `issue-1956-pr4-price-auth-contract` | N3 (+10), N4 (+3), N5 (+4), N6 (4) | B09-B16b, B21-B26 (14) | 14/14 KILLED; retained, SCHEDULED(PR-7) (S2-2 composition) | NOT MEASURED per spec | NOT MEASURED per spec |
| A1 `anon-teaser` | N7 (7), N1 `/listing` arm | B07, B08, B08b, B19a/b, B20, B27-B29 (9) | 9/9 KILLED; RETIRED (A1-2 ACCEPTED by the owner) | NOT MEASURED per spec | NOT MEASURED per spec |
| A2 `discover-commercial-card-summary` | N8 (+4) | B17, B18, B30 (3) | 3/3 KILLED; retained, SCHEDULED(PR-7) (A2-2 composition) | NOT MEASURED per spec | NOT MEASURED per spec |

(MUT ids B06 and B07 are shared by S1 and A1, so the column totals exceed 32.)

Totals for the whole batch (specialist calls were shared across all four specs, so there is no honest per-spec split; the per-spec columns above are not measured):
- Specialist calls: Stage A 3 (probe + 2 investigations, shared across all 4 specs); B1 6 (qa-fast, qa, qa Codex fix, code-reviewer, security-reviewer, qa verification; shared); B2 planned 4.
- Minutes (`date -u`): Stage A plan authoring 12:52-13:06Z (with PLAN_REVIEW revisions up to 17:04Z); B1 17:53-19:32Z (including the Codex wait).

## Follow-up issues (outside this PR's scope and verdicts)

- #2847 (MEDIUM): `AuthModalContext.handleSuccess` calls `navigate(target)` without `getSafeReturnTo`. The legacy S1 spec never covered the modal, so retiring it loses no modal coverage.
- #2848 (LOW): `JwtDecoder` algorithm/signature validation is not exercised by N4 (the decoder is stubbed).
