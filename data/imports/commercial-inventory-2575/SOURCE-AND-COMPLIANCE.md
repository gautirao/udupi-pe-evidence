# Issue #2575 — Commercial inventory acquisition: source, compliance and feasibility record

This is the `Required investigation / PLAN_REVIEW` artefact the issue asks for, recorded
**before** any acquisition or import code is written. It states what was measured, by what
command, and — equally — what is **not** established. Nothing here is promotion-ready.

---

## ⚠ SUPERSEDED IN PART — 2026-09-15. READ THIS BEFORE THE BODY.

**This document reasons from a pre-acquisition state that no longer exists.** It is retained rather
than rewritten because the earlier commits of this PR reasoned from it, and because the decisions
below are only legible against the constraints they lifted. But a reader who takes its assertions at
face value will be wrong about seven things.

⚠ **An earlier version of this passage claimed "each is corrected at its own section too". That was
FALSE for most of the table, and it is the worst class of error this PR has catalogued: the sentence
asserting the corrections had been made was itself an uncorrected claim.** A reader trusting it
would spot-check one section and generalise. Stated accurately instead:

- **Marked in place below**, with a ⚠ at the point of assertion: the FREE-tier 2–3× surcharge (§4.2),
  the "$0 spent" line (§4.3), and the "route is not taken" line (§4.3). These were the three still
  reading as live prose in the body — and the surcharge was the sharpest, because
  `actor-evaluation-2575.md` had already retracted it in place, so **two committed artefacts
  disagreed at their points of assertion** while only this table recorded the resolution.
- **Corrected HERE ONLY:** the scope preamble, the #2594 dependency note, the §1 verdict table, and
  §4.4's open decisions. **Their original wording is retained verbatim below and is NOT marked where
  it sits.** Read those against this table, never on their own.

| this document says | current state at head |
|---|---|
| "Scope of this lane: **Udupi** and **Bangalore**" (§ preamble) | **Three cities.** Mangalore acquired under owner ruling `5680529409`; Kundapur proved unobtainable from this source. |
| "Dependency: **PR #2594 (open)**" | **#2594 is MERGED**, synced here via `6dbc6e9c`. The OFFICE precedence correction arrived with no edit in this directory. |
| Bangalore: "**No.** … blocked on an owner decision" (§1, §3, §4) | **Acquired and staged — 32 rows.** The owner waived the >99% gate and named `memo23` for both cities on 2026-09-15. |
| "**Nothing has been run. No paid call has been made. $0 spent.**" (§4.3) | **Seven actor runs, $0.51285 spent** of a $5 account ceiling. |
| "`memo23` *could* serve Bangalore. That route is **not taken**" (§4.3) | **That route was taken**, by explicit owner decision — not on this lane's initiative. |
| "FREE tier carries no Store discount … typically **2–3×**" (§4.2) | **WITHDRAWN.** `actor-evaluation-2575.md` §2 retracts this: it came from general web material, not the actor's own pricing record, which shows a single flat `eventPriceUsd`. Two committed artefacts disagreed; this one was the stale side. |
| §4.4's three open owner decisions | **All three taken on 2026-09-15** — spend authorised, credential provisioned, terms decided knowingly. |

**Two things below are NOT superseded, and both still bind:**

- **The `robots.txt` 403 is still unresolved.** The owner decided to proceed *knowingly*; that is a
  decision, never verified permission, and no workaround was attempted or may be.
- **The >99% reliability gate was WAIVED, not met.** The measured rate stands at 93.6%. Anyone
  citing this actor's reliability must quote the measurement, not the approval.

⚠ **This file also contains two sections numbered §4.3.** Left as-is to avoid renumbering citations
that other artefacts and reviews already point at; noted so a reader is not misled into thinking one
is missing.

Scope of this lane: genuine, legally sourced **Commercial** inventory for **Udupi** and
**Bangalore**.

> **Dependency: PR #2594 (open).** That PR owns `normalise_v2.py`, the five-row OFFICE
> correction, its rollback, `cleanup-audit-2575.sql` and its tests. This lane does **not**
> modify, duplicate or re-derive any of them. The final Udupi artefact must incorporate
> #2594's corrected subtype precedence once it merges; until then Udupi output is not final.

---

## 1. Verdict up front

| City | Can this issue be satisfied from material already in the repo? |
|---|---|
| Udupi | **Partly.** An immutable Commercial capture exists (100 rows). It is **Sale-only**. |
| Bangalore | **No.** No Commercial capture exists. A new acquisition run is required. |

Bangalore is **blocked on an owner decision** (section 4).

---

## 2. Udupi — what actually exists

Immutable capture: `data/imports/udupi-properties-2304/raw-99acres-commercial-output.json`
(100 rows, already PII-sanitised — see section 6).

Raw `propertyType` distribution, and the canonical subtype each maps to. The mapping vocabulary
is `CommercialFieldOptions.VALID_COMMERCIAL_SUBTYPES` = {SHOP, OFFICE, BUILDING, WAREHOUSE,
LAND}; nothing below is invented, and ambiguous labels are **not** guessed.

| rows | raw `propertyType` | canonical subtype |
|---:|---|---|
| 31 | Commercial Land/Inst. Land | LAND |
| 21 | Commercial Shops | SHOP |
| 9 | Ready to move office space | OFFICE |
| 5 | Industrial Lands/Plots | LAND |
| 2 | Commercial Showrooms | SHOP |
| 2 | Ware House | WAREHOUSE |
| 1 | Bare shell office space | OFFICE |
| **71** | **cleanly mappable** | |
| 19 | Agricultural/Farm Land | **not Commercial** — AGRICULTURAL family, must not be promoted as Commercial |
| 4 | Other | reject / UNKNOWN |
| 2 | Factory | ambiguous — no reviewed rule exists |
| 2 | Guest-House/Banquet-Halls | ambiguous — no reviewed rule exists |
| 2 | Hotel/Resorts | ambiguous — no reviewed rule exists |

The 19 Agricultural rows sitting inside a capture named "commercial" are exactly the
"no Residential/other-family leakage into Commercial" hazard the issue calls out. They are
present in the source and must be rejected explicitly, not silently dropped.

### 2.1 Two facts that limit what Udupi can prove

**Sale-only.** All 100 rows carry `transactionType = "Sale"`. The sibling rent capture
(`raw-99acres-rent-output.json`) is Residential-only. So there is **no Commercial Rent row for
Udupi anywhere in the repo**. Any "Rent uses monthly-rent semantics" or "no null sale-only price
band on Rent rows" check run against Udupi data alone would be **vacuous** — it would pass by
having nothing to test. This is recorded now so that a later green result is not mistaken for
coverage.

**Coordinate trust collapses the usable set.** Of 100 rows, **0** have null coordinates but only
**29** have a coordinate unique to themselves; the other 71 share a coordinate with at least one
other row. `normalise_v2.coordinate_trusted_rows` treats a shared coordinate as suspected
locality-centroid fallback unless every sharer carries an identical building/project name. That
filter is why the committed `import.sql` carries only **11** COMMERCIAL rows, not 71.

Consequence for verification: coordinate-untrusted rows may be **staged**, but they **cannot**
support a map/list parity claim. They will be reported as staged-not-promoted rather than
quietly excluded.

---

## 3. Bangalore — why existing material cannot satisfy this issue

Candidate: `data/imports/bangalore-housing-1723/full-bengaluru/raw-apify-output-union.json`
(1782 rows).

It is **Residential-only**. That was not taken on trust — the obvious field is misleading and
was checked against three independent signals:

- `propertyType` holds `resale` (1188) / `project` (594). This is **listing origin, not property
  type**, so it cannot be used to rule Commercial in or out either way.
- `label` is `null` on **all 1782** rows.
- `bedrooms` is populated on **1781 of 1782** rows — a bedroom count is a Residential signature.
- `propertyTags` values are purely residential/possession semantics (Ready to Move, Under
  Construction, RERA Approved, furnishing states, Possession: <month year>).

No Commercial subtype vocabulary appears anywhere in the file. **A new Commercial-specific
acquisition is genuinely required**; there is nothing to re-cut.

---

## 4. The blocker — SUPERSEDED 2026-09-15, and the reason changed

> **This section originally recorded three blockers: no credential, unauthorised spend, and
> unverified source terms. All three were resolved by the owner on 2026-09-15.** The original text
> is superseded rather than deleted, because it is what the earlier commits of this PR were
> reasoning from, and a reader comparing them needs to see what moved.
>
> **Acquisition is now authorised — and both routes are still blocked, for entirely different
> reasons.** Full measurements in `actor-evaluation-2575.md`; the summary is below.

### 4.0 What the owner decided, 2026-09-15

- **Acquisition authorised**, with a spend ceiling and a hard reliability gate.
- **A rotated `APIFY_TOKEN` was provisioned** into the gitignored, untracked `apps/api/.env` of the
  main workspace. It is read privately and passed to `curl` via `--config` on stdin, so it appears
  in no argv, process listing, shell history or transcript. No value derived from it is recorded in
  this repository.
- **Source terms: the owner decided knowingly.** The unverified-permission question was put to them
  twice, including that the existing committed Udupi Commercial capture came from the same
  third-party actor, so the answer applies retroactively. They said proceed.
  **This is recorded as a decision taken knowingly, NOT as verified permission.** The
  `robots.txt` **403 remains unresolved** — an ordinary fetch was refused, no workaround was
  attempted, and none may be. A later reader should treat collection permission as open and
  owner-accepted, not as established.

### 4.1 Credential — RESOLVED (the original finding below is retained as superseded)

~~No Apify token or API key is present under any name.~~ That was true when written, and was
established by enumerating every environment file with `ls` rather than `rtk find` — the latter
hides gitignored files, so a zero from it would have been a filtering artefact rather than absence.
A token has since been provisioned. The enumeration method is retained because it is the reason the
original claim was trustworthy.

**Verified working, at zero cost:** one authenticated `GET /v2/users/me` returned HTTP 200.

### 4.2 Spend — AUTHORISED, but the account ceiling binds below it

⚠ **SUPERSEDED — THE ACCOUNT WAS UPGRADED.** ~~The plan is **FREE**, with a **$5/month** platform
ceiling and a **100-item per-run cap** on free tier. The authorised ceiling is higher than that, so
**the plan is the binding constraint, not the authorisation.**~~

**Re-measured by the same zero-cost `GET /v2/users/me`: plan `CUSTOM`, tier `BRONZE`,
`maxMonthlyUsageUsd` **$85**.** At $85 the plan is **no longer** the binding constraint.

🔴 **The 100-item cap is NOT corrected — it is UNVERIFIED.** It was a *free-tier* limit; the tier has
changed, so it may have lifted, but **inferring that from the tier change would be assuming the thing
to be measured.** It is measured on a run's actual returned rows against its requested cap, or it
stays unknown. Full treatment in `actor-evaluation-2575.md` §2.

⚠ **WITHDRAWN — this claim is false and was retracted in `actor-evaluation-2575.md` §2 before it was
marked here, so two committed artefacts disagreed at their points of assertion while only the table
at the top of this file recorded the resolution.** ~~FREE tier also carries no Store discount, so
published "from $X / 1,000 results" rates are *best-tier* figures and the effective cost here is
higher — typically 2–3×. A cost estimate quoting the headline would understate the spend.~~

**Why it was wrong:** it came from general web material about Apify plan tiers, not from the actor's
own pricing record, which exposes a single flat `eventPriceUsd` of $0.0025 per result and shows **no
evidence of a FREE-tier surcharge**. The measured runs bear this out: $0.25005 for 100 rows is
exactly 100 × $0.0025 + $0.00005, with no multiplier.

⚠ ~~The 100-item cap also confirms the earlier observation: the previous run's `totalCap: 100` despite
requesting 600 was the tier, and **it persists on the rotated account**.~~ **"Persists" was measured
on the FREE-tier account and cannot be carried across the upgrade.** `totalCap: 100` against a
requested 600 is a real historical observation of those runs; whether it still holds on `BRONZE` is
**unverified**, and no plan may rest on it either way until a run measures it.

### 4.3 THE CURRENT BLOCKERS — reliability gate and capability

⚠ **SUPERSEDED — true when written, false at head.** ~~**Nothing has been run. No paid call has been
made. $0 spent.**~~ **Seven actor runs, $0.51285 spent** of the **then-$5** account ceiling (since
upgraded — see §4.2): 2 × $0.25005 full
captures (Bengaluru, Mangalore) + 4 × $0.00005 zero-row Kundapur probes + $0.01255 for the 5-row
Mangalore positive control that makes the Kundapur result a proof rather than an unexplained zero.

The owner imposed a hard gate: an actor must show **>99% runs succeeded** before use. Measured from
each actor's own API statistics, so the denominator is stated:

| actor | 30-day runs | succeeded | rate | denominator | gate |
|---|---:|---:|---:|---|---|
| `memo23/99acres-property-scraper` | 140 | 131 | **93.6%** | 34 users / 26 monthly — real | **FAIL** |
| `hermandev/housing-com-property-scraper` | 56 | 56 | **100.0%** | 4 users / 2 monthly — weak | pass, weakly |

Capability, checked against each actor's **live input schema** via the API rather than its Store
page — because an *output* field named `propertyType` is not an input filter, and that distinction
is the entire question:

| actor | Bengaluru | Commercial | verdict |
|---|---|---|---|
| `apify-actors/housing-scraper-udupi` (owner's own) | **no city input at all** | **no** | cannot |
| `hermandev/housing-com-property-scraper` | yes | **no** | cannot |
| `memo23/99acres-property-scraper` | yes | **yes** (`searchMode: commercial`) | capable, fails gate |

So **the only capable actor fails the gate, and the gate-passing actors cannot express Commercial.**

Two independent housing.com actors — one written by the owner, one from the Store — both reach
Bengaluru and neither narrows to Commercial. That convergence suggests housing.com may not expose
Commercial as a filterable search axis at all. Stated as an **inference, not a finding**: it was not
verified against housing.com itself.

⚠ **SUPERSEDED — the route WAS taken, by explicit owner decision on 2026-09-15, not on this lane's
initiative.** ~~`memo23` *could* serve Bangalore. That route is **not taken** — it fails the gate,
and using a different source for Bangalore than the one the owner named is a change of legal posture
that is the owner's call.~~ The owner **waived** the >99% gate (measured 93.6%, unimproved by the
waiver) and named `memo23` the approved source for both cities. 32 Bengaluru rows were staged.

**Unchanged and still binding:** **No synthetic data, no unnamed substitute source, no workaround of
the 403** — which remains unresolved, and which neither the waiver nor the source approval converts
into permission.

Four routes could unblock this, each an owner decision; they are enumerated in
`actor-evaluation-2575.md` §6.

| scenario | results | cost at headline rate |
|---|---:|---:|
| same 100-row cap as the Udupi run | 100 | ~$0.25 |
| cap lifted to the requested `maxItems` | 600 | ~$1.50 |

Cost is small; **that does not make it mine to spend.** No run has been attempted.

### 4.3 Source terms are NOT verified — and I did not route around that

`https://www.99acres.com/robots.txt` returned **HTTP 403** to my fetch. I did **not** attempt any
workaround, since circumventing an access control is exactly what this issue forbids.

So the collection-permission check the issue requires (`SOURCE TERMS / COLLECTION PERMISSION
CHECK`) is **open, not satisfied**. It must be closed by the owner — who can retrieve the policy
under normal browser conditions and confirm the actor's own terms posture — **before** any
Bangalore run, not after.

### 4.4 What the owner is being asked to decide

1. Whether to authorise a **paid** acquisition run at all, and on which plan.
2. Provisioning an **Apify credential** into the workspace (no run is possible without one).
3. Confirming the **source-terms / robots posture** for 99acres commercial paths (4.3).

Until all three are settled, Bangalore Commercial cannot be delivered. **No synthetic data will
be substituted** — that is explicitly out of bounds, and would defeat the point of the issue.

### 4.5 Housing.com — robots is an OPEN DISCLOSURE, and the 406 mechanism I first reported was WRONG

**Everything in §4.0–§4.4 concerns 99acres and its 403. None of it reaches housing.com.** The owner
rulings recorded above do not cover this route, and nothing in this section may be read as covered
by them.

**What was measured, at zero spend.** Run `0MSBfSOFMzc4PxSYe` on Actor `NLT0rrdd0BTA6teQy`
(build 0.0.7) ran with **`respectRobotsTxtFile: true` explicitly set in its input** — not merely
defaulted — through an Apify `RESIDENTIAL`/`IN` proxy, `includeDetails: false`, `maxPagesPerUrl: 1`,
against `/commercial/buy/commercial-property-for-sale-in-jayanagar-bengaluru-P5vem1jmqfgn3h0vo`.
It returned `requests_finished: 1`, `requests_failed: 0`, and logged *"Discovered 20 structured
results on the first page."*

Crawlee's `respect_robots_txt_file` **skips a disallowed URL before it is requested**. The request
was made and served.

🔴 **THE INFERENCE THIS PARAGRAPH ORIGINALLY DREW IS RETRACTED — IN THE SAME SECTION THAT PUBLISHED
IT, ONE COMMIT LATER.** It read: ~~"So robots — read through that proxy by the enforcement mechanism
itself, rather than by my assertion or anyone's opinion — does not disallow that path."~~ **That does
not follow from a served request, and I committed it and put it on the PR.**

**Why it does not follow.** Crawlee must *fetch* `robots.txt` in order to apply it, and an
**unfetchable** `robots.txt` is conventionally treated as **allow-all**. `https://housing.com/robots.txt`
returns a WAF **"Security Alert — Request Blocked"** HTML page to at least some clients — captured in
this lane and deliberately **NOT committed**, because it embeds a real client IP address and a block
reference ID.

⚠ **PROVENANCE OF THAT CAPTURE, ESTABLISHED AFTER IT WAS FIRST CITED — which is the wrong order, and
is recorded here rather than quietly fixed.** The file sits in a **shared** scratchpad, so *"captured
in this lane"* was an attribution asserted before it was checked. It holds; that is luck, not method.
A file one did not write, in a shared directory, with a plausible filename, is the artefact one is
least likely to question. What actually supports the attribution:

- **Filename prefix** `lane2575inv-` — this lane's own prefix.
- **Timestamp clustering:** five robots captures in two bursts — magicbricks `14:41:31`, nobroker
  `14:41:33`, housing `14:41:34`, commonfloor `14:43:44`, squareyards `14:43:45`. That is a batch
  source-evaluation sweep across candidate sources, not a stray file.
- **Timeline fit:** all five precede the Actor's first build (`14:56:04`) and first run (`14:57:55`)
  by roughly fifteen minutes — where source evaluation sits in this lane's own record.
- **Content-internal origin evidence:** the page references `assets-0.housingcdn.com` for its favicon
  and logo. A block page served by a *different* site would not carry housing.com's CDN, so origin is
  evidenced by the artefact itself and not merely by its name.
- **Outlier shape:** of the five, magicbricks and commonfloor are both exactly 387 bytes, nobroker
  1,125 and squareyards 2,544 — plausible robots files. Housing alone is 3,630 bytes of WAF HTML.

🔴 **AND THE RESIDUAL GAP IS REAL.** The file holds a response **body**, not a status line, and **no
committed script fetched it** — `lane2575inv-store-search.sh` mentions robots only in header
comments. So the pairing of *"HTTP 406"* with this body rests on this lane's contemporaneous record
and **is lane testimony**. The page's existence and content are attributable; **the status code
attached to it is not independently evidenced.** **So a served request is equally consistent with two states: robots permitted the path,
or robots was unreadable and the crawler defaulted to permitting everything.** No log line in any of
the five runs reports a robots fetch succeeding *or* failing; the only robots-related line is the
WARN, which proves the **option was enabled** — not that a **fetch occurred**. The two states cannot
be distinguished from the available evidence, so the claim is **unproven, not merely imprecise**.

**What survives is the observation, never the inference:** with `respectRobotsTxtFile: true`
explicitly set, the request was made, served, and returned 20 discovered results. **Whether
`robots.txt` permits that path is UNKNOWN, and nobody on this lane has ever read the file.**

🔴 **AND THE BLOCK PAGE RECASTS THE "ENGINE DIFFERENCE" BELOW AS A BOT-DETECTION DIFFERENCE.** Its
own *Common Causes* list names **"Use of bots or scrapers"** and **"Suspicious VPNs/proxies"**. The
HTTP-only client is refused; Playwright behind an Indian residential proxy is not. **That is the
difference between being detected as automated and not being detected** — so choosing the second
*because* the first is blocked would be selecting the configuration that evades an anti-bot control,
which is a different act from respecting robots. **No acquisition run is being made on this route
pending an owner ruling taken with that page in front of them.** Nothing in this section may be cited
as permission to proceed.

⚠ **EVERY MEASUREMENT IN THIS SECTION IS LANE TESTIMONY.** It comes from authenticated calls to an
external API; there is no committed transcript and there cannot be one a reviewer could re-run. These
figures carry exactly the status of the account-tier figures in `actor-evaluation-2575.md` §2 —
testimony, not reproducible evidence.

**What that does NOT establish, stated in the same breath.** One locality URL, not the host. An
observation timestamped 15:11 on 2026-09-15 — **of a request being served, not of any robots
directive being read** — and therefore not a standing permission of any kind.

⚠ **THREE BUILDS DO THREE DIFFERENT JOBS, and conflating them is easy because most sentences name
only one.** Stated explicitly so the next reader does not reconcile them wrongly:

| build | id | role |
|---|---|---|
| **0.0.7** | — | executed the robots run above (`0MSBfSOFMzc4PxSYe`, 15:11) |
| **0.0.8** | `SfTw5fn1vBlSfdCvb` | the build **identified for acquisition**, read from the Actor record: `sourceType GIT_REPO`, branch `feat/housing-commercial-actor`, commit `eb1ff36a` |
| **0.0.12** | `HfTAlPRyhKCWTFFPT` | the **live** build (`taggedBuilds.latest`) at the time of writing |

Review `5688421347` recorded: *"`0.0.8` appears nowhere in any artefact … If any held fact is believed
pinned to `0.0.8`, that belief is not sourced **from these artefacts**."*

⚠ **AN EARLIER REVISION OF THIS PARAGRAPH MISQUOTED THAT, AND THE MISQUOTE WAS UNFAIR TO THE REVIEW.**
It paraphrased the sentence as an unqualified claim that such a belief was *"unsourced"* and called
that half wrong. **The review's qualifier — "from these artefacts" — made its sentence literally
true.** Dropping a qualifier while characterising someone else's words is the same class of defect
this section exists to correct, committed against a reviewer rather than against the record.

**What the sentence nonetheless led a reader toward was wrong**, and the review said so itself rather
than defending the technicality: `0.0.8` **was** sourced on this PR twenty minutes earlier, in
comments `5688113254` and `5688283423`, which record it read from the Actor record. The sourcing sat
in **PR comments** — the second of the three surfaces a tree sweep cannot reach — so a sweep of
artefact *files* could not see it. It is recorded in this table so it no longer lives only there.

**Twelve builds landed in six hours on 2026-09-15**, so every figure on this route is **BUILD-PINNED**:
re-read `taggedBuilds.latest` before reusing any of them, and treat a figure whose build you cannot
name as unpinned rather than current.

⚠ **CRAWL-DELAY IS DEFINITELY NOT ENFORCED. WHETHER ANY ROBOTS *RULE* WAS ENFORCED IS UNKNOWN.**

🔴 This paragraph previously opened ~~"Rules are enforced; crawl-delay is NOT."~~ **That first clause
is retracted along with the inference above.** It asserts the same unproven thing while *wearing the
costume of a limitation* — which is precisely why it survived two rounds of correcting the louder
claims. A sentence that concedes something scans as a caveat rather than an assertion, so nobody
audits it, least of all its author.

What is directly evidenced: the run WARNs that `respect_robots_txt_file` is enabled while the crawler
is not using `ThrottlingRequestManager`, so crawl-delay directives are **not honoured**. What is
**not** evidenced: that any robots *rule* was enforced — **a ruleset that was never fetched cannot
have been enforced**, and nothing in the logs shows one was fetched. `maxRequestsPerMinute`
(default 20) is the only real rate control. Immaterial at one page; **material at any scale**, and it
goes to the owner *before* scaling rather than after.

🔴 **MY ORIGINAL 406 REPORT NAMED THE WRONG MECHANISM, AND THE WRONG ONE WOULD HAVE MISDIRECTED THE
NEXT ATTEMPT.** I recorded the 406 as *"a fact about my fetch path"* and escalated it as a robots
question. Refusing to generalise it to Housing.com policy was right; **the cause was wrong**, and it
pointed at proxies. Measured, there are two causes and **neither of them is robots**:

| cause | evidence |
|---|---|
| **HTTP-only client** | `iEuxzzKpThOjTTitE` (build 0.0.1) used a BeautifulSoup crawler on the **same** `/commercial/` URL, robots `true`, same residential proxy → **406**. Playwright on that identical URL → **20 results**. Same URL, same proxy, same robots setting; the **engine** is the entire difference. |
| **`/in/buy/…-fid` path family** | Three runs on `https://housing.com/in/buy/{udupi,mangalore}/…agricultural-land-fid` → **406 on every request, under Playwright**, robots `true`, residential proxy, across builds 0.0.9–0.0.11. This is also how **Agricultural** is refused: at source, not by a capability gap in the Actor. |

**A 406 is a SERVER refusal. A robots refusal is a SKIPPED request carrying no status code at all.**
Conflating the two is what produced the original escalation, and it is the correction most worth
carrying forward from this section.

**The binding constraint on this route is now COMPLIANCE — an unresolved owner ruling on the
bot-detection posture.**

🔴 This paragraph previously opened ~~"The binding constraint on this route is START-URL DISCOVERY —
not robots, not cost, not plan."~~ **Both halves of that sentence are corrected, and it is the
retraction reaching one layer further than it first did.**

- **"Not robots" was licensed by the inference retracted above.** Robots status is **UNKNOWN, not
  excluded** — a constraint cannot be ruled out while its status is unread. The exclusion was only
  ever available while the served-request inference stood, and it outlived it.
- **The operative blocker changed when this section stopped the route.** *"No acquisition run is
  being made on this route pending an owner ruling"* is a **compliance gate that binds BEFORE
  start-URL discovery ever becomes the limiting factor.** A reader planning next steps from the old
  sentence would go hunting for start URLs while the actual gate is an owner decision.

**START-URL DISCOVERY is the SUBSEQUENT constraint**, and it binds only if the owner opens the route.
`validate_start_url` accepts any `https://housing.com/commercial/**` path, but **acceptance is not
availability**: an empty result logs *"No Commercial listings were returned"* and exits 0 with no
items. The one proven URL is locality-scoped with an **opaque id that cannot be invented** for
another city. Bengaluru has exactly one proven locality; **Udupi and Mangalore have no known-working
`/commercial/` URL at all.**

### 🔴 THE COMMIT MESSAGE OF `1c1ac202` CARRIES ALL FOUR RETRACTED CLAIMS AND CANNOT BE FIXED

`1c1ac202` is the commit that published this section. Its message still asserts the following in
**unmarked prose** — not quoted, not struck, not inside any correction:

| # | what `1c1ac202`'s message still says | retracted at |
|---|---|---|
| 1 | *"a served request is **a reading of robots by the enforcement mechanism** rather than by my assertion"* | `5f16fb1b` |
| 2 | *"**A reading** timestamped 15:11, not a standing permission"* | `ae2521c4` |
| 3 | *"**Rules are enforced**; crawl-delay is NOT"* | `ae2521c4` |
| 4 | *"THE BINDING CONSTRAINT on this route is start-URL discovery, **not robots**, not cost, not plan"* | `30894d20` |

**A pushed commit message cannot be edited without a history rewrite, which is not authorised here.
This paragraph is the pointer that contradicts it** — an unfixable artefact stands uncontradicted in
the history unless a fixable one names it, exactly as `mangalore-acquisition-report.md` does for
`d8af14a1`. **Anyone reading `1c1ac202`'s message should read this section instead.**

**Scope, established by enumeration rather than assumed.** All fifteen commits on this branch were
swept for the four claim forms. **`1c1ac202` is the only message carrying any of them live.**
`ae2521c4` matches claim 3 and `30894d20` matches claim 4 **because each quotes the claim in order to
retract it** — quotation, not assertion. No other commit matches at all.

⚠ **AND THE FIRST SWEEP THAT PRODUCED THAT SCOPE WAS WRONG, WHICH IS THE MORE USEFUL RECORD.** A
single-line substring probe reported claims **1 and 4 absent** from `1c1ac202` — because the message
**wraps them across line breaks** (`"a reading of robots by the" / "enforcement mechanism"`, and
`"not robots," / "not cost, not plan"`). Only a **whitespace-normalised** re-run found all four. It
was caught because the message had already been **read directly** beforehand; had the probe been
trusted, this pointer would have named two claims and declared the class closed. **Normalise
whitespace before matching any multi-word string against wrapped text, and prefer reading the
artefact to matching it.**

**Status: OPEN DISCLOSURE, not a cleared gate.** Owner direction `5686589119` post-dates this
escalation and does not address it; no ruling on the housing.com robots posture has been recorded
anywhere. This section states what was measured and what remains unread. **It records no acceptance
by anyone, and nothing in it may be cited as permission.**

---

## 4.6 THE HOUSING.COM ROUTE IS PAUSED — a THIRD state, and a pause is not a clearance

⚠ **PROVENANCE OF THIS RULING, STATED FIRST BECAUSE IT IS A RELAY.** This decision reached the lane
through the orchestrator on **2026-09-16**, quoting the owner in session:

> *"wait on housing.com, the new apify actor is being reworked, so pause for now."*

**This lane did not witness the exchange, and NO PR COMMENT CARRIES IT.** Every comment on #2597 after
`5688832978` is a reviewer claim/completion marker; none is an owner ruling. **So this paragraph is
the durable record, and it is a relayed one.** If the relay and any later owner statement disagree,
the owner's own words on the PR govern and this is superseded. Recorded this way because an earlier
ruling on this PR existed only in lane messages and reviewers correctly declined to treat it as
durable until it was posted.

### It is neither option the reviewers offered

The sticky item (`5688549579`, restated at `5688785969`) offered **A** — keep the route blocked until
a clearly permitted acquisition route is established — or **B** — record housing.com unavailable and
proceed 99acres-only. **The ruling is neither.** The route is **paused pending Actor rework**: not
cleared on compliance, not written off as unavailable.

🔴 **THE A/B ITEMS REMAIN OPEN AND UNCHOSEN. The question is DEFERRED, not ANSWERED**, and neither may
be closed as though it had been selected.

### What the pause does NOT resolve — enumerated, because a pause is the easiest thing to mistake for a clearance

| still open | why the pause does not touch it |
|---|---|
| **The robots posture** | Nobody has read housing.com's `robots.txt`; the WAF block page stands. **The pause is about the ACTOR, not about PERMISSION.** |
| **Crawl-delay non-enforcement** | `ThrottlingRequestManager` absent. Owner-facing **before** any scaling, unchanged. |
| **Udupi / Mangalore `/commercial/` URLs** | Still no known-working URL for either city. |
| **The bot-detection finding** | If a reworked Actor reaches the source, **how** it reaches it is still the question. A different client engine or proxy posture does not by itself make access permitted. |

### 🔴 EVERY HOUSING.COM FACT IN THIS DOCUMENT IS NOW PROVISIONAL

Measured facts were already **build-pinned**. With rework confirmed, they are **pinned to a moving
target**: twelve builds landed in six hours on 2026-09-15, **three runs on the Actor were not this
lane's**, and the owner now confirms it is being actively reworked.

**Superseded by any rework, and to be re-measured rather than read:** the cost model and its 86%
residential-proxy split · PII exposure at search level · `includeDetails` emission behaviour · the
`propertyType` → `COMMERCIAL_BUILDING` silent default · the 20→5 `maxListings` truncation · the 406
mechanism and its two causes · the input schema itself. **All measured against builds `0.0.7` and
`0.0.8`.**

### Resumption checklist — re-measure, do not read

Recorded now while the detail is fresh and cheap. Anyone resuming this route establishes each of these
**before** relying on anything above:

1. **The client engine**, and whether `robots.txt` has become readable at all.
2. **Whether the `/commercial/` path family still serves**, and whether `/in/buy/…-fid` still 406s.
3. **Whether city-level targeting exists as a real input**, rather than only `startUrls`.
4. **The cost model** and its proxy/compute split — platform-billed, so it does not transfer from any
   per-row actor.
5. **Whether the 100-item cap binds**, measured as returned rows against a requested cap.
6. **PII exposure at BOTH search and detail level** — `sellerId`/`sellerProfileUrl` were schema-present
   but empty at search level, so they surface at detail.
7. **Whether a `SUCCEEDED`/exit-0 run still masks a transport failure in the log.** It did before; run
   status was never evidence on this Actor.

### What is NOT paused

**The pause is scoped to the housing.com acquisition route alone.** It does not touch **condition 3**
(an open owner decision on the **99acres** promotion gate), this PR's own state, or the `1c1ac202`
pointer work above. Nothing about the pause makes any of those resolved.

**Final state of this attempt: nothing was run, nothing was spent, nothing was promoted, and all three
cities stand at 0 fetched / 0 staged from this source.** That is now the terminal record of the
housing.com attempt rather than a holding position.

---

## 5. Constraints any import artefact in this lane must satisfy

Established by reading the schema, not assumed.

**V135 installs a deferred constraint trigger over the V102/V104 seam.** `commercial_subtype`
exists in two places: `property_listings.commercial_subtype` (V104, write model) and
`listing_commercial_space_details.commercial_subtype` (V102, read model — what every Discover
surface actually reads). V135 backfills them into agreement and then **guards** it: a write that
reaches V104 without converging V102 now **fails at COMMIT**. Guard scope is
`property_type = 'commercial' AND property_listings.commercial_subtype IS NOT NULL`.

Routing is by `property_type`, not `listing_family`:

```
commercial          -> SHOP | OFFICE | NULL -> listing_commercial_space_details
commercial_building -> BUILDING             -> listing_commercial_building_details
warehouse           -> WAREHOUSE            -> listing_warehouse_details
commercial_land     -> LAND                 -> listing_commercial_land_details
```

Only `listing_commercial_space_details` carries a `commercial_subtype` column. An OFFICE listing
routed to the building table is **structurally unrepresentable** — which is precisely the defect
PR #2594 is correcting, and the reason this lane must not re-derive that mapping independently.

**No provenance columns exist.** `git grep` over
`apps/api/src/main/resources/db/migration/*.sql` finds no `source_platform` column; the existing
import carries provenance only inside `parsed_data` jsonb, with identity derived as
`(md5('<source>:' || <id>))::uuid`. The issue's preferred identity
`(source_platform, source_listing_id)` therefore has **no schema support today** and needs a
staging table — the repo's established pattern for this is the expand-only staging convention
used by V115/V118/V121.

**The existing `import.sql` must not be re-run.** Two independent reasons:
it writes `status = 'LIVE'` directly — contradicting this issue's requirement that scraping alone
cannot make a listing LIVE — and it uses `ON CONFLICT DO NOTHING` throughout, so against
already-imported rows it would silently no-op while appearing to succeed, **and** it still
carries the pre-#2594 OFFICE mis-mapping.

---

## 6. PII posture

The committed 99acres artefacts are **already sanitised**. Verified on the artefact at the
current `main` head: `dealerName`, `companyName`, `builderName`, `description` and `reraId` are
**absent from all 100 rows** (count = 0 for each).

`sanitize_pii.py` + `pii_filter.py` are the executable record of that removal and are the right
tooling to reuse for any new capture. The filter is value-shaped first (key-agnostic sweep over
every string leaf), with the field denylist as a second layer, and `pii_residuals.py` re-runs the
detectors afterwards and **fails closed**.

A correction worth recording, because it nearly became a false claim in this document: an
earlier pass of this investigation measured `dealerName` populated on 100/100 rows and two
email-shaped values. Those figures came from the repository's **main working checkout, which is
behind `origin/main`** and still holds the pre-sanitisation copies. The worktree at the current
head is the sanitised one. Any future analysis in this lane must read the worktree, not the
stale checkout.

### 6.1 Incidental finding — not this lane's to fix

`data/imports/bangalore-housing-1723/full-bengaluru/raw-apify-output-union.json` is **not swept
by `sanitize_pii.py`** — that script's file list covers the three 99acres captures and
`raw-apify-output.json` in the Udupi directory only. The union file still carries `description`
(1586 rows), `descriptionMarkdown` (549 rows) and `sellerFirm` (1782 rows).

That is committed Residential data belonging to issue #1723, outside this lane's mandate. It is
**reported, not modified** here. Field names and counts only — no values were read out.

---

## 7. What happens next in this lane

Not blocked by the owner decision, so proceeding:

- staging design with real provenance identity and an explicit, separately-testable promotion step;
- a source-specific adapter in **new files** (no edits to `normalise_v2.py`);
- validation + honest reject reporting, including the 19 Agricultural and 4 Other rows;
- idempotency and update-not-duplicate semantics;
- isolated verification on this lane's own stack (API 8320 / web 5320 / Postgres 5520).

Blocked pending section 4: the Bangalore Commercial acquisition itself.

Before any zero-row result is reported as evidence of absence, the parameter behind it will be
shown to be **bound** — an invalid value producing a 400 against a control returning 200 —
because an inert parameter returning zero is indistinguishable from genuine absence.
