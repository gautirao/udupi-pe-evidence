# Property Listing Verification & Trust System — Product Spec

**Version:** 1.0
**Status:** Approved
**Market:** India (Bengaluru / Udupi launch)

---

## 1. Overview & Philosophy

This spec defines the verification and trust architecture for the real-estate portal.

### Core philosophy

**Strict on badge meaning. Flexible on listing intake. Progressive on trust elevation.**

- Listings must be easy to publish if they pass basic anti-fraud and completeness checks.
- Trust badges must be hard to earn and impossible to misrepresent.
- Higher trust must produce concrete product benefits so sellers are motivated to climb the ladder.

### The three decisions that must never be conflated

1. **Can this listing be published?** — minimum completeness + anti-fraud bar
2. **What badges can this listing show?** — specific earned trust dimensions
3. **How high should this listing rank?** — trust tier + ranking score within tier

These are separate product decisions with separate rules.

### Two questions answered for every buyer

Every listing detail page must answer both of these explicitly:

- *Has this listing been verified to exist?* — Location, Photos, Field badges
- *Has this person been verified as authorised to market it?* — Authority to List, Ownership Docs badges

These must never be conflated in UI copy.

---

## 2. Actor Model

Actor type is the foundation of the entire verification system. Every listing belongs to one of four actor types.

| Actor | Description | Primary trust concern |
|---|---|---|
| **Owner** | Individual selling or renting their own property | Identity + ownership proof |
| **Broker / Agent** | Third party listing on behalf of owner | Identity + authority to list |
| **Builder / Promoter** | Developer listing project inventory | Project legitimacy + RERA |
| **Channel Partner** | Authorised reseller for a builder project | Builder authorisation proof |

### Existing schema alignment

`seller_type` already exists on `property_listings` (V33) with values `owner`, `dealer`, `builder`. The value `dealer` maps to Broker/Agent in this spec. No migration required for actor classification.

**Terminology:** This spec uses "Broker" as the human-readable term for the `dealer` actor type. `dealer` is the legacy code/schema value and appears in backticks when referencing code. Buyer-facing copy says "Listed by Broker."

### Buyer-facing display

Actor type must be visible to buyers on every listing card.

**Phase 1:** Display actor type using existing `seller_type` values:
- `owner` → "Listed by Owner"
- `dealer` → "Listed by Broker"
- `builder` → "Listed by Builder"

Phase 1 does not include portfolio metrics — these require broker reputation infrastructure (Phase 2).

**Phase 2:** Add reputation context alongside actor type:
- "Listed by Broker · 47 verified listings · 89% authority confirmed"

**Rule:** Never show actor type alone without any trust signal. In Phase 1, the trust signal is the badge stack on the card (top 2 earned badges). In Phase 2, it is the badge stack plus broker metrics.

**Note on Channel Partner:** Channel Partner is a Phase 3 actor type. It requires adding `'channel_partner'` to the `seller_type` CHECK constraint (new migration) and builder authorisation proof flows. No Phase 1 or Phase 2 work needed.

---

## 3. Publication Policy

### 3.1 Minimum bar to publish

A listing can go live when all of the following are true:

- Account phone OTP verified
- Basic address fields filled (locality, at minimum)
- Map pin placed
- Minimum 3 photos uploaded
- No hard fraud trigger hit (see §11)

Owner OTP, document review, and field verification are **not** required to publish.

### 3.2 Trust states

Trust states are derived from multiple columns and are orthogonal to the existing `listing_status` lifecycle enum (`SCRAPED / DRAFT / PENDING_REVIEW / LIVE / REJECTED / ARCHIVED`). Do not merge trust into the lifecycle enum.

| Trust state | How it is derived |
|---|---|
| **Unverified** | `listing_status = LIVE` and `trust_tier = D` |
| **Trusted** | `listing_status = LIVE` and `trust_tier IN (A, B, C)` |
| **Needs Re-verification** | `listing_status = LIVE` and any row in `listing_verification_dimension` has `status = STALE` or `SUSPENDED` |
| **Trust-suspended** | `listing_status = LIVE` but hidden from search due to fraud hold — handled via a `trust_suspended BOOLEAN DEFAULT false` column on `property_listings`, or by moving to `listing_status = REJECTED` with a trust-specific rejection reason |

**Implementation note:** Trust state is derived, not stored as a single column. `trust_tier` determines ranking bucket. `listing_verification_dimension.status` determines badge-level state. `listing_status` determines lifecycle. These are three independent axes.

---

## 4. Badge System

Six independent trust dimensions. Not every listing needs all badges.

### Badge 1: Identity Verified

**Meaning:** The actor account has passed minimum identity checks.

**Requirements:**
- Phone OTP verified
- Account setup complete
- Actor-level checks passed

### Badge 2: Location Verified

**Meaning:** The property location is consistent with on-site capture and listed address.

**Requirements:**
- Map pin placed
- Live capture flow completed in-app
- GPS captured during flow
- GPS and listed pin within configurable threshold (default: 5km; hard fail: >20km)

### Badge 3: Photos Verified

**Meaning:** Listing photos passed the stronger media validation path.

**Requirements:**
- Guided in-app capture, or approved equivalent
- Duplicate-image checks passed
- Image quality checks passed
- No major mismatch flagged

### Badge 4: Authority to List Confirmed

**Meaning:** The lister is authorised by the owner, builder, or lawful representative to market the property.

**Requirements:** At least one of the following:
- Owner OTP confirmation (fast path)
- Reviewed mandate or signed authorisation accepted by ops
- Builder or project authorisation accepted
- Prior trusted relationship whitelisted for same project/society/owner

**Hard rules:**
- This badge must never be inferred from live capture alone
- This badge must never be granted from weak self-assertion alone

### Badge 5: Documents Reviewed

**Meaning:** Supporting ownership or authority documents were uploaded and reviewed by ops.

**Requirements:**
- Required documents uploaded
- Ops review completed
- Review result: approved

### Badge 6: Field Verified

**Meaning:** A physical visit was completed by ops staff or a verified partner.

**Requirements:**
- Human visit completed
- Reviewer pass recorded
- Evidence attached to review record

### RERA display (not a badge)

`rera_number` already exists on `property_listings` (V30). Display it as a seller assertion in Phase 1:

- **Show:** "RERA number provided: KA-RERA-XXXXX"
- **Do not show:** "RERA Verified" (overclaims platform validation)
- **Phase 2 upgrade:** "RERA checked" when number is validated against state portal

---

## 5. Authority-to-List Policy

This is the most important trust dimension for broker-driven listings.

### 5.1 Definition

Authority to List means: **the actor is authorised by the owner, builder, or lawful representative to market this property.**

It does not mean: clean legal title, physical inspection, or full document verification.

### 5.2 Proof hierarchy

| Level | Evidence types |
|---|---|
| **Strong** | Owner OTP confirmation; official builder inventory feed; signed mandate with corroborating evidence |
| **Medium** | Prior successful confirmations for same broker-owner pair; approved project/society-level authorisation pattern |
| **Weak** | WhatsApp screenshot; loose informal letter; verbal assertion |

Weak proof alone must never grant the badge.

### 5.3 Owner OTP — fast path, not gate

1. Broker declares owner's mobile number at listing time
2. System sends OTP to that number: "XYZ Brokers has listed your property at [address]. Reply YES to authorise."
3. Owner confirms → Authority to List badge granted; audit trail recorded
4. Owner declines or no response → listing remains at lowest applicable tier (Tier D if no other badges, Tier C if Identity only); broker may upload alternative proof for manual review
5. Repeated unconfirmed listings over time reduce broker reputation score

**Commercial rule:** Broker can publish without OTP. OTP confirmation unlocks ranking benefits and the Authority badge — it does not gate publication.

---

## 6. Trust Tiers

Trust tiers are used for visibility, ranking buckets, and product treatment. Stored as `trust_tier` (A/B/C/D) on `property_listings`.

### Exact promotion rules (in `TrustTierCalculator` service, not schema)

| Tier | Requirements |
|---|---|
| **A** | IDENTITY + AUTHORITY + PHOTOS + no unresolved complaints |
| **B** | IDENTITY + (AUTHORITY or PHOTOS) + no unresolved complaints |
| **C** | IDENTITY only, or any single badge |
| **D** | No badges, or has unresolved complaints |

Changing these rules requires a code deploy, not a data migration.

> **Note on Location:** Location Verified is intentionally excluded from tier promotion rules. It is a valuable buyer-facing trust signal and contributes to within-tier ranking score (§9), but it relies entirely on GPS — the weakest and most spoofable signal in the system (mock location apps are trivially available in India). Making GPS a hard tier gate would let motivated listers bypass identity and authority checks by simply faking their phone location. The 18-month expiry also means a previously-verified location degrades faster than the other tier-gating badges. Sellers still earn the badge and see it in their Trust Progress Panel — it just doesn't move the tier needle.

---

## 7. Badge Evidence Matrix

Defines what triggers each badge outcome for each proof type. Ops queues only receive "manual review" cases.

| Badge | Auto-grant | Manual review | Publish, no badge | Never sufficient |
|---|---|---|---|---|
| Identity | Phone OTP + email confirmed | KYC document mismatch | — | Unverified phone only |
| Location | Live capture + GPS within 5km of pin | GPS 5–20km from pin | Gallery-only upload | No capture attempted |
| Photos | Live capture + duplicate check pass | Quality concern flagged | Gallery upload (no live capture) | Stock image match |
| Authority | Owner OTP confirmed; builder feed match | Signed mandate submitted; mismatch complaint present | WhatsApp screenshot only | Verbal assertion |
| Docs Reviewed | — | All cases (requires human review) | Document uploaded, review pending | Document upload only |
| Field Verified | — | All cases (requires physical visit) | — | — |

---

## 8. Trust Downgrade Policy

Trust only ratchets upward without explicit downgrade rules. Four triggers:

### 8.1 Badge expiry (time-based)

| Badge | Default expiry |
|---|---|
| Location Verified | 18 months |
| Photos Verified | 18 months |
| Authority to List | 12 months |
| Documents Reviewed | 24 months |
| Field Verified | 24 months |
| Identity Verified | No expiry |

On expiry: badge status set to `STALE`. Listing drops to the appropriate tier. Seller receives re-verification prompt (not auto-removal — seller must re-complete the step).

### 8.2 Complaint suspension (event-based)

On credible dimension-specific complaint: suspend that badge only. Not all badges.

### 8.3 Major edit invalidation (change-based)

The following listing changes invalidate specific badges:

| Edit | Badges invalidated |
|---|---|
| Address or map pin change | Location Verified |
| Photo replacement (>50% of photos) | Photos Verified |
| seller_type change | Authority to List |
| Price change | No badge impact |

### 8.4 Trust decay prompt

Listings older than 12 months receive a "refresh recommended" prompt regardless of badge status. Properties have long listing lifetimes; a 2-year-old Location Verified badge from a property that has changed hands is actively misleading.

---

## 9. Ranking Model

**Architecture: hard eligibility + minimal v1 scoring within tier**

### 9.1 Step 1: Assign trust tier

Hard gate. A listing cannot rank above its tier regardless of score.

### 9.2 Step 2: Score within tier

V1 ranking inputs (kept minimal to avoid score-calibration trap):

| Input | Weight direction |
|---|---|
| Listing freshness | Medium |
| Profile completeness | Low |
| Response rate (when data available) | Medium |
| Complaint-adjusted trust | High |
| Photo quality score | Low |

No fixed numeric weights in v1. Direction only — implemented as a simple formula in the service layer, cached on `ranking_score`.

### 9.3 Rules

- No single cheap action unlocks premium trust treatment
- A low-tier listing cannot outrank a higher-tier listing by score alone
- Score is internal only — never exposed to sellers (prevents optimisation toward cheap signals)

---

## 10. Ops Model

Operations must focus on exceptions, not every listing. The default for most proof types is auto-approve or publish-without-badge — not manual review.

### 10.1 Default outcomes per proof type

| Proof submitted | Default outcome |
|---|---|
| Owner OTP confirmed | Auto-grant Authority badge |
| WhatsApp screenshot only | Publish, no authority badge, no queue |
| Mandate + no complaint | Manual review queue |
| Mandate + mismatch complaint | Manual review queue (priority) |
| GPS within 5km of pin | Auto-grant Location badge |
| GPS 5–20km from pin | Publish, no location badge |
| GPS >20km from pin | Hold for review |
| Live capture, quality concern | Manual review |
| Docs uploaded, no dispute | Manual review queue |

### 10.2 Priority review queues

- Authority dispute queue
- GPS mismatch queue (>5km, <20km)
- Duplicate image queue
- Land/plot listing queue
- Repeated complaint queue
- Premium listing queue

### 10.3 Ops principles

- Review only where badge meaning depends on human judgment
- Every badge grant and suspension must produce an audit entry in `admin_audit_log` (V19)
- Keep manual review queues narrow and high-value — do not let WhatsApp screenshots flood the queue

---

## 11. Fraud Rules

### 11.1 Hard fail — block or hold

| Trigger | Default threshold | Action |
|---|---|---|
| GPS > distance from pin | 20km (configurable) | Hold for review |
| Identical image hash in another active listing | Any | Block; flag for ops |
| Reverse-image similarity match (stock image) | System-defined | Block |
| Same device/account posting >N unrelated properties | N=10 in 7 days (configurable) | Hold for review |
| Same phone number on >M active listings | M=20 (configurable) | Flag for review |

### 11.2 Soft fail — publish but flag

| Trigger | Action |
|---|---|
| GPS 5–20km from pin | Publish, no Location badge |
| Partial address only | Publish, lower ranking |
| Missing exterior photo | Publish, no Photos badge |
| Locality/building name mismatch vs geocode | Flag for review queue |
| Low image quality (blurred/dark) | Publish, no Photos badge |

**All thresholds are configurable via application config — not hardcoded constants.**

---

## 12. Complaint System

### 12.1 Dimension-specific suspension

Complaints affect only the specific trust dimension under challenge.

| Complaint type | Badge suspended |
|---|---|
| Wrong pin / location | Location Verified |
| Fake or borrowed photos | Photos Verified |
| Unauthorised broker listing | Authority to List |
| Misleading description | No badge impact; content review |
| Suspected duplicate | Listing flagged; ops review |

Do not remove all badges unless evidence supports wider fraud.

### 12.2 Escalation ladder

Escalation is based on **weighted complaint score per dimension**, not raw complaint count. Each complaint contributes its `credibility_weight` (0.0–1.0, see §12.3) to the dimension's running total.

| Stage | Trigger | Action |
|---|---|---|
| 1 | Weighted score on any dimension ≥ 0.5 | Flag listing, reduce ranking within tier |
| 2 | Weighted score on any dimension ≥ 1.5 | Suspend that specific badge; ops notified |
| 3 | Seller re-completes challenged step AND no new complaints in 30 days | Badge reinstated; weighted score reset |
| 4 | Badge suspended 3+ times on same listing | Account-level trust downgrade or posting restriction |

**Example:** Two complaints from new accounts (weight 0.3 each) total 0.6 — enough to flag but not suspend. One high-credibility complaint (weight 0.8) plus one new-account complaint (0.3) totals 1.1 — still below the suspension threshold. Prevents casual weaponisation while catching real issues.

Thresholds (0.5, 1.5) are configurable via application config.

### 12.3 Complaint credibility weighting

Complaint impact is weighted by:

- Complainant account age
- Prior valid complaint history
- Complaint concentration (>3 complaints against same actor in 30 days from same account → auto-deprioritised)
- Relationship to listing and transaction context

**Anti-weaponisation rule:** Rate-limit complaints per complainant per broker. Competitor mass-reporting is a documented fraud pattern in Indian real estate platforms.

---

## 13. Broker Reputation Model

### 13.1 Reputation inputs

- Owner confirmation rate (% of listings where Authority was confirmed)
- Complaint rate and resolution history
- Listing accuracy (buyer-reported match rate)
- Response rate and speed
- Verified listing count (lifetime)

### 13.2 Reputation effects

| Reputation level | Benefits |
|---|---|
| Standard | Normal intake flow |
| Rising | Reduced re-verification frequency |
| Trusted Broker | Expedited intake, profile badge, search boost, featured placement eligibility, **streamlined verification UX (Phase 3)** |
| Restricted | Increased scrutiny, intake throttling |

### 13.3 Trusted Broker criteria (indicative)

- 50+ listings with Authority badge confirmed
- <2% complaint rate (trailing 90 days)
- No unresolved badge suspensions

### 13.4 Trusted Broker UX (Phase 3)

High-trust brokers with Trusted Broker status should experience reduced verification friction:
- Bulk listing verification (verify location/photos for multiple listings in one session)
- Auto-renewal of expiring badges based on reputation score
- Reduced re-verification frequency for badges that have never been challenged
- Simplified dashboard focused on maintenance, not onboarding
- Priority ops queue for any manual review items

This is explicitly deferred from Phase 1 and Phase 2. Phase 1 treats all brokers identically regardless of track record.

---

## 14. Buyer-Facing UI

### 14.1 Badge display rules by surface

| Surface | Phase 1 | Phase 2 |
|---|---|---|
| Search card | Top 2 earned badges (primary) + trust tier indicator (secondary) | Same |
| Listing detail | Full badge stack + "What this means" per badge + two-question framing | Same + broker metrics |
| Broker profile | Not built | Portfolio metrics: verified count, % authority confirmed, response rate |
| Search filters | Trust tier as a filterable option | Same + "Authority Confirmed" filter |
| Ranking | Trust tier as primary sort bucket; score within tier | Same |

### 14.2 Badge copy rules

| Badge | Display label | Do not write |
|---|---|---|
| Identity Verified | "Identity Verified" | "Verified Seller" |
| Location Verified | "Location Verified" | "Verified Property" |
| Photos Verified | "Photos Verified" | "Verified Listing" |
| Authority to List | "Authority Confirmed" | "Authorised Sale" |
| Documents Reviewed | "Documents Reviewed" | "Legally Verified" |
| Field Verified | "Field Verified" | "Inspection Passed" |
| RERA (Phase 1) | "RERA number provided" | "RERA Verified" |

### 14.3 "What this means" explainer (listing detail)

Each badge must include a one-line plain-language explainer visible to buyers.

Example:
- **Location Verified** — "The listing agent was physically at this property when these photos were taken."
- **Authority Confirmed** — "The property owner has confirmed this agent is authorised to market this property."

### 14.4 Public trust story

> *Verified in layers, not just a badge.*
> *See whether the seller, location, photos, and documents have each been checked.*

### 14.5 Seller-facing trust progress

#### Panel concept

A per-listing trust progress component in the seller dashboard that shows which verification badges have been earned, which are available, what to do next, and why it matters. Framed as competitive advantage, not compliance.

**Design principle: show progress, not grades.** "2 of 4 badges earned" drives action. "Tier D" drives resentment. Raw tier letters (A/B/C/D), ranking scores, complaint counts, internal weights, and point systems are never exposed to sellers.

#### What to show

**Account-level section** (once per account, applies to all listings):

| Element | Detail |
|---|---|
| Identity Verified state | Earned (green check) or Available (outline + CTA) |
| Account phone/email status | "Phone verified via OTP" |
| Actor type | Owner / Broker / Builder |

**Per-listing section** (separate for each property):

| Element | Detail |
|---|---|
| Each badge with state | Earned / Available / Pending Review / Expired / Suspended |
| State-specific description | One-line per badge |
| Next best action | Single primary CTA — the action that unlocks the most value |
| Action rationale | Why this step matters, framed as buyer behaviour |
| Benefits unlocked vs locked | What the seller gets now vs what they unlock next |
| Pending review status | "Under review — usually 1–2 business days" |
| Expiry warnings | "Expires in 3 months — refresh to keep your badge" |
| Suspension details | Category + required action + support reference |

**Progress indicator:** `{earned} of {total} badges earned` with percentage bar. `total` reflects only badges available to that actor type in the current live phase — not the theoretical maximum of 6:

| Actor | Phase 1 total | Phase 2 total | Phase 3 total |
|---|---|---|---|
| Owner | 3 (Identity, Photos, Location — Authority auto-granted, not counted) | 4 (+Documents) | 5 (+Field) |
| Broker | 4 (Identity, Photos, Location, Authority) | 5 (+Documents) | 6 (+Field) |
| Builder | Phase 3 — deferred | — | TBD |

When a new badge type goes live (e.g. Documents Reviewed in Phase 2), all progress bars update their denominator automatically. A seller who was "4 of 4" becomes "4 of 5" — with a CTA for the new badge.

#### What to never show to sellers

| Hidden element | Why |
|---|---|
| Raw tier letter (A/B/C/D) | Insulting. Tiers are internal ranking buckets, not seller grades. |
| Ranking score | Sellers game cheapest visible unlocks. Score stays internal. |
| Complaint count or details | Enables retaliation. Show suspension category only. |
| Complainant identity | Privacy + retaliation risk. |
| Internal weights/thresholds | Creates political debates and support fights. |
| "Bottom X%" messaging | Shaming kills retention. |
| Point systems | Additive points invite optimisation toward cheap signals. |
| Full rules engine | Too much detail → mechanical gaming. |
| Other sellers' tiers or badges | Creates unhealthy competition dynamics. |

#### Actor-specific versions

**Owner** (`seller_type = 'owner'`):
- Authority is auto-granted when Identity is verified (owners self-authorise)
- Panel shows Authority with distinct copy: "As the property owner, your right to list is automatically confirmed"
- Total badges: 3 actionable (Identity, Photos, Location) + 1 auto-granted (Authority)
- Panel subheader: "Build trust as a property owner"

**Broker** (`seller_type = 'dealer'`):
- Authority requires owner OTP or reviewed mandate — it is the key differentiator
- Total badges: 4 (Identity, Photos, Location, Authority)
- Panel subheader: "Stand out to serious buyers"
- Authority CTA: "Send a verification request to the property owner"

**Builder** (`seller_type = 'builder'`): Phase 3 — deferred from Phase 1.

#### Badge label naming (Indian market)

| Internal dimension | Seller-facing label (broker) | Seller-facing label (owner) |
|---|---|---|
| IDENTITY | "Identity Verified" | "Identity Verified" |
| PHOTOS | "Photos Confirmed" | "Photos Confirmed" |
| LOCATION | "Location Confirmed" | "Location Confirmed" |
| AUTHORITY | "Listing Authorisation" | "Ownership Confirmed" |
| DOCUMENTS | "Documents Reviewed" | "Documents Reviewed" |
| FIELD | "Field Visit Confirmed" | "Field Visit Confirmed" |

Use "Confirmed" not "Verified" for Photos, Location, Field — warmer, less governmental. Use "Listing Authorisation" not "Authority to List" — "Authority" reads as official/legal in Indian English.

#### Next-best-action priority (context-dependent)

```
1. IF any badge is SUSPENDED → re-verification for that badge (active harm)
2. IF any badge is EXPIRED   → re-verification for that badge (tier drop)
3. IF any badge expiring in ≤30 days → proactive renewal (preventive)
4. ELSE recommend badge whose absence is the binding constraint
   on the next tier transition:
   - New broker (Identity only): → Photos (lowest friction, immediate win)
   - Broker with Photos: → Location
   - Broker with Photos + Location: → Authority
   - Owner (any state): → Skip Authority (auto-granted). Recommend Photos or Location.
5. NEVER recommend Phase 2/3 badges as primary CTA. Show as "Coming soon."
```

The sequence Photos → Location → Authority (not Authority first) is intentional: this is a lowest-friction path to the next tier milestone, not the highest-value badge first. Authority is the highest-value badge for brokers, but recommending it immediately after Identity causes high dropout. Friction-sequencing is what makes the progress panel effective — sellers complete more steps when each step feels achievable.

#### Benefits section

| Benefit | Locked | Unlocked |
|---|---|---|
| Account in good standing | *(always active)* | "Active" |
| Priority search placement | "Earn {n} more badge(s)" | "Active — your listings appear higher in buyer searches" |
| Trust Badges on Listing | "Earn {n} more badge(s)" | "Active — buyers see a trust badge on your listings" |
| Featured placement eligible | "Earn all badges" | "Active — your listings can be featured to subscribed buyers" |

Benefit copy must use "eligible" and "buyers see" language. Never promise exact ranking positions or lead volume.

#### Component integration

| Page | Variant | Placement |
|---|---|---|
| DealerDashboard | Full — always expanded | Between stats row and quick-actions |
| DealerListings | Compact collapsible bar | Collapsed — shows progress bar + CTA inline |
| EditListing | Not integrated | Too dense. Lightweight alert in Phase 2. |

#### TypeScript props interface

```typescript
type BadgeState = 'earned' | 'available' | 'pending' | 'expired' | 'suspended';
type BadgeKey = 'identity' | 'photos' | 'location' | 'authority' | 'documents' | 'field';
type ActorType = 'owner' | 'dealer' | 'builder';

interface TrustBadge {
  key: BadgeKey;
  label: string;
  state: BadgeState;
  description: string;
  earnedDate?: string;
  expiryDate?: string;
  suspensionCategory?: string;
  referenceId?: string;
}

interface TrustProgressPanelProps {
  actorType: ActorType;
  badges: TrustBadge[];
  variant: 'full' | 'compact';
  isLoading?: boolean;
}
```

API response includes `TrustBadge[]` per listing. Trust tier letter is never included in the seller-facing API response.

---

## 15. Asset-Class Rules

### Apartment / House resale

Best suited for standard self-verification flow. Location + Photos + Authority to List are the primary trust targets.

Optional docs: tax receipt, utility bill, sale deed extract.

### Plot / Land

Requires stricter treatment — land is significantly harder to validate from an address alone.

- Survey number / plot number / khata required
- Map pin + boundary evidence photos
- Polygon draw encouraged (Phase 2)
- Default routing to manual review queue
- More conservative trust badge display

### New project / Builder inventory

Project-level verification model — unit-level owner-style authority logic does not apply.

- Builder entity verification required before any unit can be listed
- RERA self-declaration in Phase 1; RERA validation in Phase 2
- Unit listings inherit project trust level
- Builder authorisation required for channel partners

### Rental

Same flow as resale. Authority to List is more critical — unauthorised subletting is a documented fraud pattern.

---

## 16. Data Model

All additions are purely additive and designed to minimise migration conflicts with existing schema.

**Next Flyway migration slot: V38**

### New tables

#### `listing_verification_dimension`

Per-listing badge state. UNIQUE constraint on `(listing_id, dimension_type)`.

```sql
CREATE TABLE listing_verification_dimension (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id      UUID NOT NULL REFERENCES property_listings(id) ON DELETE CASCADE,
    dimension_type  VARCHAR(40) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'ABSENT',
    granted_at      TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    suspended_at    TIMESTAMPTZ,
    evidence_source VARCHAR(80),
    reviewer_id     UUID,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_listing_dimension UNIQUE (listing_id, dimension_type)
);
```

`dimension_type` values: `IDENTITY`, `LOCATION`, `PHOTOS`, `AUTHORITY`, `DOCUMENTS`, `FIELD`
`status` values: `ABSENT`, `GRANTED`, `STALE`, `SUSPENDED`

#### `authority_evidence`

Documents submitted for authority review. Separate from general `listing_doc` (different lifecycle — these grant the Authority badge).

```sql
CREATE TABLE authority_evidence (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id      UUID NOT NULL REFERENCES property_listings(id) ON DELETE CASCADE,
    evidence_type   VARCHAR(40) NOT NULL,
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at     TIMESTAMPTZ,
    review_status   VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    review_notes    TEXT,
    evidence_url    TEXT
);
```

`evidence_type` values: `OWNER_OTP`, `SIGNED_MANDATE`, `BUILDER_AUTH`, `PRIOR_CONFIRMATION`, `OTHER`
`review_status` values: `PENDING`, `APPROVED`, `REJECTED`

#### `listing_complaint`

User complaints targeting specific trust dimensions.

```sql
CREATE TABLE listing_complaint (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id          UUID NOT NULL REFERENCES property_listings(id) ON DELETE CASCADE,
    complaint_type      VARCHAR(40) NOT NULL,
    complainant_id      UUID,
    credibility_weight  NUMERIC(3,2) NOT NULL DEFAULT 1.0,
    status              VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    resolution_outcome  VARCHAR(40),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at         TIMESTAMPTZ
);
```

`complaint_type` values: `WRONG_LOCATION`, `FAKE_PHOTOS`, `UNAUTHORISED_LISTING`, `DUPLICATE`, `MISLEADING_DESC`
`status` values: `OPEN`, `RESOLVED`, `DISMISSED`

### Additions to existing tables

#### `property_listings` — 2 new columns

```sql
ALTER TABLE property_listings ADD COLUMN trust_tier    VARCHAR(1) NOT NULL DEFAULT 'D';
ALTER TABLE property_listings ADD COLUMN ranking_score INTEGER    NOT NULL DEFAULT 0;
```

#### `profiles` — 4 new columns

```sql
ALTER TABLE profiles ADD COLUMN phone_verified   BOOLEAN      NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN org_name         VARCHAR(200);
ALTER TABLE profiles ADD COLUMN rera_broker_id   VARCHAR(80);
ALTER TABLE profiles ADD COLUMN reputation_score INTEGER      NOT NULL DEFAULT 0;
```

### Tables unchanged

- `listing_images` (V9) — do not rename or alter
- `listing_status` enum (V7/V35) — do not add trust states
- `admin_audit_log` (V19) — reuse for badge grant/suspend audit trail
- `profiles` base columns (V0/V14)

### Implementation prerequisites (not part of verification schema)

**Profile JPA entity:** Before adding verification columns to `profiles`, a `Profile` JPA entity, `ProfileRepository`, and `ProfileService` must be created. Currently all profile access is raw JDBC scattered across `DealerSetupController`, `PaymentController`, `InsightsService`, and `ViewingRequestRepository`. This is a prerequisite engineering task.

**OTP infrastructure:** Before implementing Identity Verified or Authority to List badges, the following must exist:
- Supabase phone auth provider configuration, or an external SMS provider (e.g., Twilio, AWS SNS India)
- Phone OTP verification flow (frontend + backend)
- Owner notification flow for Authority to List confirmations
- `phone_verified BOOLEAN DEFAULT false` column on `profiles`

Both prerequisites should be scoped as a Phase 0 sprint before Phase 1 verification feature work begins.

---

## 17. API Cost Notes

| API | Free tier | Notes |
|---|---|---|
| Ola Maps | 500,000 calls/month free | Recommended for India geocoding at launch |
| Google Maps Platform | ~70,000 calls free/month (with $200 credit) | Fallback or for accuracy-critical flows |
| India Post PIN API | Free, no auth required | Address validation, PIN-to-locality lookup |

GPS capture uses device GPS — no API cost. Live capture via in-app camera — no API cost.

---

## 18. Launch Phasing

### Phase 0 — Prerequisites (before Phase 1 features)

- Profile JPA entity + repository + service (consolidate scattered raw JDBC)
- OTP infrastructure: Supabase phone auth or external SMS provider, phone verification flow, owner notification flow
- `phone_verified BOOLEAN DEFAULT false` column on `profiles`

### Phase 1 — Launch

- Actor model + actor-type buyer display (using existing `seller_type`)
- Publication gate (minimum bar)
- Identity Verified badge (auto-grant on phone OTP)
- Location Verified + Photos Verified badges (in-app live capture)
- Authority to List badge (owner OTP fast path + mandate upload)
- Trust tiers A–D with exact promotion rules
- `trust_tier` + `ranking_score` on `property_listings`
- Ranking by trust tier
- RERA number self-declared display
- Hard fraud triggers (duplicate images, GPS hard fail)
- Ops queues: authority dispute, GPS mismatch, duplicate image

### Phase 2 — Growth

- Documents Reviewed badge + ops review workflow
- Broker reputation metrics (buyer-visible)
- Complaint credibility weighting
- RERA validation against state portal
- Trust decay prompts (12-month listing age)
- Badge expiry + re-verification prompts
- Soft fraud pipeline (quality scoring)
- Featured placement for Tier A listings

### Phase 3 — Scale

- Field Verified programme (partner or staff visits)
- Land/plot parcel-specific workflow (polygon draw, survey number validation)
- Builder org-level verification
- Trusted Broker programme with tiered benefits
- Trusted Broker streamlined UX (bulk verification, auto-renewal, priority ops)
- Advanced fraud graph (device/account clustering)
- Complaint anti-weaponisation ML signals

---

## 19. What Not to Build

- A single "Verified" badge that means everything
- Owner OTP as a hard publication gate for all broker listings at launch
- Field verification for every listing
- The same intake flow for plots and apartments
- GPS as the primary trust signal (easily spoofed via mock location apps)
- A fixed 0-100 numeric score exposed to sellers (invites optimisation toward cheap signals)
- A second audit log — use existing `admin_audit_log` (V19)
- A new `actor_profile` table — extend existing `profiles`
- RERA as a standalone badge at Phase 1 (no reliable Karnataka API)
- Merging trust states into the `listing_status` enum

---

## 20. Acceptance Criteria

### Publication

- A broker listing can go live without owner OTP if minimum publish checks pass
- A listing missing strong trust evidence remains live at Tier D

### Badge integrity

- Authority badge cannot be granted from live capture alone
- Location complaint suspends only the Location badge by default
- All badge grant and suspension actions produce entries in `admin_audit_log`
- STALE badges do not auto-grant again without re-verification

### Trust tiers

- Tier A requires IDENTITY + AUTHORITY + PHOTOS + no unresolved complaints
- A Tier D listing cannot outrank a Tier A listing by ranking_score alone
- Tier promotion rules can be changed without a database migration

### Buyer communication

- Actor type is visible on all listing cards (Phase 1: badge stack only; Phase 2: + broker reputation metrics)
- Each badge has a plain-language explainer on listing detail
- "RERA number provided" copy is used, not "RERA Verified"
- Two-question framing (exists? / authorised?) is present on listing detail

### Operations

- Disputed badges can be suspended without taking the whole listing offline
- Priority queues exist for authority, GPS mismatch, duplicate image, and repeated complaints
- Owner OTP confirmation triggers auto-grant without ops intervention

### Seller trust progress

- Seller sees earned / available / pending / expired / suspended badge states per listing
- Raw tier letter (A/B/C/D) never appears in any seller-facing UI surface or API response
- Ranking score never appears in seller-facing UI
- Panel shows actor-specific badge set: owner=3 actionable, broker=4
- Owner sees "Ownership Confirmed" with auto-granted copy ("your right to list is automatically confirmed")
- Next-best-action CTA follows priority: suspended → expired → expiring within 30 days → binding constraint on next tier
- Benefits section shows locked/unlocked state tied to badge count
- Expired badges show expiry date and re-verification CTA
- Suspended badges show suspension category, required action, and support reference ID
- Pending review shows ETA ("usually 1–2 business days") and no action required
- Compact variant in DealerListings shows progress bar + single CTA inline, collapses by default
- Full variant in DealerDashboard shows all badges + benefits + next action, always expanded
- Builder-specific panel deferred to Phase 3

---

## 21. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Brokers stay in Tier D/C forever | Make ranking and featured placement benefits of Tier A concrete and visible; Trusted Broker programme creates peer motivation |
| Trust tiers meaningless without differentiation | Exact tier rules enforced (see §6); search default sorts by tier first |
| GPS spoofing by motivated fraudsters | GPS is a weak-to-medium signal only; live capture consistency + device history + duplicate detection are the stronger signals |
| WhatsApp EXIF stripped | EXIF GPS only reliable for in-app live capture; gallery uploads do not earn Location badge |
| Complaint weaponisation by competitors | Rate limiting + credibility weighting + concentration detection |
| RERA badge overclaims at launch | "RERA number provided" copy instead of "RERA Verified"; no badge treatment until validation is built |
| Ops queue overflow | Default outcomes favour auto-approve or publish-without-badge; manual review reserved for genuine exceptions |
| Trust decay ignored by sellers | Re-verification prompt surfaced in listing management dashboard; tier demotion is visible in search ranking |
| Badge farming via seller progress panel | Next-best-action follows a friction-aware tier-progression path — not the easiest badge, but sequenced to avoid Authority-first dropout. Quality gates (GPS, OTP, live capture) prevent mechanical gaming. Two-step approval (submit → review → grant) prevents instant badge grants. |
| Tier letter leak via seller-facing API | Tiers never leave the backend. Seller API returns `TrustBadge[]` only; `trustTier` field is excluded from seller-facing responses. Frontend component contract enforced at TS type level. |
