#!/usr/bin/env bash
# scripts/e2e/auth-stack/pull-images.sh - issue #2750
# Pulls every image in images.lock BY DIGEST (lines carrying @sha256). Used by CI before the gate and callable locally.
# A pull failure is a hard failure: the gate refuses to fall back to a tag.
set -euo pipefail
SD="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
n=0
while IFS= read -r line; do
  case "$line" in ''|'#'*) continue ;; esac
  case "$line" in *@sha256:*) ;; *) echo "pull-images: images.lock line is not digest-pinned: ${line%%[:@]*}" >&2; exit 1 ;; esac
  docker pull --quiet "$line" > /dev/null
  n=$((n + 1))
done < "$SD/images.lock"
[ "$n" -gt 0 ] || { echo "pull-images: images.lock lists no images" >&2; exit 1; }
echo "pull-images: pulled $n digest-pinned image(s)"
