#!/usr/bin/env python3
"""#2575 — PII minimisation for a 99acres Commercial capture, BEFORE it enters the repository.

COMMITTED DELIBERATELY. An earlier revision of this lane ran this script from a scratch directory
and cited its results in the PR while the file itself existed nowhere in the tree. That made the
PII evidence **unreproducible**, which is indistinguishable from evidence that never ran — the
exact failure shape this pipeline exists to prevent, applied by accident to the gate protecting
scraped contact data. It lives here now so anyone can re-run it against the committed capture.

Reuses the #2304 policy rather than inventing a second one: the same field denylist and the same
key-agnostic value-shaped sweep, from `sanitize_pii.py` / `pii_filter.py`. A second, divergent
sanitiser would be the thing that later leaks — two policies drift, and the weaker one wins.

MEASURED on the Bengaluru capture before sanitising (100 rows):
    dealerName 100 · description 100 · listedBy 100 · companyName 71 · reraId 10
    contact-SHAPE hits: 1 row, in `description`

Those two numbers say different things and both matter. The shape detectors catch phone/e-mail
patterns and found only one row — so a shape-only sweep would have left `dealerName` on all 100
rows untouched. The FIELD denylist removes identity; the shape sweep catches a number pasted into
free text. Neither alone is sufficient, which is why both layers run.

`listedBy` is KEPT deliberately: its values are the categories "Owner"/"Dealer", not identities —
the same decision recorded in `sanitize_pii.py` for the Udupi corpus. `buildingName`/`projectName`
are kept because `normalise_v2.coordinate_trusted_rows` consumes them; removing them would destroy
the coordinate-trust signal while appearing to improve privacy.

Usage:  sanitise_bengaluru.py <raw-in.json> <sanitised-out.json>
Exit :  0 = sanitised AND verified clean, 1 = a residual survived (fails closed)
"""
import json
import os
import re
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_IMPORT_2304 = os.path.abspath(os.path.join(_HERE, "..", "udupi-properties-2304"))
sys.path.insert(0, _IMPORT_2304)

from pii_filter import find_contacts, map_strings, redact_contacts, walk_strings  # noqa: E402

# Mirrors sanitize_pii.NINETYNINE_DROP. Asserted against it below rather than trusted, so
# "reuses the existing policy" is a property rather than a comment.
NINETYNINE_DROP = ("dealerName", "companyName", "builderName", "description", "reraId")


def assert_policy_matches_upstream():
    """Fail if this file's denylist has drifted from the #2304 policy it claims to reuse.

    Without this, upstream could add a sixth field and this capture would silently keep it.
    """
    import sanitize_pii
    if tuple(sanitize_pii.NINETYNINE_DROP) != NINETYNINE_DROP:
        raise SystemExit(
            "POLICY_DRIFT: sanitize_pii.NINETYNINE_DROP is "
            f"{tuple(sanitize_pii.NINETYNINE_DROP)} but this script drops {NINETYNINE_DROP}. "
            "Reconcile before sanitising — a divergent denylist is how a field survives."
        )


def count_shapes(rows):
    return sum(len(find_contacts(s)) for r in rows for _, s in walk_strings(r, path=""))


def _identity_variants(value):
    """The forms a field value takes when it reappears inside a URL path or slug.

    A builder stored as "Example Trades Builders" reappears in an image URL as
    `example_trades_builders`, so matching only the exact literal would miss every such case.

    THE EXAMPLE ABOVE IS SYNTHETIC, AND THAT IS THE POINT. An earlier revision of this docstring
    used the REAL builder name from the capture — putting a live identity into committed source,
    inside the very function written to erase it. The residuals sweep's canary layer failed the
    run and named this file. The fix was to replace the value, never to add an exemption: an
    exemption list is how a fail-closed gate quietly stops being one.

    The six-character floor is deliberate. A short variant would match ordinary text and redact
    things that are not identities — the same discrimination failure that made a bare canary
    literal `Name` match every file in this directory during the residuals sweep.
    """
    low = value.strip().lower()
    variants = {
        low,
        re.sub(r"[^a-z0-9]+", "", low),
        re.sub(r"[^a-z0-9]+", "_", low).strip("_"),
        re.sub(r"[^a-z0-9]+", "-", low).strip("-"),
    }
    return {v for v in variants if len(v) >= 6}


_MARKER = "[redacted-identity]"


def _scrub(node, variants):
    """Erase every identity variant from every string leaf, case-insensitively.

    ADVANCES PAST THE INSERTED MARKER rather than rescanning from position 0. The earlier form
    restarted the search at the start of the string after each replacement, so a variant that is
    a SUBSTRING OF THE MARKER ITSELF re-created a match on every pass and grew the string without
    bound — a hang and unbounded memory growth, not a leak. Contrived but genuinely reachable:
    a `companyName` of "Identity", or one normalising to "redacted", is built from source-
    controlled text, and this runs fail-closed over arbitrary future captures. Raised as LOW-3 in
    the exact-head review of 393c8cd1.
    """
    if isinstance(node, str):
        out = node
        for v in variants:
            pos = 0
            while True:
                idx = out.lower().find(v, pos)
                if idx == -1:
                    break
                out = out[:idx] + _MARKER + out[idx + len(v):]
                pos = idx + len(_MARKER)
        return out
    if isinstance(node, list):
        return [_scrub(x, variants) for x in node]
    if isinstance(node, dict):
        return {k: _scrub(v, variants) for k, v in node.items()}
    return node


def sanitise(rows):
    """Field denylist, then IDENTITY-VALUE erasure, then the key-agnostic contact-shape sweep.

    THE MIDDLE LAYER EXISTS BECAUSE THE FIRST LAYER'S CLAIM WAS FALSE. Dropping `builderName`
    removes the FIELD while the identical value survives elsewhere in the same row — measured on
    the #2575 Mangalore capture, where the value persisted inside image URL slugs after the field
    itself had been deleted. "The field denylist removes identity" only holds if the VALUE is
    erased wherever it reappears.

    THE COUNTS, RECONCILED — an earlier revision said "2 rows (7 URLs)" while the reports said
    "one row (5 URLs)", and the shortfall was never explained. Measured, both are partly right and
    the honest version is neither:

      * `411487` — 5 image URLs, all 5 ERASED, because the row's dropped `builderName` matched.
      * `439814` — 2 image URLs, NEITHER erased, because that row's dropped fields do not match
        the slug. What the slug does match is the row's own `projectName`.

    AND THAT IS THE LIMIT WORTH STATING PLAINLY: on BOTH rows the same name is also carried by
    `projectName`, which this policy KEEPS on purpose because `coordinate_trusted_rows` consumes
    it. So on 411487 the erasure removes the name from the URLs while the identical value remains
    in a retained field on the same row. This layer closes "a DROPPED field's value reappearing
    elsewhere". It does not, and cannot, close "a RETAINED field's value appearing in a URL" —
    that is a deliberate policy position, not a gap in the implementation.

    HOW IT WAS FOUND, because that matters more than the fix: the residuals sweep's `--baseline`
    name layer, which compares pre- and post-sanitisation rows. Run WITHOUT that layer the same
    sweep reported 0 findings on the same file — the field layer saw the field was gone, and the
    shape layer hunts phone/e-mail patterns, not names. Two green layers, one real residual.

    Erasure is ROW-LOCAL and VALUE-DRIVEN: only this row's own identity values are erased from
    this row, so an unrelated string elsewhere that happens to share a token is left intact.
    """
    dropped = 0
    out_rows = []
    for row in rows:
        variants = set()
        for k in NINETYNINE_DROP:
            v = row.get(k)
            if isinstance(v, str) and len(v.strip()) >= 4:
                variants |= _identity_variants(v)
        for k in NINETYNINE_DROP:
            if k in row:
                del row[k]
                dropped += 1
        out_rows.append(_scrub(row, variants) if variants else row)
    return map_strings(out_rows, redact_contacts), dropped


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: sanitise_bengaluru.py <raw-in.json> <sanitised-out.json>")
    src, dst = sys.argv[1], sys.argv[2]

    assert_policy_matches_upstream()

    rows = json.load(open(src))
    before_fields = {k: sum(1 for r in rows if r.get(k) is not None) for k in NINETYNINE_DROP}
    before_shapes = count_shapes(rows)

    rows, dropped = sanitise(rows)

    after_fields = {k: sum(1 for r in rows if r.get(k) is not None) for k in NINETYNINE_DROP}
    after_shapes = count_shapes(rows)

    with open(dst, "w") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(json.dumps({
        "rows": len(rows),
        "identity_fields_before": before_fields,
        "identity_fields_after": after_fields,
        # KEY instances, not values: 5 keys x N rows counts keys present even where the value was
        # null. Reporting this as "PII values removed" would overstate it.
        "key_instances_dropped": dropped,
        "contact_shape_hits_before": before_shapes,
        "contact_shape_hits_after": after_shapes,
        "out": os.path.basename(dst),
    }, indent=2))

    residual = sum(after_fields.values()) + after_shapes
    if residual:
        print("SANITISE: FAIL — residual PII survived (counts above; values deliberately withheld)")
        return 1
    print("SANITISE: PASS (0 identity fields, 0 contact shapes remaining)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
