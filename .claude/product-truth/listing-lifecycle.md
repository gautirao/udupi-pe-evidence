# Product Truth — Listing Lifecycle (Supply Side)

> **Authoritative, implementation-INDEPENDENT statement of what must always be true for the
> listing supply side** — how owners and brokers submit listings, how admins moderate them,
> and what may appear in public results. This document is a reference the Definition-of-Done
> (DoD) autopilot review gate evaluates supply-side issues against. It describes the
> *contract*, not the code. If this document and the code disagree, that is a defect to
> resolve — the document states the intent.

- **Owner anchor:** `.claude/product-truth/listing-lifecycle.md`
- **Companion:** `.claude/product-truth/discover.md` (buyer/demand side).
- **Consumed by:** `.claude/autopilot/templates/definition-of-done.toml` (supply-side
  categories map their criteria `truth_anchor` to the section anchors below) and
  `.claude/autopilot/gates/AUTOPILOT_DOD_REVIEW.md`.

**Project lifecycle vocabulary (concrete, real states):** the listing status model has six
states — `SCRAPED`, `DRAFT`, `PENDING_REVIEW`, `LIVE`, `REJECTED`, `ARCHIVED`. Only **`LIVE`**
(non-archived, non-duplicate) is **public**. The vocabulary is named for clarity; the
*contracts* below are implementation-independent.

Each section carries a **stable anchor** (the `key` in its heading) referenced by DoD
criteria. Do not rename an anchor without updating the DoD criteria that cite it.

---

## `owner_broker_submission` — Owners and brokers can submit; submissions start non-public

Both **owners** and **brokers/dealers** can submit listings. A newly created listing enters
a **non-public** state first and must **not** appear in public Discover/search until it is
explicitly approved.

- A new listing is created in **`DRAFT`** (non-public). On submission it moves to
  **`PENDING_REVIEW`** (non-public, awaiting admin moderation). It becomes public only when
  an admin approves it to **`LIVE`**.
- **Required fields are validated before a listing can be submitted**: price, location
  (latitude/longitude), property type, bedrooms, locality, and media/photos meeting the
  minimum image requirement, plus a valid owner/broker identity. An incomplete listing
  cannot be submitted for review.
- **Owner vs broker/dealer submissions** may differ in metadata and permissions (e.g. the
  seller type is derived from the submitting account's role — an owner account vs a
  broker/dealer account), but **both follow the same approval/display lifecycle**: neither
  an owner's nor a broker's submission is public until approved to `LIVE`.
- Owner/broker identity and contact data must be handled safely and must never be exposed
  beyond what the public-safe contract in `search_display_truth` allows.

**Supply promise:** "When I submit a listing it is saved privately and reviewed before it can
ever appear publicly; I can't accidentally publish an incomplete or unapproved listing."

---

## `admin_moderation` — Admins review pending listings; approval gates public visibility

**Admin** users review listings awaiting moderation (`PENDING_REVIEW`).

- An admin can **approve**, **reject**, or **request changes / return for edits** (where
  supported). **Approval** moves a listing to the public/searchable **`LIVE`** state.
  **Rejection** moves it to **`REJECTED`** (non-public). Return-for-edits sends it back to
  the submitter for correction.
- **Rejected or otherwise unapproved listings must NOT appear in public search** (only
  `LIVE` is public).
- **Approval/rejection actions are auditable** where supported (a status-history record of
  who changed the status and when). A **rejection reason is required** when rejecting (drawn
  from a defined set of reason codes).
- **Rejection reasons and internal moderation notes must NOT leak into public listing
  cards, markers, or any public response.** They are visible only on authorised
  broker/admin surfaces — never to anonymous or general public consumers.

**Supply promise:** "An admin decides whether a listing goes live; rejected listings stay
private; and the reason a listing was rejected is never shown to the public."

---

## `search_display_truth` — Only approved/public listings appear publicly; no private-field leakage

Public visibility is gated strictly on listing status.

- **Only approved/public listings appear in public Discover/search** — concretely, only
  `LIVE` listings that are non-archived and non-duplicate. **Unapproved / draft /
  pending / rejected / expired (archived) / deleted / private listings must NOT appear**
  in any public result.
- **Search results, map markers, badges/counts, and listing cards all respect listing
  visibility/status consistently** — a non-public listing must not appear in any of them
  (no leaking via a marker or a count even if the card is hidden).
- **Anonymous users see only public-safe fields.** **Authenticated** users may see extra
  actions/details only when authorised. **Admin / broker / owner** screens may show
  non-public listings (e.g. a broker's own drafts, an admin's pending queue) **only where
  authorised** for that role.
- **Public map markers must NOT expose private owner/broker/admin-only data** — e.g.
  rejection reasons, internal moderation notes, or owner/broker PII beyond the public-safe
  contract. The public listing response intentionally omits such fields, and a non-`LIVE`
  listing fetched via a public detail endpoint must not be returned at all.

**Buyer/supply promise:** "The public only ever sees approved listings, with only public-safe
information — never a draft, a rejected listing, an internal note, or private owner data."

---

## `future_search_index_truth`

> **FORWARD-LOOKING — NOT CURRENT INFRASTRUCTURE.**
>
> This section describes **no currently-existing system**. As of **2026-05-28** the **only**
> search source is **PostgreSQL + the V18 full-text-search `search_vector`** (`websearch_to_tsquery`
> over a generated `tsvector`). **There is NO OpenSearch, Elasticsearch, Kafka, or external
> search read-model in this repository.** The statements below are **aspirational invariants**
> that would apply **only IF/WHEN** such a system is introduced; they must not be read as
> describing a present capability.

If/when a dedicated search index or external read-model is introduced:

- **IF/WHEN** an index/read-model exists, **PostgreSQL remains the source of truth** for
  listing status/approval; the index is a derived projection, never an authority.
- **IF/WHEN** listings are indexed, the index **must preserve the same lifecycle rules** as
  `search_display_truth`: a search index must **NEVER** make an unapproved (non-`LIVE`)
  listing publicly discoverable.
- **IF/WHEN** indexing runs, it **must handle approval, rejection, deletion, expiry
  (archival), and updates correctly** — a listing leaving `LIVE` must promptly leave the
  public index; a listing entering `LIVE` may enter it.
- **IF/WHEN** a reindex or backfill runs, it **must preserve visibility rules** — a bulk
  rebuild must never surface non-public listings, even transiently.

**Supply promise (conditional):** "If we ever add a search index, it can only ever make
*approved* listings findable — it can never become a back door that exposes unapproved or
private listings."

---

## `known_gaps` — Documented unknowns and gaps (NOT acceptance failures)

The following are **documented unknowns / deferred items** at the time of writing, recorded
so a DoD evaluation does **not** mistake a gap for an unmet criterion. These are stated as
*open questions or known limitations*, **not asserted as product truth**:

- **Anonymous access at the security layer is not asserted here.** Whether the public
  Discover endpoints are configured `permitAll()` vs `authenticated()` at the security
  filter was not independently verified for this document; the visibility *contract* above
  (only `LIVE` is public) holds regardless, but the exact auth configuration is out of scope
  for this doc.
- **Supabase RLS on the listings table is not independently verified.** Some admin screens
  query Supabase directly; whether row-level security provides a second visibility gate
  (vs. relying solely on the backend status predicate) is an open item.
- **`SCRAPED` ingestion-to-approval path is unverified.** How scraped listings enter the
  lifecycle and whether they follow the same moderation path before becoming `LIVE` was not
  confirmed.
- **`return-for-edits` final status is unverified** (whether the listing reverts to `DRAFT`
  or remains `PENDING_REVIEW`).
- **Authenticated dashboard search status filtering is unverified** (whether the
  authenticated dashboard search endpoint also restricts to `LIVE` or may surface a
  broker's own non-public listings to that broker).

When any gap above is resolved, update this section and any DoD criterion that referenced it.

---

## Change discipline

This is a **living document** under `.claude/`. When supply-side *contract* behaviour changes
(not when implementation changes), update the relevant section here in the same change, and
update any DoD criterion `truth_anchor` that points at a renamed/removed section.
Implementation-only refactors must **not** require edits here. The
`future_search_index_truth` banner must remain until an actual search index/read-model is
introduced by a separate, explicitly-approved change — at which point that section is
rewritten to describe the real system.
