# P1 L-SUBTYPE-SWITCH — RESULT: DEFECT CONFIRMED

## Steps executed
1. POST /api/listings (broker token) — propertyType=commercial, commercialSubtype=OFFICE,
   officeSeats=40, officeCabins=4, officeMeetingRooms=2, commercialFurnishingStatus=FURNISHED.
   -> HTTP 201. Listing id=824df417-5458-4e8c-913a-413b8c273ec4
   -> DB (property_listings + listing_commercial_space_details) confirms subtype=OFFICE,
      office_seats=40, office_cabins=4, office_meeting_rooms=2, furnishing=FURNISHED.
      (see p1_create_office.json)

2. PUT /api/listings/{id} (broker token) — propertyType changed to "warehouse".
   commercialSubtype/officeSeats/officeCabins/officeMeetingRooms/commercialFurnishingStatus
   OMITTED from the PUT body entirely (simulating Edit-mode's real omission, per the code-analysis
   premise that isListingFieldVisible is called without commercialSubtype in edit mode).
   -> HTTP 200 (see p1_update_to_warehouse.json)

## Observed result
API response after the switch:
  propertyType: "warehouse"
  commercialSubtype: "WAREHOUSE"   (derived server-side from propertyType, per resolveCommercialSubtype)
  officeSeats: 40        <- STALE, survived from the old OFFICE subtype
  officeCabins: 4        <- STALE
  officeMeetingRooms: 2  <- STALE
  commercialFurnishingStatus: "FURNISHED"  <- STALE (not warehouse-specific but still an
                                               orphaned value from the prior subtype's data entry)

DB read-only SELECT (property_listings + listing_commercial_space_details, both routed per
refreshTypedProjections) confirms the same: property_type=warehouse, commercial_subtype=WAREHOUSE,
but office_seats=40, office_cabins=4, office_meeting_rooms=2, commercial_furnishing_status=FURNISHED
all persisted unchanged.

## Verdict
CONFIRMED DEFECT: when a broker switches an existing commercial-family listing's propertyType via
the update path (PUT /api/listings/{id}) without supplying the old subtype's typed fields, those
fields are NOT nulled and NOT rejected — they are silently retained on the row under the NEW
subtype/propertyType. A WAREHOUSE-typed listing now carries OFFICE-only fields (officeSeats,
officeCabins, officeMeetingRooms) as live, queryable, API-exposed data. This is exactly the
mechanism predicted by the code analysis of ListingCrudService.applyCommercialFields (null-safe
merge leaves unsupplied fields untouched) combined with Edit mode never sending the old subtype's
fields for removal.

Downstream risk: any consumer reading officeSeats on a warehouse listing (search facets, exports,
data quality dashboards) sees stale, semantically-invalid data with no server-side signal that it
is orphaned.
