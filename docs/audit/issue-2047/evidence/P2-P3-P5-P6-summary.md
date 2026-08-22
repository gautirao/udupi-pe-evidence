# P2 C-EMPTYSUBTYPE — RESULT: PASS
POST /api/listings, propertyType=commercial, commercialSubtype omitted -> HTTP 400
{"error":"commercialSubtype is required for propertyType 'commercial' (must be SHOP or OFFICE)"}
No listing created. (p2_empty_subtype.json)

# P3 C-XFIELD-REJECT — RESULT: PASS
POST /api/listings, propertyType=commercial, commercialSubtype=SHOP, warehouseFlooring=EPOXY_COATED
(valid enum value, wrong subtype) -> HTTP 400 {"error":"Field 'warehouseFlooring' is not accepted
for this property type"}. No listing created. (p3_xfield_shop_warehouseflooring_v2.json)
Note: an earlier attempt with an invalid enum value (EPOXY) 400'd on enum validation first
(p3_xfield_shop_warehouseflooring.json) — re-ran with a valid enum value to isolate the
cross-subtype guard specifically, which fired correctly.

# P5 Lifecycle chain — RESULT: PASS (full chain driven successfully)
Listing fb4d0897-e22c-4e4d-8867-19e4cb8f7db3 ("AUDIT-2047-lifecycle-chain"):
  DRAFT (create, p5_create_lifecycle.json)
  -> submit blocked 422 until address_confirmed/images/carpet_area/floor_number supplied (p5_submit.json)
  -> PENDING_REVIEW (submit after fixing prereqs, p5_submit2.json)
  -> confirmed present in GET /api/admin/listings/pending?size=100 (p5_pending_queue.json)
  -> REJECTED (admin reject with rejectionReason="INCOMPLETE_INFO: missing floor plan details",
     p5_reject.json)
  -> DRAFT (broker reopen, p5_reopen.json)
  -> PENDING_REVIEW (broker resubmit, p5_resubmit.json; rejectionReason persisted/still visible)
  -> LIVE (admin approve, p5_approve.json)

# P6 L-REJECTCODES — RESULT: rejectionReason is opaque free text, NOT validated against a code enum
Valid-looking code "INCOMPLETE_INFO: missing floor plan details" stored and returned verbatim
(p5_reject.json).
Malformed/non-existent code "NOT_A_REAL_CODE: bogus reason text" on listing
fefd5d9f-b6fa-4ba6-bab2-28650d5100d3 -> HTTP 200, ACCEPTED verbatim, no validation error
(p6_reject_malformed.json). Server does not distinguish or validate rejection reason codes; the
field is free text end-to-end. This is a data-quality observation, not necessarily a security
defect, but any UI/analytics code assuming a closed set of rejection codes cannot rely on
server-side enforcement.
