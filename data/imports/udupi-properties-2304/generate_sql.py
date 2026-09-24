#!/usr/bin/env python3
"""Issue #2304 Slice 2: generate import.sql / area-seed.sql / rollback.sql from normalised-listings.json."""
import json
import os
import re

# Housing.com image URLs use a literal "version" path segment (e.g. .../v0/version/foo.jpg)
# that their own frontend substitutes client-side with a real size token (e.g. "original")
# before requesting the image. The scraper captured the un-substituted template URL, so every
# such URL 404/417s at the CDN. Fix: substitute the literal placeholder with "original", the
# one token confirmed (via direct CDN request) to always resolve. 99acres URLs never match this
# pattern and are left untouched.
HOUSING_CDN_VERSION_PLACEHOLDER = re.compile(r"(/v\d+)/version(\.\w+|/)")


def fix_photo_url(url):
    return HOUSING_CDN_VERSION_PLACEHOLDER.sub(r"\1/original\2", url)

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
IMPORT_ISSUE = 2304
# Slice 2 (#2304): reuse an existing real dev-DB user (testdealer@example.com) as the listing
# owner instead of Slice 1's synthetic profile UUID. Confirmed live on dev: auth.users row exists,
# public.profiles row does not (see .claude/state/current-approved-plan.toml evidence).
CREATED_BY = "e7b61f70-d087-44d8-a81d-7f8a057d2775"  # testdealer@example.com auth.users.id
CREATED_BY_EMAIL = "testdealer@example.com"
CREATED_BY_FULL_NAME = "Test Dealer"

NEW_AREAS = [
    ("IN|KA|Udupi|Santhekatte", "Santhekatte", 13.3876323, 74.7389702, 0.012),
    ("IN|KA|Udupi|Brahmagiri", "Brahmagiri", 13.3412188, 74.7407976, 0.015),
    ("IN|KA|Udupi|Kinnimulki", "Kinnimulki", 13.3234807, 74.7388074, 0.012),
    ("IN|KA|Udupi|Kuthpady", "Kuthpady", 13.3203168, 74.7270290, 0.012),
    ("IN|KA|Udupi|Ambagilu", "Ambagilu", 13.3710379, 74.7464615, 0.012),
    ("IN|KA|Udupi|Adi-Udupi", "Adi-Udupi", 13.3477889, 74.7312050, 0.012),
]

# property_type -> (detail table, listing_id-independent column list) per V102's discriminated
# 1:1 detail tables. Only columns genuinely present in the 99acres source are populated; anything
# not carried by the source is left NULL, never guessed.
COMMERCIAL_DETAIL_TABLES = {
    "commercial": ("listing_commercial_space_details",
                   ["commercial_subtype", "floor_number", "total_floors", "furnishing_status",
                    "washrooms", "parking_count", "road_frontage_ft", "commercial_usage"]),
    "commercial_building": ("listing_commercial_building_details",
                             ["number_of_units", "total_floors", "road_frontage_ft", "commercial_usage"]),
    "warehouse": ("listing_warehouse_details",
                  ["total_floors", "road_frontage_ft", "commercial_usage"]),
    "commercial_land": ("listing_commercial_land_details",
                         ["road_frontage_ft"]),
    "agricultural_land": ("listing_agricultural_land_details",
                           ["water_source", "soil_type", "road_access", "cultivation_status",
                            "land_category", "farmhouse_available", "fencing_done"]),
}


def commercial_detail_values(item, column):
    """Map a detail-table column to the (only) 99acres source field that genuinely supplies it.
    Every column not listed here has no source field and is always NULL."""
    if column == "commercial_subtype":
        # Must agree with property_listings.commercial_subtype (the V104 write-model
        # column set directly from this same source field) so the V135 guard trigger
        # (assert_commercial_subtype_projected) never fires. See issue #2690.
        return item.get("commercial_subtype")
    if column == "floor_number":
        return item.get("floor_number")
    if column == "total_floors":
        return item.get("total_floors")
    if column == "furnishing_status":
        return item.get("furnishing_status")
    if column == "washrooms":
        return item.get("bathrooms")
    return None


def sql_str(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def sql_num(v):
    return "NULL" if v is None else str(v)


def main():
    with open(f"{OUT_DIR}/normalised-listings.json") as f:
        listings = json.load(f)

    # ---- area-seed.sql ----
    with open(f"{OUT_DIR}/area-seed.sql", "w") as f:
        f.write("-- Area seed: new Udupi-district localities backed by OSM Nominatim evidence.\n")
        f.write("-- Issue #2304 Slice 1. Idempotent (ON CONFLICT DO NOTHING). No DDL.\n")
        f.write("-- Evidence: data/imports/udupi-properties-2304/area-bbox-evidence.json\n\n")
        f.write("BEGIN;\n\n")
        f.write("INSERT INTO public.areas (area_key, city_id, name, district,\n")
        f.write("                          geo_center_lat, geo_center_lon,\n")
        f.write("                          min_lat, min_lon, max_lat, max_lon)\n")
        f.write("SELECT v.area_key, c.id, v.name, v.district,\n")
        f.write("       v.geo_center_lat::DOUBLE PRECISION, v.geo_center_lon::DOUBLE PRECISION,\n")
        f.write("       v.min_lat::DOUBLE PRECISION, v.min_lon::DOUBLE PRECISION,\n")
        f.write("       v.max_lat::DOUBLE PRECISION, v.max_lon::DOUBLE PRECISION\n")
        f.write("FROM (VALUES\n")
        rows = []
        for key, name, lat, lon, buf in NEW_AREAS:
            rows.append(
                f"    ({sql_str(key)}, 'udupi', {sql_str(name)}, 'Udupi', "
                f"{lat}, {lon}, {lat - buf}, {lon - buf}, {lat + buf}, {lon + buf})"
            )
        f.write(",\n".join(rows))
        f.write("\n) AS v (area_key, city_slug, name, district,\n")
        f.write("        geo_center_lat, geo_center_lon, min_lat, min_lon, max_lat, max_lon)\n")
        f.write("JOIN public.cities c ON c.slug = v.city_slug\n")
        f.write("ON CONFLICT (area_key) DO NOTHING;\n\n")
        f.write("COMMIT;\n")

    # ---- import.sql ----
    with open(f"{OUT_DIR}/import.sql", "w") as f:
        f.write("-- Data import: Udupi district listings (issue #2304 Slice 2, multi-source).\n")
        f.write("-- Sources: hermandev/housing-com-property-scraper + memo23/99acres-property-scraper (Apify).\n")
        f.write(f"-- {len(listings)} deduplicated (incl. cross-source), coordinate-validated, schema-enum-mapped listings.\n")
        f.write("-- Idempotent: safe to re-run (ON CONFLICT DO NOTHING everywhere).\n")
        f.write(f"-- Reversibility: see rollback.sql (DELETE keyed on parsed_data->>'importIssue' = '{IMPORT_ISSUE}').\n\n")
        f.write("BEGIN;\n\n")
        f.write(
            f"INSERT INTO public.profiles (user_id, email, full_name) VALUES "
            f"('{CREATED_BY}', {sql_str(CREATED_BY_EMAIL)}, {sql_str(CREATED_BY_FULL_NAME)}) "
            f"ON CONFLICT (user_id) DO NOTHING;\n\n"
        )

        cols = (
            "id, created_by, property_type, listing_family, status, is_valid, is_duplicate, address_confirmed, "
            "area_key, area_label, locality, title, latitude, longitude, price, price_paise, bedrooms, bathrooms, "
            "built_area, built_area_unit, land_area, land_area_unit, listing_purpose, facing, property_age, "
            "floor_number, total_floors, furnishing_status, washrooms, parking_count, road_frontage_ft, "
            "commercial_usage, number_of_units, commercial_subtype, commercial_furnishing_status, "
            "area_resolution_status, area_resolution_method, parsed_data"
        )
        for item in listings:
            hid = item["housingListingId"]
            source = item.get("source", "housing.com")
            if source == "99acres":
                original_id = hid.split(":", 1)[1]
                pk = f"(md5('99acres:' || {sql_str(original_id)}))::uuid"
                parsed_data = json.dumps({
                    "source": "99acres",
                    "listingId": original_id,
                    "importIssue": IMPORT_ISSUE,
                })
            else:
                pk = f"(md5('housing.com:' || {sql_str(hid)}))::uuid"
                parsed_data = json.dumps({
                    "source": "housing.com",
                    "housingListingId": hid,
                    "importIssue": IMPORT_ISSUE,
                })
            values = ", ".join([
                pk,
                sql_str(CREATED_BY),
                sql_str(item["property_type"]),
                sql_str(item["listing_family"]),
                "'LIVE'",
                "true",
                "false",
                "false",
                sql_str(item["area_key"]),
                sql_str(item["area_label"]),
                sql_str(item["locality"]),
                sql_str(item["title"]),
                sql_num(item["latitude"]),
                sql_num(item["longitude"]),
                sql_num(item["price"]),
                sql_num(item["price_paise"]),
                sql_num(item["bedrooms"]),
                sql_num(item["bathrooms"]),
                sql_num(item["built_area"]),
                sql_str(item["built_area_unit"]),
                sql_num(item["land_area"]),
                sql_str(item["land_area_unit"]),
                sql_str(item["listing_purpose"]),
                sql_str(item["facing"]),
                sql_str(item["property_age"]),
                sql_num(commercial_detail_values(item, "floor_number")),
                sql_num(commercial_detail_values(item, "total_floors")),
                sql_str(commercial_detail_values(item, "furnishing_status")),
                sql_num(commercial_detail_values(item, "washrooms")),
                sql_num(commercial_detail_values(item, "parking_count")),
                sql_num(commercial_detail_values(item, "road_frontage_ft")),
                sql_str(commercial_detail_values(item, "commercial_usage")),
                sql_num(item.get("number_of_units")),
                sql_str(item.get("commercial_subtype")),
                sql_str(item.get("commercial_furnishing_status_typed")),
                "'RESOLVED'",
                "'CANONICAL_KEY'",
                f"{sql_str(parsed_data)}::jsonb",
            ])
            f.write(f"INSERT INTO public.property_listings ({cols}) VALUES\n  ({values})\nON CONFLICT (id) DO NOTHING;\n")

            for pos, raw_url in enumerate((item.get("photoUrls") or [])[:6]):
                url = fix_photo_url(raw_url)
                storage_path = f"external:{url}"
                f.write(
                    f"INSERT INTO public.listing_images (id, listing_id, storage_path, url, position) VALUES "
                    f"(gen_random_uuid(), {pk}, {sql_str(storage_path)}, {sql_str(url)}, {pos}) "
                    f"ON CONFLICT (listing_id, storage_path) DO NOTHING;\n"
                )

            detail_table = COMMERCIAL_DETAIL_TABLES.get(item["property_type"])
            if detail_table is not None:
                table_name, columns = detail_table
                detail_values = [pk]
                for column in columns:
                    raw_value = commercial_detail_values(item, column)
                    detail_values.append(sql_str(raw_value) if isinstance(raw_value, str) else sql_num(raw_value))
                detail_cols = "listing_id, " + ", ".join(columns)
                f.write(
                    f"INSERT INTO public.{table_name} ({detail_cols}) VALUES\n"
                    f"  ({', '.join(detail_values)})\n"
                    f"ON CONFLICT (listing_id) DO NOTHING;\n"
                )
            f.write("\n")

        f.write("COMMIT;\n")

    # ---- rollback.sql ----
    with open(f"{OUT_DIR}/rollback.sql", "w") as f:
        f.write("-- Rollback for issue #2304 Slice 2 Udupi import. Provenance-keyed DELETE.\n")
        f.write(
            "-- Does NOT delete the public.profiles row for the owner: that row belongs to a real, "
            "pre-existing dev-DB account (testdealer@example.com), not a synthetic identity created by "
            "this import, so rollback must not remove it.\n"
        )
        f.write(
            "-- Keyed only on parsed_data->>'importIssue', NOT on created_by: created_by is now a real, "
            "shared account that may own other (non-import) listings, so matching on created_by alone "
            "would risk deleting listings this import did not create.\n\n"
        )
        f.write("BEGIN;\n\n")
        f.write(
            f"DELETE FROM public.listing_images WHERE listing_id IN "
            f"(SELECT id FROM public.property_listings WHERE parsed_data->>'importIssue' = '{IMPORT_ISSUE}');\n\n"
        )
        f.write(
            f"DELETE FROM public.property_listings WHERE parsed_data->>'importIssue' = '{IMPORT_ISSUE}';\n\n"
        )
        f.write("COMMIT;\n")

    print(f"Wrote import.sql ({len(listings)} listings), area-seed.sql ({len(NEW_AREAS)} areas), rollback.sql")


if __name__ == "__main__":
    main()
