#!/usr/bin/env python3
"""#2575 — generate DISCRIMINATING canaries from an uncommitted pre-sanitisation baseline.

TWO FAILURES ARE ENCODED HERE, both mine, both caught by the gate rather than by reading.

1. LENGTH IS NOT DISTINCTIVENESS. The first generator took any denylist value with `len >= 4`,
   which selected the bare word "Name": it matched 17 of 25 files, produced 17 false findings and
   buried the one real finding in the same report. The tempting repair — a bigger number plus a
   stoplist — is the SAME MISTAKE WITH A BIGGER NUMBER, because it estimates distinctiveness
   instead of checking it. So distinctiveness is CHECKED AGAINST THE CORPUS: a candidate is kept
   only if it appears nowhere in the hand-written files (.py/.md/.sh) of the swept tree. Those are
   not derived from the capture, so any occurrence there is ordinary language. Generated artefacts
   (.json/.sql) are deliberately NOT part of the exclusion test — a hit there is the leak the
   canary exists to detect.

2. A MULTI-LINE VALUE DESTROYS A NEWLINE-SEPARATED FILE. The corpus test passed and the run still
   produced 32 bogus findings, because `description` values contain embedded newlines: 173 values
   became 534 lines, and each fragment ("For sale", "3700", "Commercial property") became its own
   canary matching most of the tree. The rule was sound; the SERIALISATION silently broke it, and
   the only reason it surfaced is that `pii_residuals.py`'s canary-quality guard exited 2 instead
   of reporting the fragments as residuals.

   Fixed twice over: `description` is no longer harvested at all — it is free prose, not an
   identity literal, and a sentence is never a good canary — and any candidate containing a
   newline is rejected outright, so the file format cannot be violated by construction.

Values are never printed. Output is uncommitted, mode 0600.

Usage: gen-canaries.py <baseline-dir> <swept-dir> <out-file>
"""
import json
import os
import sys

# `description` is DELIBERATELY ABSENT: free prose, not an identity literal. See failure 2 above.
IDENTITY_FIELDS = ("dealerName", "companyName", "builderName", "reraId")
HANDWRITTEN = (".py", ".md", ".sh")


def main():
    if len(sys.argv) != 4:
        raise SystemExit("usage: gen-canaries.py <baseline-dir> <swept-dir> <out-file>")
    baseline_dir, swept_dir, out = sys.argv[1], sys.argv[2], sys.argv[3]

    candidates, dropped_multiline = set(), 0
    for fn in sorted(os.listdir(baseline_dir)):
        if not fn.endswith(".json"):
            continue
        try:
            rows = json.load(open(os.path.join(baseline_dir, fn)))
        except (ValueError, OSError):
            continue
        if not isinstance(rows, list):
            continue
        for r in rows:
            if not isinstance(r, dict):
                continue
            for k in IDENTITY_FIELDS:
                v = r.get(k)
                if not isinstance(v, str):
                    continue
                s = v.strip()
                if len(s) < 4:
                    continue
                if "\n" in s or "\r" in s:
                    dropped_multiline += 1   # would shred the newline-separated file
                    continue
                candidates.add(s)

    corpus = []
    for fn in sorted(os.listdir(swept_dir)):
        if fn.endswith(HANDWRITTEN):
            p = os.path.join(swept_dir, fn)
            if os.path.isfile(p):
                corpus.append(open(p, errors="replace").read().lower())
    corpus_text = "\n".join(corpus)

    kept, rejected_corpus = set(), 0
    for c in candidates:
        if c.lower() in corpus_text:
            rejected_corpus += 1
            continue
        kept.add(c)

    with open(out, "w") as f:
        for c in sorted(kept):
            f.write(c + "\n")
    os.chmod(out, 0o600)

    # SELF-CHECK: the file must contain exactly as many lines as canaries kept. This is the
    # assertion whose absence let 173 values become 534 lines.
    lines = [l for l in open(out).read().splitlines() if l.strip()]
    if len(lines) != len(kept):
        raise SystemExit(
            f"FAIL: wrote {len(kept)} canaries but the file has {len(lines)} lines — a value "
            f"contained a separator and the list is corrupt.")

    # COUNTS ONLY. A rejected candidate is still a real captured value.
    print(f"candidates harvested        : {len(candidates)}")
    print(f"dropped, multi-line         : {dropped_multiline}")
    print(f"rejected by corpus test     : {rejected_corpus}   (occur in .py/.md/.sh)")
    print(f"canaries kept               : {len(kept)}")
    print(f"file lines == canaries kept : {len(lines) == len(kept)}")
    if not kept:
        raise SystemExit("FAIL: every candidate collided with the corpus — no usable canary")
    return 0


if __name__ == "__main__":
    sys.exit(main())
