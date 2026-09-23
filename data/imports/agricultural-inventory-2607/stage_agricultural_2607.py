"""#2607 — stage the owner-supplied Agricultural rows via V141.

Reads the owner-supplied raw export (NOT committed to this repo — it is supplied
out-of-band, outside the tree), runs each record through adapter_agricultural.
build_candidate, writes SANITIZED audit artifacts (candidates / reject report —
PII already stripped by adapter_agricultural.sanitise() on both the staged and
rejected paths), and emits agricultural-load-staging.sql: one batch per city,
mirroring the #2575 Commercial convention (agricultural_import_batch.city is
NOT NULL, same as commercial_import_batch.city — one batch per city, documented
in adapter_housing_commercial.py's build_candidate).

THIS SCRIPT DOES NOT APPLY THE GENERATED SQL TO ANY DATABASE. It only writes the
SQL file. Mirrors the #2575/#2597 convention: the PR that introduced Commercial
staging committed load-staging.sql artifacts without applying them as part of
the PR itself (#2597: "No production data mutated"). Applying
agricultural-load-staging.sql to any persistent database — dev, shared, or
production — is a separate, deliberate step outside this script's and this PR's
scope.

Usage:
    python3 stage_agricultural_2607.py --raw /path/to/agricultural.jsonl.json
"""

import argparse
import hashlib
import json
import os
from collections import defaultdict

from adapter_agricultural import build_candidate

IMPORT_ISSUE = 2607

CANDIDATE_COLUMNS = [
    "source_platform", "source_listing_id", "source_url",
    "source_property_type", "source_transaction_type",
    "scraped_at", "source_updated_at",
    "city", "locality", "area_key", "area_label", "latitude", "longitude",
    "property_family", "agricultural_subtype", "listing_purpose",
    "price", "price_paise", "monthly_rent",
    "area_type", "plot_area", "plot_area_unit",
    "title",
    "raw_payload", "payload_checksum",
    "outcome", "reject_reason", "reject_detail",
]

COLUMN_TYPES = {
    "source_platform": "text", "source_listing_id": "text", "source_url": "text",
    "source_property_type": "text", "source_transaction_type": "text",
    "scraped_at": "timestamptz", "source_updated_at": "timestamptz",
    "city": "text", "locality": "text", "area_key": "text", "area_label": "text",
    "latitude": "double precision", "longitude": "double precision",
    "property_family": "text", "agricultural_subtype": "text", "listing_purpose": "text",
    "price": "bigint", "price_paise": "bigint", "monthly_rent": "bigint",
    "area_type": "text", "plot_area": "numeric", "plot_area_unit": "text",
    "title": "text",
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
    """Render one value with an explicit cast to its declared V141 type.

    Mirrors load_staging_sql.py's sql_val (#2575): an unknown column is a
    programming error, not something to default quietly.
    """
    try:
        typ = COLUMN_TYPES[column]
    except KeyError:
        raise KeyError(f"No declared type for column {column!r}. Add it to COLUMN_TYPES.")
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


def build_rows(candidates, rejects):
    """One dict per V141 candidate row, STAGED and REJECTED alike.

    Rejects are rows with an outcome and a reason, never absences — mirrors V136's own
    "rejects are inspectable rows, not absences" convention.
    """
    rows = []
    for c in candidates:
        row = {k: c.get(k) for k in CANDIDATE_COLUMNS}
        row["payload_checksum"] = checksum(c["raw_payload"])
        row["outcome"] = "STAGED"
        row["reject_reason"] = None
        row["reject_detail"] = None
        rows.append(row)
    for r in rejects:
        row = {k: None for k in CANDIDATE_COLUMNS}
        row["source_platform"] = r.get("source_platform")
        row["source_listing_id"] = r.get("source_listing_id")
        row["source_url"] = r.get("source_url")
        row["source_property_type"] = r.get("raw_property_type")
        row["raw_payload"] = r.get("raw_payload") or {}
        row["payload_checksum"] = checksum(row["raw_payload"])
        row["outcome"] = "REJECTED"
        row["reject_reason"] = r.get("reject_reason")
        row["reject_detail"] = r.get("detail")
        rows.append(row)
    return rows


def assert_satisfies_v141(rows):
    """Fail before emitting, rather than letting Postgres reject the file mid-apply.

    Mirrors assert_satisfies_v136 (#2575) — the database is the enforcer; this exists so a
    violation is reported here, with the offending source id, instead of surfacing mid-apply.
    """
    valid_subtypes = {"AGRICULTURAL_LAND"}
    problems = []
    seen = set()
    for r in rows:
        sid = r.get("source_listing_id")
        key = (r.get("source_platform"), sid)
        if not r.get("source_platform") or not sid:
            problems.append((sid, "identity: source_platform and source_listing_id are NOT NULL"))
        if key in seen:
            problems.append((sid, "uq_agricultural_import_candidate_source_identity: duplicate"))
        seen.add(key)
        if r["outcome"] not in ("STAGED", "REJECTED", "PROMOTED"):
            problems.append((sid, f"chk_aic_outcome: {r['outcome']!r}"))
        if r["outcome"] == "REJECTED" and not r.get("reject_reason"):
            problems.append((sid, "chk_aic_reject_reason: REJECTED with no reason"))
        if r["outcome"] == "PROMOTED" and r.get("reject_reason"):
            problems.append((sid, "chk_aic_promoted_not_rejected"))
        lp = r.get("listing_purpose")
        if lp not in (None, "sale", "rent"):
            problems.append((sid, f"chk_aic_listing_purpose: {lp!r}"))
        if lp == "sale" and r.get("monthly_rent") is not None:
            problems.append((sid, "chk_aic_purpose_money: sale row carries monthly_rent"))
        if lp == "rent" and (r.get("price") is not None or r.get("price_paise") is not None):
            problems.append((sid, "chk_aic_purpose_money: rent row carries a sale price band"))
        st = r.get("agricultural_subtype")
        if st is not None and st not in valid_subtypes:
            problems.append((sid, f"chk_aic_subtype: {st!r}"))
        pf = r.get("property_family")
        if pf is not None and pf != "AGRICULTURAL":
            problems.append((sid, f"chk_aic_property_family: {pf!r}"))
        at = r.get("area_type")
        if at is not None and at != "Plot Area":
            problems.append((sid, f"chk_aic_area_type: {at!r}"))
    return problems


def emit_batch_sql(city, batch, rows_for_city):
    out = [
        f"-- #2607 Agricultural staging load for {city} — GENERATED by stage_agricultural_2607.py.",
        "-- Do not hand-edit. Idempotent: targets",
        "-- uq_agricultural_import_candidate_source_identity — re-applying UPDATES the same rows",
        "-- rather than duplicating them.",
        "--",
        "-- NOT APPLIED as part of this PR. Applying this file to any database is a separate,",
        "-- deliberate step, mirroring the #2575/#2597 convention.",
        "",
        "BEGIN;",
        "",
        "WITH b AS (",
        "    INSERT INTO public.agricultural_import_batch (",
        "        import_issue, source_platform, city, actor, capture_file,",
        "        fetched_count, normalized_count, rejected_count)",
        "    VALUES (",
        "        {}, {}, {}, {},".format(
            sql_num(batch["import_issue"]), sql_str(batch["source_platform"]),
            sql_str(city), sql_str(batch["actor"])),
        "        {}, {}, {}, {})".format(
            sql_str(batch["capture_file"]), sql_num(batch["fetched_count"]),
            sql_num(batch["normalized_count"]), sql_num(batch["rejected_count"])),
        "    RETURNING id",
        ")",
        "INSERT INTO public.agricultural_import_candidate (batch_id, {})".format(
            ", ".join(CANDIDATE_COLUMNS)),
        "SELECT b.id, v.* FROM b, (VALUES",
    ]
    tuples = []
    for r in rows_for_city:
        vals = ", ".join(sql_val(c, r.get(c)) for c in CANDIDATE_COLUMNS)
        tuples.append("    ({})".format(vals))
    out.append(",\n".join(tuples))
    out.append(") AS v ({})".format(", ".join(CANDIDATE_COLUMNS)))

    # DO UPDATE, never DO NOTHING — mirrors #2575's rationale exactly: a re-import after a
    # source correction must carry the change through.
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
    ap.add_argument("--raw", required=True,
                     help="Path to the owner-supplied raw export (outside the repo).")
    ap.add_argument("--out-dir", default=os.path.dirname(os.path.abspath(__file__)))
    ap.add_argument("--actor", default="owner-supplied-export")
    args = ap.parse_args()

    with open(args.raw) as f:
        raw_records = [json.loads(line) for line in f if line.strip()]

    candidates, rejects = [], []
    for record in raw_records:
        candidate, reject = build_candidate(record)
        if candidate is not None:
            candidates.append(candidate)
        else:
            rejects.append(reject)

    # Sanitized audit artifacts — PII already stripped by adapter_agricultural.sanitise() on
    # BOTH the staged and rejected paths, mirroring the #2575 Commercial convention.
    with open(os.path.join(args.out_dir, "agricultural-staging-candidates.json"), "w") as f:
        json.dump(candidates, f, indent=2, sort_keys=True)
    with open(os.path.join(args.out_dir, "agricultural-reject-report.json"), "w") as f:
        json.dump(rejects, f, indent=2, sort_keys=True)

    rows = build_rows(candidates, rejects)
    problems = assert_satisfies_v141(rows)
    if problems:
        for sid, why in problems[:20]:
            print(f"  VIOLATION {sid}: {why}")
        raise SystemExit(
            f"STAGE: FAIL — {len(problems)} row(s) would violate a V141 constraint. "
            f"Nothing emitted; fix the adapter output rather than the SQL.")

    by_city = defaultdict(list)
    for r in rows:
        by_city[r["city"]].append(r)

    sql_parts = []
    for city, rows_for_city in sorted(by_city.items()):
        staged_n = sum(1 for r in rows_for_city if r["outcome"] == "STAGED")
        rejected_n = sum(1 for r in rows_for_city if r["outcome"] == "REJECTED")
        batch = {
            "import_issue": IMPORT_ISSUE,
            "source_platform": "housing.com",
            "actor": args.actor,
            "capture_file": os.path.basename(args.raw),
            "fetched_count": len(rows_for_city),
            "normalized_count": staged_n,
            "rejected_count": rejected_n,
        }
        sql_parts.append(emit_batch_sql(city, batch, rows_for_city))

    out_sql = os.path.join(args.out_dir, "agricultural-load-staging.sql")
    with open(out_sql, "w") as f:
        f.write("\n".join(sql_parts))

    summary = {
        "fetched": len(raw_records),
        "staged": sum(1 for r in rows if r["outcome"] == "STAGED"),
        "rejected": sum(1 for r in rows if r["outcome"] == "REJECTED"),
        "by_city": {city: len(rows_for_city) for city, rows_for_city in sorted(by_city.items())},
        "out": os.path.basename(out_sql),
    }
    print(json.dumps(summary, indent=2))
    print("STAGE: PASS (all rows satisfy the V141 constraints checked here)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
