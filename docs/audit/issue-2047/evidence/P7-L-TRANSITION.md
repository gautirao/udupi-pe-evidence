# P7 L-TRANSITION — RESULT: MIXED (one sub-case PASS, one sub-case FAIL/DEFECT)

## Sub-case A: approve an already-LIVE listing (self-transition)
Listing fb4d0897-e22c-4e4d-8867-19e4cb8f7db3 was LIVE (from the P5 lifecycle chain).
POST /api/admin/listings/{id}/approve (admin token)
-> HTTP 409 {"error":"Self-transition not allowed: from=LIVE to=LIVE actor=ADMIN"}
RESULT: PASS — correctly refused.
(see p7_approve_live_again.json)

## Sub-case B: approve an ARCHIVED listing
Listing 824df417-5458-4e8c-913a-413b8c273ec4 (the P1 subtype-switch listing, propertyType=warehouse,
still carrying the stale OFFICE fields from the P1 finding) was archived via
POST /api/listings/{id}/archive (broker token) -> 200, status=ARCHIVED. (p7_archive.json)

Then: POST /api/admin/listings/{id}/approve (admin token)
-> HTTP 200 (NOT refused), status transitioned ARCHIVED -> LIVE.
(see p7_approve_archived.json)

RESULT: FAIL / CONFIRMED DEFECT — ListingTransitionPolicy did NOT refuse ARCHIVED -> LIVE via the
admin approve endpoint, contradicting the expectation that illegal transitions are rejected.

>>> CORRECTION (added 2026-08-22T16:55Z after Gate F re-review). The RESULT line immediately above is
>>> WRONG. It is retained rather than deleted so the correction history survives, but DO NOT CITE IT.
>>> The accurate account is in audit-report.md §2b (P7).
>>>
>>> The OBSERVATION is accurate and stands: HTTP 200, ARCHIVED -> LIVE, addressConfirmed=false,
>>> imageCount=0. The INTERPRETATION was wrong twice, and both corrections change the fix:
>>>
>>> 1. ARCHIVED -> LIVE is NOT an illegal transition. ListingTransitionPolicy.java:138 contains
>>>    Transition(ARCHIVED, LIVE, ADMIN) as T-29 — INTENTIONALLY permitted at the matrix level. The
>>>    policy did not fail; it did exactly what it is written to do. Filing this as "the state machine
>>>    is broken" would have been a false defect report.
>>>
>>> 2. The replacement framing ("T-29 uniquely lacks a completeness guard") was ALSO too narrow. Gate F
>>>    verified that ListingWorkflowService.approveListing (:187-212) — the method backing the single
>>>    generic POST /api/admin/listings/{id}/approve — calls policy.validate at :193 and then mutates
>>>    status with NO completeness check at all, and with NO restriction on the starting status. So
>>>    T-15 (DRAFT), T-18 (PENDING_REVIEW), T-25 (REJECTED) and T-29 (ARCHIVED) are ALL unguarded
>>>    through that one endpoint. The ListingTransitionPolicy docstring at :185-186, which claims
>>>    T-12/T-15/T-18/T-25 carry inline completeness checks, is itself FALSE. The only genuinely
>>>    guarded admin->LIVE path is approveScrapedListing (:988-1068) via /approve-scraped.
>>>
>>> Real defect: the generic admin approve path has no completeness guard for ANY reachable transition.
>>> Filed as #2286, whose scope needs widening from the original T-29-only framing.

## Severity note
This is more than a transition-graph gap. The resulting LIVE listing:
  - addressConfirmed: false
  - imageCount: 0 (no images at all)
  - still carries the stale OFFICE-only fields (officeSeats=40, officeCabins=4,
    officeMeetingRooms=2, commercialFurnishingStatus=FURNISHED) on a propertyType=warehouse row
    (compounding the P1 L-SUBTYPE-SWITCH defect)

Because ARCHIVED listings never pass back through the submit-time quality gates (3-image minimum,
address confirmation, family-required-field checks — see p5_submit.json 422 body from Priority 5),
approving directly from ARCHIVED is a path to a published LIVE listing that bypasses every
publish-quality gate the product enforces on the normal DRAFT -> submit -> PENDING_REVIEW -> approve
path. This listing (id=824df417-5458-4e8c-913a-413b8c273ec4) is a live reproduction artifact of
that bypass and should be considered for cleanup/deletion after this audit closes.
