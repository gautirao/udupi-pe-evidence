# Actor evaluation and run gate (#2575) — recorded 2026-09-15

Acquisition was **authorised by the owner** on 2026-09-15, with a spend ceiling and a hard
reliability gate. This file records what was measured **before** spending anything.

~~**Outcome: no actor was run. Nothing was spent. No paid API call was made.**~~

~~Both candidate routes are blocked, for different reasons, and both are evidence-backed below.~~

## ⚠ THAT OUTCOME LINE IS SUPERSEDED — 2026-09-15

**It was true when written and is now false.** It is struck rather than deleted because it is the
pre-spend record the owner's authorisation was granted against, and because a file whose headline
outcome silently flips is exactly the failure this PR keeps correcting elsewhere.

**Actual outcome at head: seven actor runs, $0.51285 spent** against the **then-$5** account ceiling
(the account has since been upgraded — see §2) —
2 × $0.25005 full captures (Bengaluru, Mangalore) + 4 × $0.00005 zero-row Kundapur probes +
$0.01255 for the 5-row Mangalore positive control that makes the Kundapur result a proof rather
than an unexplained zero.

**Both routes were not "blocked".** The owner **waived** the >99% gate for `memo23` and named it the
approved source for both cities (§3.0), so the 99acres route opened. The housing.com route remains
closed on capability, and that finding is unchanged.

**The cost projection in §2.2 is also stale** — it models two runs at ~$0.50; seven were run for
$0.51285, which lands within the projection by coincidence of the free-tier cap, not by the
projection having anticipated five more runs.

**What this file still establishes, and what has NOT changed:** the measured reliability figure is
**93.6%**, unimproved by the waiver; the `robots.txt` **403 is unresolved**; and a success rate is a
floor on the actor not crashing, never a correctness rate.

---

## 1. Owner authorisations, recorded as decisions rather than as findings

**Acquisition authorised, 2026-09-15.** Credential provisioned; spend ceiling set. A ceiling is
not a target.

**Source terms — an owner decision, 2026-09-15, NOT verified permission.** The unverified
collection-permission question was put to the owner twice, including the point that the existing
committed Udupi Commercial capture came from the same third-party actor, so the answer applies
retroactively. The owner said proceed.

This is recorded as **a decision taken knowingly**, and deliberately not as evidence that
collection is permitted. **The `robots.txt` 403 remains unresolved** — `99acres.com/robots.txt`
returned HTTP 403 to an ordinary fetch, no workaround was attempted, and none may be. Anyone
later reading this file should treat the permission question as open and owner-accepted, not
closed.

---

## 2. Account state (measured, zero-cost)

Read via one authenticated `GET /v2/users/me`. No run, no charge.

⚠ **SUPERSEDED 2026-09-15 (later) — THE ACCOUNT WAS UPGRADED. Re-measured by the same zero-cost
`GET /v2/users/me`:**

🔴 **THIS MEASUREMENT IS LANE TESTIMONY AND NO REVIEWER CAN REPRODUCE IT.** It comes from an
authenticated call to an external API; there is no committed transcript, and there cannot be one a
reviewer could re-run — the token is uncommittable by design. **Committing a redacted excerpt would
not fix that**: it would still be my transcript of my call, dressed as evidence. So the figures below
are recorded as **testimony**, exactly like the sweep counts and the Maven totals, and the *old*
figures are struck rather than deleted so a reader can see both and judge. What a reviewer **can**
check is that both artefacts now assert the same values and that nothing reasons from the superseded
ones.

| field | value when written | **measured at re-check** |
|---|---|---|
| plan | ~~FREE~~ | **CUSTOM** |
| tier | ~~(none)~~ | **BRONZE** |
| monthly platform ceiling | ~~**$5**~~ | **$85** (`maxMonthlyUsageUsd`) |
| free-tier result cap | 100 items per run (actor-documented) | ⚠ **NOT RE-MEASURED — see below** |

🔴 **THE 100-ITEM CAP IS NOT CORRECTED, IT IS UNVERIFIED.** It was documented as a *free-tier* limit.
The tier has changed, so the cap **may** have lifted — but **inferring that from the tier change would
be assuming the thing to be measured**, which is the exact error class this PR has corrected four
times over. It is measured on the next run's actual returned-row count against its requested cap, or
it stays unknown. **No projection may rely on it in either direction until then.**

~~- **The account ceiling ($5/mo) is BELOW the authorised ceiling ($10).** The authorisation is not
  the binding constraint; the plan is. Any spend estimate must be made against $5.~~
**Superseded: at $85 the plan is no longer the binding constraint.** Spend authorisation now comes
from the orchestration channel rather than from the plan, and is deliberately not restated here — a
relayed figure written into a committed artefact as fact is the failure this PR recorded at
`d8af14a1`.

> **CORRECTION, 2026-09-15.** An earlier revision of this section stated that FREE tier "carries no
> Store discount tier", so the effective per-result cost would be "typically 2–3×" the published
> headline. **That is not supported by this actor's own pricing record and is withdrawn.** It came
> from general web material about Apify plan tiers, not from the actor, and it was stated here with
> more confidence than its source earned. Superseded rather than deleted, because a cost projection
> was about to be built on it.

### 2.1 Measured pricing, from the actor's own `pricingInfos`

Read via the API at zero cost. `memo23/99acres-property-scraper` is `PAY_PER_EVENT`:

| event | price | notes |
|---|---:|---|
| `result` (primary) | **$0.0025** | one charge per result row — i.e. **$2.50 / 1,000** |
| `apify-actor-start` | $0.00005 | one-time, per GB of actor memory, minimum one |

**The record exposes a single flat `eventPriceUsd`, not a per-plan tier map.** So the measured rate
is $2.50/1,000, and this record shows **no evidence of a FREE-tier surcharge**. Whether Apify applies
a plan multiplier elsewhere in billing is *not visible here* — stated as unknown rather than guessed
in either direction.

### 2.2 Cost projection (the figure to approve against)

⚠ **THIS PROJECTION'S PREMISE IS NOW UNVERIFIED.** It is built on the free-tier **100-item per-run
cap** bounding the run rather than supply — and that cap is exactly the figure marked NOT
RE-MEASURED in §2 above. The projection is retained because the seven `memo23` runs it governed
came in at **$0.51285**, close to it; it must not be reused for a new run until the cap is measured.

| run | rows (capped) | result cost | start | total |
|---|---:|---:|---:|---:|
| Udupi, wider radius | 100 | $0.25 | ~$0.0001 | **~$0.25** |
| Bangalore Commercial | 100 | $0.25 | ~$0.0001 | **~$0.25** |
| **both** | 200 | $0.50 | — | **~$0.50** |

~~About **10% of the $5 monthly ceiling**. The cap also means a run cannot accidentally run away:
100 rows is the ceiling per run regardless of how much inventory the search matches.~~
**Both halves superseded:** the ceiling is now $85, and "a run cannot accidentally run away" rested
on the unverified cap. **Run-away protection must come from inputs that are actually set** —
`maxListings`, `maxPagesPerUrl`, `maxRequestsPerMinute`, `maxConcurrency`, `timeoutSecs` — not from
a tier limit nobody has re-confirmed.

### ⚠ 2.3 A SECOND ACTOR IS NOW IN SCOPE, AND ITS COST MODEL IS ENTIRELY DIFFERENT

Everything in §2.1–2.2 describes `memo23/99acres-property-scraper`, which is **PAY_PER_EVENT** —
cost scales with **result rows**. It remains true of that actor.

The Housing.com Actor (`NLT0rrdd0BTA6teQy`, private) has **no `pricingInfos` at all**: it is billed
on **platform usage**, so cost scales with **bytes transferred and compute**, not rows. Measured on
its own prior run — 5 items, $0.02353 total:

| line | USD | share |
|---|---:|---:|
| `PROXY_RESIDENTIAL_TRANSFER_GBYTES` | 0.02025 | **86%** |
| `ACTOR_COMPUTE_UNITS` | 0.00279 | 12% |
| everything else combined | 0.00049 | 2% |

**A per-row cost from one model does not transfer to the other**, and a per-item figure from that
run would mislead in both directions: search-only runs move far fewer bytes than detail runs, which
fetch one extra page per listing. Search and detail economics must be measured separately.

**What this does not bound:** proxy/compute charges if the actor bills them separately. `memo23`'s
record shows `PAY_PER_EVENT` with no platform-usage line, so none is expected **for that actor**.

🔴 **THE BACKSTOP SENTENCE HERE WAS FALSE AND IT WAS THE ONE STILL DOING ACTIVE WORK.** It read
~~"but the $5 ceiling is the backstop either way, and the account cannot exceed it"~~ — **present
tense, offered as the reassurance that closes this very question**, and resting on a superseded
figure. **The ceiling is `maxMonthlyUsageUsd` $85**, so it understated the exposure seventeen-fold,
at exactly the place a reader checks before authorising a run.

**And the reassurance does not generalise to the second actor at all.** The Housing.com Actor
(§2.3) has **no `pricingInfos`** and is **platform-billed on bytes and compute** — precisely the
proxy/compute charges this paragraph dismisses as "not expected". For that actor those charges are
not an edge case, they are **86% of the bill**.

**The real bound is $85, and it is a ceiling, not a safeguard.** Run-level protection has to come
from inputs actually set — `maxTotalChargeUsd`, `timeoutSecs`, `memoryMbytes`, `maxListings`,
`maxPagesPerUrl`, `maxRequestsPerMinute`, `maxConcurrency`.

The token was read privately from a gitignored file and passed to `curl` via `--config` on stdin,
so it appears in no argv, process listing, shell history or transcript. No value derived from it
is recorded anywhere in this repository.

---

## 3. The reliability gate: >99% runs succeeded — WAIVED for one actor, 2026-09-15

### 3.0 Owner decision, 2026-09-15 — gate waived for `memo23/99acres-property-scraper`

The owner was shown the measured figures below — **93.6%**, 140 runs, 8 FAILED + 1 ABORTED,
denominator 34 users / 26 monthly — together with the finding that **both gate-passing actors cannot
express Commercial at all**. They chose to **waive the >99% gate for `memo23` and name it the
approved source for Udupi AND Bangalore**, rather than ship with no inventory.

**Rationale, as decided:** 93.6% counts runs that **crashed**, not runs that returned wrong data. A
crashed run costs a retry; it does not put bad inventory into the pipeline.

**This is recorded as a waiver, NOT as the gate having been met.** The measured rate stands at 93.6%
and is not improved by the decision. Anyone later citing this actor's reliability should quote the
measurement, not the approval.

**The waiver does not touch the terms posture.** `robots.txt` returned **403** and that remains
**unresolved** — now for Bangalore as well as Udupi, since the same third-party source now serves
both. Neither the waiver nor the source approval converts an unresolved access refusal into
permission.

**What the waiver does NOT remove:** the correctness obligation in §3.3 below. A success rate is a
floor on the actor not crashing. Output must still be verified as genuinely Commercial and genuinely
the requested city **before anything is staged**, because the dangerous failure here has always been
an actor that silently ignores an unsupported input and returns the wrong thing *successfully*.

### 3.1 The gate as originally imposed (superseded above, retained for the record)

~~Owner-imposed, non-negotiable, applies to every actor before any spend.~~ Retained because the
measurements below were taken under it, and because the waiver is only legible against the rule it
relaxes.

Figures below are from each actor's own API `stats.publicActorRunStats30Days`, so the
**denominator is stated** — a rate without one is not a measurement.

| actor | 30-day runs | succeeded | rate | denominator health | gate |
|---|---:|---:|---:|---|---|
| `memo23/99acres-property-scraper` | 140 | 131 | **93.6%** | 34 users / 26 monthly — real | **FAIL** |
| `hermandev/housing-com-property-scraper` | 56 | 56 | **100.0%** | 4 users / 2 monthly — weak | pass (weakly) |

`memo23`: 8 FAILED + 1 ABORTED of 140. Excluding aborts gives 94.2%, matching the Store page.
**Both readings are below 99%**, so the choice between them does not matter to the verdict.

`hermandev`: 100% is real but rests on essentially one user's activity — 56 runs across 2 monthly
users. Reported as weak evidence, not as a strong reliability result.

**A success rate is not a correctness rate.** A run that completes and returns zero rows, or
returns Residential rows for a Commercial query, still counts as SUCCEEDED. The gate is a floor on
the actor not crashing; it says nothing about whether the output is the inventory requested.

---

## 4. Capability: can each actor express Commercial, and Bengaluru?

Checked against each actor's **live input schema** via the API, not its Store page — an output
field named `propertyType` is not an input filter, and that distinction is the whole question.

### 4.1 `apify-actors/housing-scraper-udupi` (the owner's own code) — CANNOT

Read directly from `.actor/input_schema.json` and `src/main.ts` in this repo.

- Input properties are exactly: `startUrls` (required), `maxPagesPerStartUrl`,
  `maxRequestsPerCrawl`, `minRequestDelaySecs`, `maxRequestDelaySecs`, `proxyConfiguration`.
- **There is no city field at all.** Bengaluru could only be expressed by handing it a URL.
- The schema states: *"Only 'buy' (sale) SRP URLs are supported by this actor."*
- `main.ts` throws without `startUrls` and names `/in/buy/...`; it hardcodes
  `groups: ['RESIDENTIAL']` because housing.com's WAF blocks datacenter IPs — a costlier group.
- No property-category input exists anywhere.

**Verdict: cannot express Commercial.** Feeding it a commercial URL would be coercing an input it
does not model — the exact failure shape where an actor silently ignores the unsupported part and
returns Residential rows that get labelled Commercial downstream.

### 4.2 `hermandev/housing-com-property-scraper` — CANNOT

Live input schema (build 1.0.4) property names, complete:

```
cities · daysOld · enrichDetails · includeRaw · maxConcurrency · maxImages · maxItems
maxPagesPerSearch · maxPrice · minPrice · proxyConfiguration · startUrls · transactionTypes
```

- **No `searchMode`, no `propertyTypes`, no category field.** The schema exposes **no enums at
  all**, and a text scan of the whole input schema finds **zero** occurrences of "commercial" —
  only `bengaluru`, twice.
- `transactionTypes` is buy / rent / both.
- `propertyType` exists only in the **output** schema under classification.
- `startUrls` accepts canonical hashed search URLs only; friendly locality/project/SEO URLs are
  rejected.

**Verdict: Bengaluru yes, Commercial no.** Independently confirms the Store-page reading against
the actual schema.

### 4.3 `memo23/99acres-property-scraper` — CAN, but fails the gate

Live input schema (build 0.0.14) exposes exactly what is needed:

```
searchMode: buy | rent | pg | commercial
saleType:   resale | new-booking | all
city, propertyTypes, bedrooms, minPrice/maxPrice, minArea/maxArea, maxItems, ...
```

`commercial` is a first-class `searchMode`, and `city` accepts Bangalore. This is the only
evaluated actor that can express the requested inventory for **either** city.

**Verdict: capable. Was blocked at 93.6% by the reliability gate; that gate was WAIVED for this
actor by the owner on 2026-09-15 (§3.0), and it is now the approved source for both cities.** The
measured rate is unchanged at 93.6% — the waiver is an accepted risk, not a better measurement.

---

## 5. Where that leaves each city — UPDATED after the 2026-09-15 waiver

> The verdict line closing §4.3 ("blocked by the owner's reliability gate") predates the waiver in
> §3.0 and is superseded by this section. Both cities now have an approved source.

| city | approved source | capability | status |
|---|---|---|---|
| Udupi Commercial | `memo23` (waiver, §3.0) | `searchMode: commercial` + `city` | **source unblocked** |
| Bangalore Commercial | `memo23` (owner-named, §3.0) | `searchMode: commercial` + `city` | **source unblocked** |

The housing.com route remains closed and the finding stands: two independent actors — one written by
the owner, one from the Store — both reach Bengaluru and neither can narrow to Commercial. That
convergence suggests housing.com may not expose Commercial as a filterable search axis at all,
rather than either actor being deficient. Still stated as an **inference, not a finding**: it was not
verified against housing.com itself.

`memo23` serving Bangalore is a change of source for that city, and therefore of legal posture. It
was **not** taken on this lane's initiative; the owner made that call explicitly on 2026-09-15.

### 5.1 What is still binding, now that source is not

Source approval does not make the inventory problem go away. Two constraints survive it:

- ⚠ **The free-tier 100-item per-run cap — STATUS UNVERIFIED since the account was upgraded to
  `CUSTOM`/`BRONZE`.** ~~Not supply.~~ The *reasoning* stands wherever a cap binds: Bengaluru's
  commercial market is far larger than 100 rows, so a capped run is a **sample of that market, not
  coverage of it**, and must not be presented as Bangalore Commercial inventory in the sense the
  issue asks for. **What is no longer established is that the cap is still 100.** It is measured on
  the next run, not assumed in either direction.
- **Coordinate trust.** Udupi went 100 fetched → 29 coordinate-trusted → 11 staged; **71 of 100**
  were excluded as suspected locality centroids. If Bangalore behaves the same way under **whatever
  cap actually binds**, it yields a similar fraction and lands as thin as Udupi. This constraint is
  independent of the plan tier and is **unaffected** by the upgrade.

Because of that second point the Bangalore coordinate-trust ratio is measured and reported
**early — before any artefact set is built on it**. If it collapses the same way, the binding
constraint is the plan tier rather than the actor, and that is a fact the owner needs cheaply rather
than at the end of a finished pipeline.

**No synthetic data. No unnamed substitute source. No workaround of the 403.**

---

## 5.2 The Udupi "wider radius" request is NOT expressible by this actor — 2026-09-15

The owner asked for Udupi "in and around", i.e. **wider** than the existing 100-row capture. Checked
against the actor's live input schema before spending, the complete input field set is:

```
bedrooms · city · enrichEmails · includeProjects · maxArea · maxConcurrency · maxItems
maxItemsPerSearch · maxPrice · maxRequestRetries · minArea · minPrice · propertyTypes
proxy · saleType · scrapeDetails · searchMode · startUrls
```

Enums exist on `searchMode` and `saleType` only.

**There is no radius parameter, no multi-city parameter, and `city` is a single string.** So a
"wider-radius Udupi" run has no input that expresses it. The available options are all something
else:

1. **`city: "Udupi"` again** — the identical query that produced the committed capture. That run's
   own log recorded *"total 111 available, 100 pushed"*, capped by the free tier at that time.
   ⚠ ~~The account is still FREE with the same 100-item cap, so a re-run cannot go deeper than the
   original~~ — **that is now FALSE as to the plan and UNVERIFIED as to the cap.** The account is
   `CUSTOM`/`BRONZE` at $85. **If the cap did lift, this option changes character entirely**: the
   ~11 rows the original run excluded would become reachable, and a re-run would no longer be
   "probably nothing new". That makes measuring the cap a prerequisite to ruling on this option,
   not a detail.
2. **`startUrls` with a hand-built 99acres search URL** encoding a wider geography. Not pursued:
   obtaining such a URL is exactly the "go hunting for a canonical search URL" activity that was
   explicitly not authorised without asking first.
3. **Separate runs for neighbouring cities** (Mangalore, Kundapur — both already seeded in V71).
   These are *different cities*, not "around Udupi", and choosing them is a scope decision about
   what the product means by the market, not an implementation detail.

**Recorded as an evidence-backed blocker rather than acted on.** The same capability-before-spending
check ruled out both housing.com actors for Bangalore; it rules out this request the same way, and
for the same reason — an input the actor does not model cannot be coerced into meaning something
else without silently returning the wrong thing.

---

## 6. What would unblock each route

Each needs an owner decision; none may be inferred here.

> **Status, 2026-09-15:** options 1 and 2 below were both taken by the owner — the >99% gate was
> waived for `memo23` and it was named the approved source for **both** cities. Bangalore has since
> been acquired and staged (32 rows). ~~Option 4 remains live and now binds the Udupi question via
> the 100-item cap described in §5.2.~~ ⚠ **Option 4 was TAKEN — the plan was raised to
> `CUSTOM`/`BRONZE`, ceiling $85. Whether that released the 100-item cap is UNVERIFIED**, so the
> Udupi question is no longer bound by a cap known to be 100. Options are retained rather than
> deleted because the reasoning that produced them is what makes the decisions legible.

1. **Waive or adjust the >99% gate for `memo23`** — knowing it is 93.6% over 140 runs, and that the
   failure mode is a crashed run rather than wrong data. ~~a rerun is cheap at the free-tier
   100-item cap.~~ ⚠ **The cheapness argument is withdrawn as live advice:** it assumed the
   free-tier 100-item cap, which is **unverified** since the upgrade. On a per-result actor a
   released cap makes a rerun *more* expensive, not less — so this must not be read as a standing
   reason that reruns are cheap.
2. **Name `memo23` as the approved Bangalore source too**, accepting 99acres rather than
   housing.com for that city.
3. **Supply a canonical housing.com Commercial search URL** obtained legitimately, which would let
   `hermandev` run with the narrowing already encoded. Not pursued: acquiring such a URL was not
   authorised, and guessing at hashed URLs is not a legitimate route.
4. ✅ **Raise the plan — DONE.** ~~but only the owner may change billing, and the $5 free ceiling
   currently binds below the $10 authorised.~~ The owner raised it: measured `CUSTOM`/`BRONZE`,
   `maxMonthlyUsageUsd` **$85**. Only the owner may change billing, and only the owner did.
   ⚠ Whether the raise also released the **100-item per-run cap** is **unverified** — the cap was a
   free-tier limit and has not been re-measured.

Until one of these is decided, **Bangalore Commercial is unreachable and Udupi Commercial cannot be
re-acquired at a wider radius.** The existing immutable 100-row Udupi capture is unaffected and
remains the basis of the staged inventory.
