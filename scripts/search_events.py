#!/usr/bin/env python3
"""
search_events.py — shared module for the incremental OpenSearch indexing pipeline.
Issue #1312 — LOCAL/DEV prototype.

Provides:
  - EventType enum (7 listing lifecycle event types)
  - Operation enum (INDEX | DELETE)
  - PipelineCounters dataclass
  - DOCUMENT_WHITELIST: 18-field public whitelist for indexed documents
  - Kafka safety gate: _check_kafka_safety_gate(bootstrap_servers)
  - DB safety gate: _check_db_safety_gate(db_url)
  - Helpers imported from opensearch_rebuild: _is_safe_url, _safe_db_url_display,
    _build_opensearch_client, _row_to_doc
  - compute_operation: SINGLE SOURCE OF TRUTH for visibility rule
  - compute_version: deterministic version from source_updated_at / occurred_at

VISIBILITY INVARIANT (data-integrity — never relax):
  operation = INDEX  iff  status == 'LIVE'
  operation = DELETE for ALL other statuses (DRAFT/PENDING/REJECTED/ARCHIVED/UNPUBLISHED/(deleted))

The consumer RECOMPUTES operation from status — it NEVER trusts the producer's operation field.
"""

from __future__ import annotations

import os
import sys
import urllib.parse
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

# ---------------------------------------------------------------------------
# Re-export helpers from opensearch_rebuild so the pipeline scripts share
# the exact same implementations. opensearch_rebuild.py is NOT modified.
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from scripts.opensearch_rebuild import (  # noqa: E402
    _build_opensearch_client,
    _is_safe_url,
    _row_to_doc,
    _safe_db_url_display,
)

__all__ = [
    "EventType",
    "Operation",
    "PipelineCounters",
    "DOCUMENT_WHITELIST",
    "_check_kafka_safety_gate",
    "_check_db_safety_gate",
    "_is_safe_url",
    "_safe_db_url_display",
    "_build_opensearch_client",
    "_row_to_doc",
    "compute_operation",
    "compute_version",
    "TOPIC",
    "DLQ_TOPIC",
    "DEDICATED_INDEX_DEFAULT",
    "FORBIDDEN_REBUILD_ALIAS",
    "FORBIDDEN_REBUILD_PREFIX",
    "PII_FORBIDDEN_KEYS",
]

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TOPIC = "listing.search.events"
DLQ_TOPIC = "listing.search.events.dlq"

# Dedicated prototype index — consumer writes here; NEVER to the full-rebuild alias.
DEDICATED_INDEX_DEFAULT = "listings_incremental_v1"

# Index names the consumer must REFUSE to write to (protects full-rebuild POC).
FORBIDDEN_REBUILD_ALIAS = "listings_read"
FORBIDDEN_REBUILD_PREFIX = "listings_v"

# PII / admin keys that must NEVER appear in any indexed document.
PII_FORBIDDEN_KEYS = frozenset(
    ["user_id", "seller_id", "phone", "email", "supabase_user_id", "rejectionReason"]
)

# 18-field public WHITELIST — the ONLY fields allowed in an indexed document's _source.
# Mirrors opensearch_rebuild.py _row_to_doc exactly (city_slug and hero_image_url
# may be absent when None, but are still whitelisted).
# Consumer applies this as a WHITELIST (allow-list), not a denylist, so any
# unrecognised field (renamed PII column, owner_notes, internal_score, etc.) is
# silently excluded rather than leaked.
DOCUMENT_WHITELIST: frozenset[str] = frozenset([
    "id",
    "title",
    "locality",
    "description",
    "area_key",
    "city_slug",
    "property_type",
    "seller_type",
    "bedrooms",
    "bathrooms",
    "price_paise",
    "latitude",
    "longitude",
    "location",       # geo_point: {"lat": float, "lon": float}
    "status",
    "created_at",
    "hero_image_url",
])

# Kafka localhost allowlist — exact host match (case-insensitive), NOT substring.
# 'redpanda' and 'kafka' are permitted docker-compose service hostnames.
_KAFKA_ALLOWED_HOSTS = frozenset(
    ["localhost", "127.0.0.1", "::1", "redpanda", "kafka"]
)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class EventType(str, Enum):
    LISTING_CREATED = "LISTING_CREATED"
    LISTING_APPROVED = "LISTING_APPROVED"
    LISTING_UPDATED = "LISTING_UPDATED"
    LISTING_UNPUBLISHED = "LISTING_UNPUBLISHED"
    LISTING_REJECTED = "LISTING_REJECTED"
    LISTING_ARCHIVED = "LISTING_ARCHIVED"
    LISTING_DELETED = "LISTING_DELETED"


class Operation(str, Enum):
    INDEX = "INDEX"
    DELETE = "DELETE"


# ---------------------------------------------------------------------------
# Counters
# ---------------------------------------------------------------------------


@dataclass
class PipelineCounters:
    indexed: int = 0
    # updated: placeholder for future create-vs-update distinction.
    # Distinguishing requires a DB lookup (was the doc present before this INDEX?),
    # which is out of scope for the stateless prototype consumer. Tracked as a
    # separate counter so future callers can increment it; currently always 0.
    updated: int = 0
    deleted: int = 0
    skipped: int = 0   # version-conflict 409 + delete-404
    failures: int = 0  # terminal errors routed to DLQ

    # Lag tracking (milliseconds)
    _lag_samples: list[float] = field(default_factory=list, repr=False)

    def record_lag(self, occurred_at: datetime | None, processed_at: datetime | None) -> None:
        """Record pipeline latency (processed_at − occurred_at) in milliseconds."""
        if occurred_at is None or processed_at is None:
            return
        # Ensure both are timezone-aware before subtraction
        if occurred_at.tzinfo is None:
            occurred_at = occurred_at.replace(tzinfo=timezone.utc)
        if processed_at.tzinfo is None:
            processed_at = processed_at.replace(tzinfo=timezone.utc)
        lag_ms = (processed_at - occurred_at).total_seconds() * 1000
        self._lag_samples.append(lag_ms)

    def lag_stats(self) -> dict[str, float]:
        """Return p50/p95/max lag in ms; empty dict if no samples."""
        if not self._lag_samples:
            return {}
        sorted_samples = sorted(self._lag_samples)
        n = len(sorted_samples)
        p50 = sorted_samples[int(n * 0.50)]
        p95 = sorted_samples[min(int(n * 0.95), n - 1)]
        return {"p50_ms": p50, "p95_ms": p95, "max_ms": sorted_samples[-1]}

    def total_processed(self) -> int:
        return self.indexed + self.updated + self.deleted + self.skipped + self.failures

    def print_summary(self) -> None:
        """Print a structured run summary (mirrors opensearch_rebuild.py style)."""
        print(
            f"\nPipeline summary: "
            f"indexed={self.indexed} updated={self.updated} deleted={self.deleted} "
            f"skipped={self.skipped} failures={self.failures} "
            f"total_processed={self.total_processed()}"
        )
        lag = self.lag_stats()
        if lag:
            print(
                f"Lag (processed_at − occurred_at): "
                f"p50={lag['p50_ms']:.1f}ms  "
                f"p95={lag['p95_ms']:.1f}ms  "
                f"max={lag['max_ms']:.1f}ms"
            )


# ---------------------------------------------------------------------------
# Visibility rule — SINGLE SOURCE OF TRUTH
# ---------------------------------------------------------------------------


def compute_operation(status: str | None) -> Operation:
    """
    Compute the OpenSearch operation from the listing's status field.

    VISIBILITY INVARIANT: operation=INDEX iff status=='LIVE', else DELETE.
    This is the authoritative derivation. Callers (consumer) MUST call this
    and MUST NOT use the producer's operation field directly.
    """
    if status == "LIVE":
        return Operation.INDEX
    return Operation.DELETE


# ---------------------------------------------------------------------------
# Version derivation — for external_gte idempotency
# ---------------------------------------------------------------------------


def compute_version(
    source_updated_at: datetime | None,
    occurred_at: datetime | None,
) -> int:
    """
    Compute the external version integer for OpenSearch version_type='external_gte'.

    version = epoch_millis(source_updated_at)
    Fallback: epoch_millis(occurred_at) when source_updated_at is None.

    Both INDEX and DELETE must use this same version derivation so OpenSearch
    can correctly order mutations and enforce the versioned tombstone.
    """
    ts = source_updated_at if source_updated_at is not None else occurred_at
    if ts is None:
        # Absolute last resort — use current time (should not happen in practice)
        ts = datetime.now(timezone.utc)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return int(ts.timestamp() * 1000)


# ---------------------------------------------------------------------------
# Database safety gate
# ---------------------------------------------------------------------------


def _check_db_safety_gate(db_url: str | None) -> None:
    """
    Abort with EnvironmentError if DATABASE_URL points outside localhost.

    Mirrors opensearch_rebuild.py _check_safety_gates posture for DATABASE_URL.
    Must be called before any psycopg2.connect().

    Fail-closed: empty or unset db_url raises.
    """
    if not db_url or not db_url.strip():
        raise EnvironmentError(
            "DATABASE_URL is not set or empty. "
            "Set it to a local/dev Postgres instance before running."
        )
    if not _is_safe_url(db_url):
        raise EnvironmentError(
            f"DATABASE_URL '{_safe_db_url_display(db_url)}' does not appear to be a "
            "local/dev instance. This script is LOCAL/DEV ONLY."
        )


# ---------------------------------------------------------------------------
# Kafka safety gate
# ---------------------------------------------------------------------------


def _check_kafka_safety_gate(bootstrap_servers: str | None) -> None:
    """
    Validate KAFKA_BOOTSTRAP_SERVERS before any Kafka client is constructed.

    Parses each comma-separated host:port entry and requires EVERY host to be
    in the localhost allowlist (exact match, case-insensitive):
      { localhost, 127.0.0.1, ::1, redpanda, kafka }

    Raises EnvironmentError (with offending host echoed — never a credential)
    and the caller must exit non-zero BEFORE constructing any Kafka client.

    Fail-closed: empty or unset bootstrap_servers also raises.
    """
    if not bootstrap_servers or not bootstrap_servers.strip():
        raise EnvironmentError(
            "KAFKA_BOOTSTRAP_SERVERS is not set or empty. "
            "Set it to a local broker (e.g. localhost:9092) before running."
        )

    entries = [e.strip() for e in bootstrap_servers.split(",") if e.strip()]
    if not entries:
        raise EnvironmentError(
            "KAFKA_BOOTSTRAP_SERVERS contains no valid entries."
        )

    for entry in entries:
        host = _parse_kafka_host(entry)
        if host.lower() not in _KAFKA_ALLOWED_HOSTS:
            raise EnvironmentError(
                f"KAFKA_BOOTSTRAP_SERVERS entry host '{host}' is not in the localhost allowlist "
                f"{sorted(_KAFKA_ALLOWED_HOSTS)}. "
                "This script is LOCAL/DEV ONLY. "
                "Pass a local bootstrap address (e.g. localhost:9092 or redpanda:9092)."
            )


def _parse_kafka_host(entry: str) -> str:
    """
    Extract the host from a Kafka bootstrap entry.

    Handles:
      host:port          → host                    (e.g. localhost:9092 → localhost)
      [::1]:9092         → ::1                     (IPv6 bracketed — canonical form)
      hostname           → hostname                (no port present)
      ::1:9092           → ::1                     (bare IPv6 — rsplit on last ":")

    Bare unbracketed IPv6 (e.g. "::1:9092") is handled by rsplit(":",1), which
    produces left="::1" — the correct host for the allowlist check.  The
    bracketed form "[::1]:9092" is the IETF-canonical format and is preferred.
    The gate stays fail-closed: any unrecognised form that cannot be matched to
    an allowlist host will be rejected.
    """
    entry = entry.strip()
    # IPv6 bracketed: [::1]:9092 or [::1] (no port)
    if entry.startswith("["):
        close = entry.find("]")
        if close != -1:
            return entry[1:close]
    # host:port or bare IPv6 like ::1:9092 — split on last colon
    if ":" in entry:
        parts = entry.rsplit(":", 1)
        return parts[0]
    return entry


# ---------------------------------------------------------------------------
# Dedicated index validation
# ---------------------------------------------------------------------------


def validate_dedicated_index(index_name: str) -> None:
    """
    Raise ValueError if index_name would corrupt the full-rebuild POC.

    Rejects:
      - 'listings_read'  (full-rebuild alias)
      - 'listings_v*'    (full-rebuild versioned index pattern)
    """
    if index_name == FORBIDDEN_REBUILD_ALIAS:
        raise ValueError(
            f"OPENSEARCH_INDEX='{index_name}' is the full-rebuild alias. "
            "Use a dedicated prototype index (e.g. listings_incremental_v1)."
        )
    if index_name.startswith(FORBIDDEN_REBUILD_PREFIX):
        raise ValueError(
            f"OPENSEARCH_INDEX='{index_name}' matches the full-rebuild versioned "
            f"pattern '{FORBIDDEN_REBUILD_PREFIX}*'. "
            "Use a dedicated prototype index (e.g. listings_incremental_v1)."
        )
