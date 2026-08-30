/**
 * The 161 `public.property_listings` columns the `anon`/`authenticated` PostgREST
 * roles are actually allowed to SELECT (issue #2280). Since Flyway V128, the database
 * revokes table-wide grants and re-grants column-by-column over exactly this
 * allow-list — every column except `contact_phone` and `contact_info`. A browser-side
 * `select('*')` now errors outright because `*` expands to include those two revoked
 * columns. Any hook selecting from this table must project this list (plus any
 * embedded relation) instead of `*`, and this list must be kept in sync with
 * `apps/api/src/main/resources/db/migration/V128__revoke_browser_contact_column_grants.sql`
 * whenever a column is added to the table.
 */
export const PROPERTY_LISTING_COLUMNS = [
  'id', 'raw_post_id', 'property_type', 'title', 'locality', 'price',
  'price_unit', 'land_area', 'land_area_unit', 'built_area', 'built_area_unit', 'bedrooms',
  'bathrooms', 'description', 'latitude', 'longitude', 'confidence_score', 'language_detected',
  'is_valid', 'is_duplicate', 'parsed_data', 'updated_by', 'created_at', 'updated_at',
  'repost_count', 'area_key', 'area_label', 'status', 'address_confirmed', 'rejection_reason',
  'submitted_at', 'reviewed_at', 'reviewed_by', 'created_by', 'price_paise', 'dedupe_hash',
  'search_vector', 'video_url', 'listing_number', 'rera_number', 'listing_purpose', 'carpet_area',
  'carpet_area_unit', 'floor_number', 'total_floors', 'furnishing_status', 'washrooms', 'parking_count',
  'road_frontage_ft', 'commercial_usage', 'number_of_units', 'monthly_rent', 'security_deposit_months', 'lock_in_months',
  'seller_type', 'archived_at', 'is_suspected_duplicate', 'first_published_at', 'last_live_at', 'back_to_market_at',
  'last_updated_at', 'possession_status', 'expected_possession_date', 'approvals_declared', 'last_approved_snapshot', 'trust_tier',
  'ranking_score', 'water_source', 'soil_type', 'road_access', 'cultivation_status', 'ownership_type',
  'survey_number', 'boundary', 'land_category', 'farmhouse_available', 'fencing_done', 'quality_score',
  'quality_breakdown', 'quality_computed_at', 'listing_family', 'balconies', 'facing', 'availability_timeline',
  'super_built_area', 'super_built_area_unit', 'property_age', 'residential_water_source', 'parking_2w_count', 'parking_4w_count',
  'road_width_ft', 'plot_dimensions', 'conversion_status', 'khata_number', 'property_tax_pid', 'approving_authority',
  'project_name', 'builder_name', 'maintenance_paise', 'has_lift', 'has_power_backup', 'is_gated',
  'has_garden', 'has_terrace', 'has_compound', 'has_servant_room', 'is_corner_plot', 'has_boundary_wall',
  'is_gated_layout', 'has_water_connection', 'has_electricity_connection', 'has_drainage', 'price_negotiable', 'rent_negotiable',
  'pets_allowed', 'maintenance_included', 'commercial_subtype', 'floor_choice', 'floor_mode', 'hub_type',
  'washrooms_public', 'washrooms_private', 'parking_public_count', 'parking_private_count', 'office_seats', 'office_cabins',
  'office_meeting_rooms', 'occupancy_status', 'power_load_kva', 'warehouse_clear_height_ft', 'warehouse_loading_bays', 'warehouse_flooring',
  'commercial_zoning', 'commercial_ownership', 'commercial_approvals', 'expected_rental_yield_pct', 'current_monthly_income_paise', 'lease_term_months',
  'lease_escalation_pct', 'commercial_furnishing_status', 'commercial_availability', 'commercial_area_unit', 'warehouse_truck_access', 'last_confirmed_at',
  'area_resolution_status', 'area_resolution_method', 'agri_conversion_status', 'area_sqm', 'area_sqft', 'area_cent',
  'price_per_cent_paise', 'status_changed_at', 'status_changed_by_actor_type', 'status_changed_by_actor_id', 'status_reason_code', 'status_reason_note',
  'approved_at', 'rejected_at', 'submission_count', 'review_submitted_at', 'geog',
] as const;

/** Ready-made comma-joined projection string for `.select()` calls. */
export const PROPERTY_LISTING_COLUMNS_PROJECTION = PROPERTY_LISTING_COLUMNS.join(', ');

/**
 * Builds a `.select()` projection string, optionally appending an embedded-relation
 * clause (e.g. `raw_posts(images)`). The explicit `string` return type is required: a
 * template literal built inline at the call site collapses to a TS template-literal
 * type, which trips Supabase's compile-time select-string parser into a ParserError.
 */
export function propertyListingSelect(embed?: string): string {
  return embed ? `${PROPERTY_LISTING_COLUMNS_PROJECTION}, ${embed}` : PROPERTY_LISTING_COLUMNS_PROJECTION;
}
