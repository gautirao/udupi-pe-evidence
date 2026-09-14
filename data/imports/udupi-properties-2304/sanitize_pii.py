#!/usr/bin/env python3
"""Issue #2304 (PR review B3): PII minimisation of the committed raw scrape artefacts.

Run against the ORIGINAL scrape output; already applied to the committed files. Kept in the
repo as the executable record of exactly what was removed and why, and so any future re-scrape
goes through the same filter before being committed. Idempotent.

The detectors live in pii_filter.py, which explains the value-shaped-first design and why the
previous field-denylist version leaked five different ways. This module is the policy: which
fields are dropped outright, which rows get name redaction, and what is deliberately kept.

--------------------------------------------------------------------------------------------
DROPPED OUTRIGHT (none of it read by normalise.py / normalise_v2.py / generate_sql.py)

  dealerName, companyName, builderName  (99acres)
      Identity of the listing owner/dealer. An earlier revision of this docstring called these
      "real person names", which is FALSE for dealerName/companyName in this corpus: across all
      314 populated row-fields in the three artefacts there is exactly ONE distinct value, i.e.
      a portal/scraper constant rather than a per-listing person. Dropping them is still correct
      — nothing reads them, and builderName is not constant — but the reason is field-level
      minimisation, not that each value names an individual. Stated accurately because the next
      reader will trust it.

  description  (all sources)
      Removed entirely rather than redacted in place. It was the single source of four of the
      six PII findings in review: an unmasked mobile plus e-mail address (99acres V92668720), a
      UAE number that a single-locale regex missed (G90973440), a number spelled out in English
      words to defeat the portal's own masking (J89255947, a 10-digit mobile written out one
      word per digit), and a bare personal name (L92557174, "Contact direct owner <name>").
      Free-text personal names are not solvable by pattern matching, so deleting the field is
      strictly stronger than filtering inside it. Nothing reads it, and it is not
      needed to reproduce the import, so it fails the owner's "whatever fields are actually
      needed" test.

  reraId  (99acres)
      Unused, and null in 93 of 94 rows — the one populated value, on rent listing J92493296,
      is not a RERA registration at all but a dealer's bare 10-digit mobile.

  sellers[].id / .name / .phone  (Housing.com)
      `type` and `designation` are KEPT: categorical, non-identifying, and the presence of a
      sellers[] entry is structurally meaningful. `id` goes too — it resolves back to the same
      person's public profile, so it is a pseudonymous identifier, not neutral metadata.

  developer.{id,name,url} -> {"redacted": ...}  (Housing.com)
      developer.name is not reliably corporate: several values in this dataset are individual
      builders' personal names rather than firms, so no name-shape rule could safely keep it.
      The key is retained as a marker because presence/absence IS meaningful (84 of 260 rows
      genuinely had no developer) and nulling it would erase that distinction.

--------------------------------------------------------------------------------------------
NAME REDACTION ON DISCARDED ROWS

Replacing the developer object was not enough on its own: the same person's name survived in
the row's own `title` and in its URL slugs (apify row id 370227 carried it in
`url` as `...-by-<developer-slug>-in-manipal` and in `coverImageUrl`/`images[]` as
`..._1-udupi-<developer_slug>.jpeg`). So each row's own identity names — and their
hyphen/underscore slug forms — are redacted from every string leaf of that row.

This is applied ONLY to rows the pipeline discards. normalise.main keeps
`propertyType == "resale"` and drops the other 176 of 260 Housing.com rows, so a project row's
title and image URLs reach neither normalised-listings.json nor import.sql. Restricting the
rewrite to those rows is what guarantees no imported listing title or `listing_images.url` is
altered. Two facts make this complete rather than a compromise, both verified against the
pre-sanitisation baseline:
  * 0 of the 84 resale rows carry a seller/developer name in title/projectName/subtitle/etc.
  * 0 of the 84 resale rows carry a name slug in any url/coverImageUrl/images[] value —
    all 175 rows with name-bearing URLs are project rows.

--------------------------------------------------------------------------------------------
DELIBERATELY KEPT

  listingId / id / spid / url / sourceUrl   provenance; needed to reproduce the import.
  listedBy ("Owner" | "Dealer")             a category, not an identity.
  buildingName / projectName                CONSUMED by normalise_v2.coordinate_trusted_rows.
  title on resale rows                      imported verbatim as the listing's published name.

  NOTE on the four project titles that embed a builder's personal name (apify ids 258211,
  370226, 257876, 257888): an earlier revision of this file justified keeping them on the
  grounds that they were "imported verbatim" and that removing them "would corrupt the imported
  listing". That was FACTUALLY WRONG — all four rows are propertyType "project", filtered out
  at normalise.py:135, and none of the names appears anywhere in import.sql. They are now redacted along with every other
  discarded-row name, which costs nothing precisely because nothing consumes them.
"""
import json
import os
import sys

from pii_filter import map_strings, name_variants, redact_contacts, redact_names

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

NINETYNINE_FILES = (
    "raw-99acres-buy-output.json",
    "raw-99acres-rent-output.json",
    "raw-99acres-commercial-output.json",
)
NINETYNINE_DROP = ("dealerName", "companyName", "builderName", "description", "reraId")
APIFY_DROP = ("description",)
SELLER_DROP = ("id", "name", "phone")


def apify_row_is_consumed(row):
    """normalise.main keeps `propertyType == "resale"` and discards the other 176 of 260.

    Cited by symbol, not line: the line number in an earlier revision of this docstring (135)
    had already drifted off the actual filter, and a stale citation reads as authoritative.
    """
    return row.get("propertyType") == "resale"


def ninetynine_row_is_consumed(_row):
    """Every 99acres row is treated as a consumption candidate — so NONE is name-rewritten.

    Unlike the Housing.com artefact there is no stable per-row flag marking a 99acres row as
    discarded: normalise_v2 filters on coordinate trust, envelope, price, type vocabulary and
    area resolution, all computed rather than declared. So no 99acres row is eligible for in-row
    name rewriting — its `title` may be imported verbatim and its `buildingName`/`projectName`
    are read by coordinate_trusted_rows. Dropping dealerName / companyName / builderName /
    description / reraId outright is what protects these rows, and it is sufficient: once those
    five fields are gone, the only identity strings left anywhere in the three 99acres artefacts
    are company brands in `projectName` / `buildingName` / `url` (verified against the
    pre-sanitisation baseline), and those fields are consumed.
    """
    return True


def write_json(path, rows):
    """Preserve the artefacts' existing serialisation exactly (indent=2, unescaped unicode,
    trailing newline) so the diff shows only the removed content."""
    with open(path, "w") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)
        f.write("\n")


def row_identity_names(row):
    names = set()
    dev = row.get("developer")
    if isinstance(dev, dict) and dev.get("name"):
        names.add(dev["name"])
    for s in (row.get("sellers") or []):
        if s.get("name"):
            names.add(s["name"])
    for k in ("dealerName", "companyName", "builderName"):
        if row.get(k):
            names.add(row[k])
    return names


def sanitize_rows(rows, drop_keys, is_consumed):
    stats = {"dropped_fields": 0, "rows_name_redacted": 0, "sellers": 0, "developers": 0}

    for i, row in enumerate(rows):
        # 1. Name redaction across the whole row — BEFORE the identity fields are removed,
        #    since they are where the names come from. Discarded rows only (see module docs).
        if not is_consumed(row):
            variants = set()
            for n in row_identity_names(row):
                variants |= name_variants(n)
            if variants:
                before = json.dumps(row, sort_keys=True)
                new = map_strings(row, lambda s: redact_names(s, variants))
                if json.dumps(new, sort_keys=True) != before:
                    rows[i] = row = new
                    stats["rows_name_redacted"] += 1

        # 2. Structured field denylist (second layer, not the entry point).
        for k in drop_keys:
            if k in row:
                del row[k]
                stats["dropped_fields"] += 1

        for s in (row.get("sellers") or []):
            if any(k in s for k in SELLER_DROP):
                for k in SELLER_DROP:
                    s.pop(k, None)
                stats["sellers"] += 1

        dev = row.get("developer")
        if isinstance(dev, dict) and set(dev) != {"redacted"}:
            row["developer"] = {"redacted": "pii-minimised-issue-2304"}
            stats["developers"] += 1

    # 3. PRIMARY layer: key-agnostic contact-shape sweep over every remaining string leaf.
    return map_strings(rows, redact_contacts), stats


def main():
    for fn in NINETYNINE_FILES:
        path = f"{OUT_DIR}/{fn}"
        rows, st = sanitize_rows(json.load(open(path)), NINETYNINE_DROP,
                                 ninetynine_row_is_consumed)
        write_json(path, rows)
        print(f"{fn}: {len(rows)} rows | {st['dropped_fields']} identity/free-text fields "
              f"dropped | {st['rows_name_redacted']} rows name-redacted")

    path = f"{OUT_DIR}/raw-apify-output.json"
    rows, st = sanitize_rows(json.load(open(path)), APIFY_DROP, apify_row_is_consumed)
    write_json(path, rows)
    print(f"raw-apify-output.json: {len(rows)} rows | {st['dropped_fields']} description fields "
          f"dropped | {st['sellers']} seller entries de-identified | "
          f"{st['developers']} developer objects redacted | "
          f"{st['rows_name_redacted']} rows name-redacted")
    return 0


if __name__ == "__main__":
    sys.exit(main())
