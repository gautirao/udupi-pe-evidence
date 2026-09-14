#!/usr/bin/env python3
"""Issue #2304 (PR review B3): the PII filter shared by sanitize_pii.py and pii_residuals.py.

DESIGN — value-shaped first, field-shaped second.

The first version of this filter was a field denylist plus one single-field, single-locale
regex, and it leaked five different ways: right pattern/wrong field (a mobile number parked in
`reraId`), right field/wrong locale (a Gulf number sitting beside a
correctly-redacted Indian one in the same sentence), right field/wrong encoding (a number spelled out as English words to defeat the
portal's own masking), an unmodelled class (personal names in free text), and a redacted field
whose sibling URL still carried the same person's name in its slug.

So the primary layer is now a KEY-AGNOSTIC recursive sweep over every string leaf in the
document. The structured field denylist is retained as a second layer, not the entry point.
`pii_residuals.py` re-runs the detectors after sanitisation and exits non-zero on any hit, so
the filter fails closed rather than depending on anyone having thought of the right field name.

NUMERIC BOUNDARY RULE. Digit runs must be delimited by non-alphanumerics. That is what makes it
safe to scan URLs like every other string instead of exempting them: across the 942 distinct
http strings in this dataset (679 of them image/PDF URLs), 71 contain a 10-digit digit sequence,
and every one of those is a SUBSTRING of a longer hex CDN hash or numeric id rather than a
delimited run of its own. Under the boundary rule all 71 produce zero matches, while a real
number in a URL slug would still be caught.

Measured, not assumed — and re-measured in review of PR #2587, which corrected this paragraph:
it previously cited 939 URLs and 8 bare runs, and neither figure reproduced under any definition
of "URL" (the delimited-run count is 0, not 8). The CONCLUSION was and remains exactly right;
the two supporting numbers were not, which is the kind of detail a later reader would have
trusted without re-deriving.
"""
import re

# --- detector 1: e-mail -------------------------------------------------------------------
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")

# --- detector 2: telephone numbers, any locale --------------------------------------------
# Candidate = a digit run that may carry +, spaces, dashes, dots and parens, delimited by
# non-alphanumerics; accepted as a phone number when it normalises to 9-15 digits (E.164 allows
# up to 15). Deliberately NOT anchored to the Indian [6-9] prefix — assuming that prefix is
# exactly how a Gulf number survived the previous pass.
PHONE_CAND_RE = re.compile(r"(?<![0-9A-Za-z])\+?\d[\d\s\-().]{5,20}\d(?![0-9A-Za-z])")
PHONE_MIN_DIGITS, PHONE_MAX_DIGITS = 9, 15

# A plain decimal is a measurement, never a phone number. Without this, every geo coordinate in
# the dataset ("13.3876323", "74.7389702") reads as an 11-digit number.
DECIMAL_RE = re.compile(r"^\d+\.\d+$")


def _is_phone(raw):
    """Decide whether a digit-run candidate is a telephone number.

    The rule is deliberately asymmetric, because the cost of the two error modes differs:

    * WITH phone-ish evidence — a leading `+` country code, or internal separators grouping the
      digits — accept 9-15 digits. Catches international "+<cc> nn nnn nnnn" forms and
      space-separated local ones.
    * BARE, unseparated digits — accept only an exact 10-digit Indian mobile (leading 6-9) with
      fewer than four trailing zeros. This is what catches a mobile parked in `reraId` while
      rejecting `price_paise` magnitudes, which are the same shape but never phone numbers.
    """
    # Any decimal component means this is a measurement or an arithmetic expression, not a
    # number. Catches both a bare coordinate ("13.3876323") and the shapes that read as one
    # candidate across a separator: a coordinate RANGE ("13.310-13.318") and the bbox arithmetic
    # in these very scripts ("13.3876323 - 0.012"). Phone numbers do not carry decimal points.
    if any(DECIMAL_RE.match(tok) for tok in re.split(r"[\s\-()]+", raw.strip()) if tok):
        return False
    digits = re.sub(r"\D", "", raw)
    if not PHONE_MIN_DIGITS <= len(digits) <= PHONE_MAX_DIGITS:
        return False
    if raw.lstrip().startswith("+"):
        return True
    # Separator evidence only counts when the separators GROUP the number the way a dialled
    # number is grouped: two or more runs, none of them a lone digit. Without the group-size
    # floor, a URL slug like "<8-digit-listing-id>-3-bhk-..." reads as a 9-digit phone number —
    # which is not hypothetical: an earlier revision of this filter corrupted two real
    # housing.com resale URLs that way.
    groups = [g for g in re.split(r"[\s\-().]+", raw.strip()) if g]
    if len(groups) >= 2 and all(len(g) >= 2 for g in groups):
        return True
    if len(groups) > 1:
        return False

    # BARE, UNSEPARATED RUNS. An Indian mobile is routinely written three ways with no
    # separators at all: the bare 10 digits, STD-prefixed as 0 + 10, and country-coded as
    # 91 + 10 without a leading `+`. Only the first was accepted before this revision, so a
    # number in either of the other two forms was invisible to every layer of the gate —
    # confirmed by probing this module directly, not inferred from reading it.
    if len(digits) == 11 and digits[0] == "0":
        digits = digits[1:]
    elif len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]

    # The trailing-zeros exclusion and the group-size floor above are deliberate and KEPT.
    # A 10-digit price_paise value with a 6-9 lead is the same shape as a mobile and those are
    # common in this dataset, while a real mobile ending 0000 is not; the floor is what stopped
    # an earlier revision corrupting real housing.com URL slugs. Both trade a rare false
    # negative for a common false positive, which is the right way round for a filter whose
    # output is committed data.
    return len(digits) == 10 and digits[0] in "6789" and not digits.endswith("0000")

# --- detector 3: numbers spelled out as words ---------------------------------------------
# A mobile written out one word per digit. Sellers do this precisely because portals mask
# numeric strings. Seven or more consecutive number-words is not prose.
_DIGIT_WORDS = "zero|one|two|three|four|five|six|seven|eight|nine|oh|double|triple"
DIGIT_WORD_RE = re.compile(
    rf"(?<![A-Za-z])(?:(?:{_DIGIT_WORDS})[\s\-,.]+){{6,}}(?:{_DIGIT_WORDS})(?![A-Za-z])",
    re.IGNORECASE,
)

PHONE_TOKEN = "[redacted-phone]"
EMAIL_TOKEN = "[redacted-email]"
NAME_TOKEN = "[redacted-name]"


# Synthetic addresses this import creates itself. Not PII; must not make the gate cry wolf.
# testdealer@example.com arrived with #2309 as the seed listings' owner. example.com is an
# IANA-reserved documentation domain, so it can never route to a real person.
EMAIL_ALLOWLIST = {
    "housing-import-udupi@seed.local",
    "housing-import@seed.local",
    "testdealer@example.com",
}


def _redact_phone_candidates(s):
    out, last = [], 0
    for m in PHONE_CAND_RE.finditer(s):
        if _is_phone(m.group()):
            out.append(s[last:m.start()])
            out.append(PHONE_TOKEN)
            last = m.end()
    out.append(s[last:])
    return "".join(out)


def redact_contacts(s):
    """Apply all three shape detectors to one string leaf. Key-agnostic by design."""
    s = EMAIL_RE.sub(lambda m: m.group() if m.group() in EMAIL_ALLOWLIST else EMAIL_TOKEN, s)
    s = DIGIT_WORD_RE.sub(PHONE_TOKEN, s)
    return _redact_phone_candidates(s)


def find_contacts(s, bare_digits=True):
    """Detector-only counterpart of redact_contacts, for the fail-closed residuals sweep.

    `bare_digits=False` drops the unseparated 10-digit rule. Used ONLY for the GENERATED text
    artefacts (.sql/.md) — hand-written .py/.sh sources are swept with the full rule, because a
    bare mobile pasted into a docstring is exactly the leak this module's history records.
    In the generated artefacts bare large integers are ordinary content — price_paise
    columns, geo coordinates, row counts. Those files are a pure function of the JSON (proved
    separately by the generator-determinism check), and the JSON is swept with the full rule, so
    coverage is not reduced: a phone number could only reach the SQL by first being in a JSON
    string leaf, where it IS caught.
    """
    hits = [e for e in EMAIL_RE.findall(s) if e not in EMAIL_ALLOWLIST]
    hits += [m.group() for m in DIGIT_WORD_RE.finditer(s)]
    for m in PHONE_CAND_RE.finditer(s):
        raw = m.group()
        if not _is_phone(raw):
            continue
        if not bare_digits and not (raw.lstrip().startswith("+") or re.search(r"\d[\s\-().]+\d", raw)):
            continue
        hits.append(raw)
    return hits


# --- detector 4: known identity names, incl. their URL-slug forms -------------------------
def name_variants(name):
    """Every spelling of a person/company name that appears in this dataset.

    Housing.com embeds the developer's name in URL slugs two ways: hyphenated in page URLs
    (`...-by-<developer-slug>-in-<locality>`) and underscored in CDN image filenames
    (`...-<locality>-<developer_slug>.jpeg`). Redacting `developer.name` while leaving those in place
    is what made the previous `{"redacted": ...}` marker theatre.
    """
    n = name.strip()
    if len(n) < 5:
        return set()
    low = n.lower()
    return {
        v for v in (
            n,
            low,
            re.sub(r"[^a-z0-9]+", "-", low).strip("-"),
            re.sub(r"[^a-z0-9]+", "_", low).strip("_"),
        ) if len(v) >= 5
    }


def redact_names(s, variants):
    for v in sorted(variants, key=len, reverse=True):
        if v.lower() in s.lower():
            s = re.compile(re.escape(v), re.IGNORECASE).sub(NAME_TOKEN, s)
    return s


def find_names(s, variants):
    return [v for v in variants if v.lower() in s.lower()]


# --- recursive, key-agnostic traversal ----------------------------------------------------
def map_strings(obj, fn):
    if isinstance(obj, dict):
        return {k: map_strings(v, fn) for k, v in obj.items()}
    if isinstance(obj, list):
        return [map_strings(v, fn) for v in obj]
    if isinstance(obj, str):
        return fn(obj)
    return obj


def walk_strings(obj, path=""):
    """Yield (path, string) for EVERY string leaf — the sweep the residuals check runs on."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from walk_strings(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk_strings(v, f"{path}[{i}]")
    elif isinstance(obj, str):
        yield path, obj
