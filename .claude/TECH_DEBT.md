# Tech Debt Log

Track ADVISORY-DEFER items from code reviews. Reviewed at end of each sprint.
Items resolved or invalidated should be moved to the **Resolved** section with a date.

**Linked cleanup ticket:** [RE-165](https://linear.app/re-trends/issue/RE-165)

---

## Backend

| ID | Source PR | Description | Risk | Added |
|----|-----------|-------------|------|-------|
| B-1 | RE-131, RE-132, RE-133 | AdminListingController audit JSON built via manual string concatenation with naive `replace("\"", "\\\"")` escaping. Backslash+quote combos and control chars produce malformed JSON. Replace with `ObjectMapper.writeValueAsString(Map.of(...))`. | Low — UUIDs and simple strings today, but fragile if note fields grow | 2026-03-20 |
| B-2 | RE-130, RE-128, RE-131, RE-132, RE-133 | Dual clock reads: `Instant.now()` + `OffsetDateTime.now()` captured separately in workflow methods. Sub-ms drift between `statusChangedAt` (Instant) and `updatedAt` (OffsetDateTime). Derive one from the other: `now.atOffset(ZoneOffset.UTC)`. | Very low — cosmetic audit inconsistency | 2026-03-20 |
| B-3 | RE-132 | `approveScrapedListing` skips `proximityDuplicateService.detectAndRecord()` and event publishing (ListingApprovedEvent, NewListingInAreaEvent). Product decision needed: should SCRAPED→LIVE trigger duplicate detection and area notifications? | Medium — orphaned LIVE listings won't appear in "new in area" notifications | 2026-03-20 |
| B-4 | RE-132 | `validateForSubmission` is private, called by both `submitListing` and `approveScrapedListing`. Image minimum (3) may not make sense for scraped listings. Review validation rules for both paths. | Low — admin can't approve incomplete scraped listings, which may be intentional | 2026-03-20 |
| B-5 | RE-133 | Duplicated "to-LIVE" timestamp logic across `approveListing`, `approveScrapedListing`, `restoreRejectedListing` (~10 lines each). Extract `applyLiveTransitionTimestamps()` helper. | Low — divergence risk grows with each new to-LIVE path | 2026-03-20 |
| B-6 | RE-128 | `existsAdminActionAfter` JPQL query on listing_status_history — needs performance review at scale. Run performance-analyst when table grows. | Low now — will matter at 10k+ history rows per listing | 2026-03-20 |

## Frontend

| ID | Source PR | Description | Risk | Added |
|----|-----------|-------------|------|-------|
| _(none yet)_ | | | | |

## Database

| ID | Source PR | Description | Risk | Added |
|----|-----------|-------------|------|-------|
| _(none yet)_ | | | | |

## Infrastructure

| ID | Source PR | Description | Risk | Added |
|----|-----------|-------------|------|-------|
| _(none yet)_ | | | | |

---

## Resolved

| ID | Resolution | Date |
|----|-----------|------|
| _(none yet)_ | | |
