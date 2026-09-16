#!/usr/bin/env python3
"""#2575 — join the adapter's output to the V136 staging tables (MED-3).

THE SEAM THIS CLOSES. Before this file, the adapter and V136 were each verified and **not
connected**: the adapter emitted `area_resolution_reason` and `run`, which V136 does not declare,
and omitted `batch_id`, `outcome`, `raw_payload` and `payload_checksum`, which it does. Nothing
carried a row from capture to staging table in one motion, and `CommercialImportPromotion2575IT`
seeded staging with hand-written SQL instead. Two halves passing with an untested join between
them is the shape where each side is green and the seam is where it breaks.

WHY THIS EMITS SQL RATHER THAN CONNECTING. The exact-head review verified that this directory
"cannot write to property_listings by construction" by tracing the import closure — no database
driver, no subprocess, no socket. Importing psycopg2 here would break that verified property for
a convenience. So this emits a .sql artefact, exactly as generate_sql.py emits import.sql and as
promote.sql is a file: the closure stays clean, the output is reviewable before anything runs, and
the existing Java IT can exercise it without a second test harness.

WHAT IT PRESERVES THAT V136 HAS NO COLUMN FOR. The adapter's `area_resolution_reason` records HOW
an area was resolved (alias, per-listing containment, or the reason it failed). V136 has no column
for it. It is folded into `raw_payload` under a `_derived` key rather than dropped — silently
discarding provenance is precisely the loss this pipeline exists to prevent, and a reader asking
"why is this row in Whitefield?" should not have to re-run the adapter to find out.

CONSTRAINTS THE EMITTED SQL MUST SATISFY (V136, all enforced in the database, not trusted here):
  chk_cic_outcome              outcome IN (STAGED, REJECTED, PROMOTED)
  chk_cic_reject_reason        REJECTED => reject_reason NOT NULL
  chk_cic_promoted_not_rejected PROMOTED => reject_reason IS NULL
  chk_cic_purpose_money        sale => no monthly_rent; rent => no price/price_paise
  chk_cic_subtype              NULL or one of the canonical five
  chk_cic_listing_purpose      NULL or sale|rent
  uq_..._source_identity       UNIQUE (source_platform, source_listing_id)

Usage:
  load_staging_sql.py --candidates C.json --rejects R.json --capture RAW.json --out load.sql
                      [--actor A] [--run-id ID] [--dataset-id ID] [--terms-note TEXT]
"""
import argparse
import hashlib
import json
import os
import sys

IMPORT_ISSUE = 2575

# Columns written per candidate, in the order used by the VALUES tuples below. Every name here is
# a real V136 column — `area_resolution_reason` and `run` are deliberately absent, because they
# are not columns; see the module docstring for where the first one goes instead.
CANDIDATE_COLUMNS = [
    "source_platform", "source_listing_id", "source_url",
    "source_property_type", "source_transaction_type",
    "scraped_at", "source_updated_at",
    "city", "locality", "area_key", "area_label", "latitude", "longitude",
    "property_family", "property_type", "commercial_subtype", "listing_purpose",
    "price", "price_paise", "monthly_rent",
    "built_area", "built_area_unit", "land_area", "land_area_unit",
    "floor_number", "total_floors", "washrooms", "commercial_furnishing_status", "title",
    "raw_payload", "payload_checksum",
    "outcome", "reject_reason", "reject_detail",
]

# Declared V136 types, so EVERY emitted value carries an explicit cast and Postgres never has to
# infer one.
#
# THIS IS NOT COSMETIC. `INSERT ... SELECT FROM (VALUES ...)` makes Postgres infer each column's
# type from the literals. A column that is NULL in every row infers as `unknown` -> `text`, and
# `text` does not coerce into BIGINT or INTEGER, so the apply fails. That is not hypothetical
# here: `monthly_rent`, `floor_number` and `commercial_furnishing_status` are NULL in every row of
# ALL THREE city captures — monthly_rent because all 300 captured rows are Sale.
#
# The scope of that sentence said "BOTH captures / 200 rows" until this PR's own Mangalore commit
# made it stale. It was never false about the two captures it named; it was overtaken, which is the
# harder version to notice because nothing reddens when a comment's scope expires.
#
# Casting ONLY the currently-all-NULL columns would fix today's data and leave the identical trap
# for the next capture where some other column happens to come back uniformly empty. Casting every
# value removes the class. Verbosity is free in generated SQL.
#
# The timestamps matter for the same reason: `scraped_at` / `source_updated_at` are TIMESTAMPTZ
# receiving ISO strings, which inference would treat as text.
COLUMN_TYPES = {
    "source_platform": "text", "source_listing_id": "text", "source_url": "text",
    "source_property_type": "text", "source_transaction_type": "text",
    "scraped_at": "timestamptz", "source_updated_at": "timestamptz",
    "city": "text", "locality": "text", "area_key": "text", "area_label": "text",
    "latitude": "double precision", "longitude": "double precision",
    "property_family": "text", "property_type": "text",
    "commercial_subtype": "text", "listing_purpose": "text",
    "price": "bigint", "price_paise": "bigint", "monthly_rent": "bigint",
    "built_area": "numeric", "built_area_unit": "text",
    "land_area": "numeric", "land_area_unit": "text",
    "floor_number": "integer", "total_floors": "integer", "washrooms": "integer",
    "commercial_furnishing_status": "text", "title": "text",
    "raw_payload": "jsonb", "payload_checksum": "text",
    "outcome": "text", "reject_reason": "text", "reject_detail": "text",
}


def sql_str(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def sql_num(v):
    return "NULL" if v is None else str(v)


def sql_val(column, v):
    """Render one value with an explicit cast to its declared V136 type.

    An unknown column name is a programming error rather than something to default quietly: a
    typo would otherwise emit an uncast value and reintroduce inference for exactly one column,
    which is the hardest version of this bug to spot.
    """
    try:
        typ = COLUMN_TYPES[column]
    except KeyError:
        raise KeyError(
            f"No declared type for column {column!r}. Add it to COLUMN_TYPES — emitting an "
            f"uncast value would reintroduce Postgres type inference for that column."
        )
    if v is None:
        return f"NULL::{typ}"
    if typ == "jsonb":
        return sql_str(json.dumps(v, sort_keys=True, separators=(",", ":"),
                                  ensure_ascii=False)) + "::jsonb"
    if isinstance(v, bool):
        return f"{'true' if v else 'false'}::{typ}"
    if isinstance(v, (int, float)):
        return f"{sql_num(v)}::{typ}"
    return f"{sql_str(v)}::{typ}"


def checksum(obj):
    return hashlib.sha256(
        json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()


def build_rows(candidates, rejects, capture_by_id):
    """One dict per V136 candidate row, STAGED and REJECTED alike.

    Rejects are rows with an outcome and a reason, never absences — #2575 requires them to be
    inspectable, and a silently dropped row is indistinguishable from one the source never
    returned. Their field names differ from a candidate's, so they are mapped explicitly rather
    than splatted: `raw_property_type` -> `source_property_type`, `detail` -> `reject_detail`.
    """
    rows = []

    for c in candidates:
        raw = capture_by_id.get(c.get("source_listing_id"))
        payload = dict(raw) if raw else {}
        # Provenance V136 has no column for — preserved, not dropped.
        payload["_derived"] = {"area_resolution_reason": c.get("area_resolution_reason")}
        row = {k: c.get(k) for k in CANDIDATE_COLUMNS}
        row["raw_payload"] = payload
        row["payload_checksum"] = checksum(payload)
        row["outcome"] = "STAGED"
        row["reject_reason"] = None
        row["reject_detail"] = None
        rows.append(row)

    for r in rejects:
        raw = capture_by_id.get(r.get("source_listing_id"))
        payload = dict(raw) if raw else {}
        row = {k: None for k in CANDIDATE_COLUMNS}
        row["source_platform"] = r.get("source_platform")
        row["source_listing_id"] = r.get("source_listing_id")
        row["source_url"] = r.get("source_url")
        row["source_property_type"] = r.get("raw_property_type")
        row["raw_payload"] = payload
        row["payload_checksum"] = checksum(payload)
        row["outcome"] = "REJECTED"
        row["reject_reason"] = r.get("reject_reason")
        row["reject_detail"] = r.get("detail")
        rows.append(row)

    return rows


def assert_satisfies_v136(rows):
    """Fail before emitting, rather than letting Postgres reject the file mid-apply.

    The database is the enforcer — these checks do not replace it. They exist so a violation is
    reported here, with the offending source id and the constraint it breaks, instead of surfacing
    as a constraint-violation error part-way through applying a 168-row transaction.
    """
    valid_subtypes = {"SHOP", "OFFICE", "BUILDING", "WAREHOUSE", "LAND"}
    problems = []
    seen = set()
    for r in rows:
        sid = r.get("source_listing_id")
        key = (r.get("source_platform"), sid)
        if not r.get("source_platform") or not sid:
            problems.append((sid, "identity: source_platform and source_listing_id are NOT NULL"))
        if key in seen:
            problems.append((sid, "uq_..._source_identity: duplicate (source_platform, source_listing_id)"))
        seen.add(key)
        if r["outcome"] not in ("STAGED", "REJECTED", "PROMOTED"):
            problems.append((sid, f"chk_cic_outcome: {r['outcome']!r}"))
        if r["outcome"] == "REJECTED" and not r.get("reject_reason"):
            problems.append((sid, "chk_cic_reject_reason: REJECTED with no reason"))
        if r["outcome"] == "PROMOTED" and r.get("reject_reason"):
            problems.append((sid, "chk_cic_promoted_not_rejected"))
        lp = r.get("listing_purpose")
        if lp not in (None, "sale", "rent"):
            problems.append((sid, f"chk_cic_listing_purpose: {lp!r}"))
        if lp == "sale" and r.get("monthly_rent") is not None:
            problems.append((sid, "chk_cic_purpose_money: sale row carries monthly_rent"))
        if lp == "rent" and (r.get("price") is not None or r.get("price_paise") is not None):
            problems.append((sid, "chk_cic_purpose_money: rent row carries a sale price band"))
        st = r.get("commercial_subtype")
        if st is not None and st not in valid_subtypes:
            problems.append((sid, f"chk_cic_subtype: {st!r}"))
    return problems


def emit(batch, rows):
    """One transaction, one statement for the candidates.

    The batch id is produced and consumed inside a single CTE rather than via a session variable
    or a second round trip: the candidate rows cannot exist without their batch, and nothing in
    between can observe a batch with no candidates.
    """
    out = []
    out.append("-- #2575 staging load — GENERATED by load_staging_sql.py. Do not hand-edit.")
    out.append("-- Joins the adapter's candidate/reject output to the V136 staging tables.")
    out.append("-- Idempotent: the candidate upsert targets uq_..._source_identity, so re-applying")
    out.append("-- UPDATES the same rows rather than duplicating them (#2575 rerun semantics).")
    out.append("-- Rejected rows are loaded too, with their reason — they are inspectable rows,")
    out.append("-- not absences.")
    out.append("")
    out.append("BEGIN;")
    out.append("")
    out.append("WITH b AS (")
    out.append("    INSERT INTO public.commercial_import_batch (")
    out.append("        import_issue, source_platform, city, actor, actor_run_id, dataset_id,")
    out.append("        capture_file, capture_sha256, actor_input, source_terms_note,")
    out.append("        fetched_count, normalized_count, rejected_count)")
    out.append("    VALUES (")
    out.append("        {}, {}, {}, {}, {}, {},".format(
        sql_num(batch["import_issue"]), sql_str(batch["source_platform"]), sql_str(batch["city"]),
        sql_str(batch["actor"]), sql_str(batch["actor_run_id"]), sql_str(batch["dataset_id"])))
    out.append("        {}, {}, {}, {},".format(
        sql_str(batch["capture_file"]), sql_str(batch["capture_sha256"]),
        sql_val("raw_payload", batch["actor_input"]), sql_str(batch["source_terms_note"])))
    out.append("        {}, {}, {})".format(
        sql_num(batch["fetched_count"]), sql_num(batch["normalized_count"]),
        sql_num(batch["rejected_count"])))
    out.append("    RETURNING id")
    out.append(")")
    out.append("INSERT INTO public.commercial_import_candidate (batch_id, {})".format(
        ", ".join(CANDIDATE_COLUMNS)))
    out.append("SELECT b.id, v.* FROM b, (VALUES")

    tuples = []
    for r in rows:
        vals = ", ".join(sql_val(c, r.get(c)) for c in CANDIDATE_COLUMNS)
        tuples.append("    ({})".format(vals))
    out.append(",\n".join(tuples))
    out.append(") AS v ({})".format(", ".join(CANDIDATE_COLUMNS)))

    # DO UPDATE, never DO NOTHING: a re-import after a source correction must carry the change
    # through. DO NOTHING is the failure mode #2575 names and the #2304 import.sql exhibits.
    updates = [c for c in CANDIDATE_COLUMNS if c not in ("source_platform", "source_listing_id")]
    out.append("ON CONFLICT (source_platform, source_listing_id) DO UPDATE SET")
    out.append(",\n".join("    {c} = EXCLUDED.{c}".format(c=c) for c in updates))
    out.append("  , batch_id   = EXCLUDED.batch_id")
    out.append("  , updated_at = now();")
    out.append("")
    out.append("COMMIT;")
    return "\n".join(out) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--candidates", required=True)
    ap.add_argument("--rejects", required=True)
    ap.add_argument("--capture", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--actor", default="memo23/99acres-property-scraper")
    ap.add_argument("--run-id", default=None)
    ap.add_argument("--dataset-id", default=None)
    ap.add_argument("--terms-note", default=None,
                    help="Collection-permission position at run time. LEFT NULL MEANS UNDOCUMENTED, "
                         "which is a finding — never read a NULL here as 'no restrictions'.")
    # Which key in the capture identifies a row. 99acres captures spell it `listingId`;
    # the housing.com export spells it `sourceListingId`. Without this the housing rows
    # all index under None and collapse to ONE entry, so every row but one silently
    # loses its raw_payload — a failure that produces a valid-looking load file.
    # Defaulted to the 99acres spelling so existing behaviour is byte-identical.
    ap.add_argument("--capture-id-field", default="listingId",
                    help="Capture field holding the source listing id (default: listingId).")
    args = ap.parse_args()

    candidates = json.load(open(args.candidates))
    rejects = json.load(open(args.rejects))
    capture = json.load(open(args.capture))
    capture_by_id = {r.get(args.capture_id_field): r for r in capture}

    if not candidates:
        raise SystemExit("No candidates. Refusing to emit a load that stages nothing.")

    run = candidates[0].get("run") or {}
    batch = {
        "import_issue": run.get("import_issue", IMPORT_ISSUE),
        "source_platform": run.get("source_platform"),
        "city": run.get("city"),
        "actor": args.actor,
        "actor_run_id": args.run_id,
        "dataset_id": args.dataset_id,
        "capture_file": run.get("capture_file"),
        "capture_sha256": run.get("capture_sha256"),
        "actor_input": {"city": run.get("city"), "searchMode": "commercial"},
        "source_terms_note": args.terms_note,
        "fetched_count": len(candidates) + len(rejects),
        "normalized_count": len(candidates),
        "rejected_count": len(rejects),
    }
    if not batch["source_platform"] or not batch["city"]:
        raise SystemExit(
            "Batch identity incomplete: source_platform and city are NOT NULL in V136 and come "
            "from the adapter's run block. Refusing to emit SQL that would fail on apply."
        )

    rows = build_rows(candidates, rejects, capture_by_id)

    problems = assert_satisfies_v136(rows)
    if problems:
        for sid, why in problems[:20]:
            print(f"  VIOLATION {sid}: {why}")
        raise SystemExit(
            f"LOAD_SQL: FAIL — {len(problems)} row(s) would violate a V136 constraint. "
            f"Nothing emitted; fix the adapter output rather than the SQL."
        )

    with open(args.out, "w") as f:
        f.write(emit(batch, rows))

    unmatched = sum(1 for r in rows if not r["raw_payload"] or set(r["raw_payload"]) == {"_derived"})
    print(json.dumps({
        "batch": {k: batch[k] for k in ("source_platform", "city", "capture_file",
                                        "fetched_count", "normalized_count", "rejected_count")},
        "rows_emitted": len(rows),
        "staged": sum(1 for r in rows if r["outcome"] == "STAGED"),
        "rejected": sum(1 for r in rows if r["outcome"] == "REJECTED"),
        "rows_without_raw_payload": unmatched,
        "out": os.path.basename(args.out),
    }, indent=2))
    if unmatched:
        print(f"  NOTE {unmatched} row(s) carry no raw_payload — their source id was not found in "
              f"the capture. Reported rather than hidden: it means the candidate and capture files "
              f"are out of step.")
    print("LOAD_SQL: PASS (all rows satisfy the V136 constraints checked here)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
