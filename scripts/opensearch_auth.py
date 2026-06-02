"""
Shared OpenSearch client factory with auth support.

Auth precedence (highest to lowest):
  1. OPENSEARCH_API_KEY  — API key header auth
  2. OPENSEARCH_USERNAME + OPENSEARCH_PASSWORD (both non-empty) — Basic auth
  3. Unauthenticated — local dev / no credentials configured

Credentials are NEVER logged or included in exception messages.

API key auth uses the standard OpenSearch Authorization header:
  Authorization: ApiKey <OPENSEARCH_API_KEY value>

The OPENSEARCH_API_KEY env var must contain the raw key value exactly as
issued by OpenSearch (a base64-encoded id:secret pair, or a plain API key
string — whatever the cluster expects in the Authorization header).
"""

import os
import urllib.parse

from opensearchpy import OpenSearch


def build_opensearch_client(url: str) -> OpenSearch:
    """Build an authenticated OpenSearch client from a base URL.

    Reads auth configuration from environment variables:

      OPENSEARCH_API_KEY   — API key value (takes precedence when set)
      OPENSEARCH_USERNAME  — Basic-auth username
      OPENSEARCH_PASSWORD  — Basic-auth password (both must be non-empty for
                             Basic auth to activate; empty password falls back
                             to unauthenticated)

    Credentials are never logged or included in exception messages.

    Args:
        url: Base OpenSearch URL, e.g. "http://localhost:9200" or
             "https://my-cluster.onrender.com".

    Returns:
        A configured OpenSearch client instance.

    Raises:
        ConnectionError: If the client cannot be constructed (sanitized
                         message — no credential values included).
    """
    parsed = urllib.parse.urlparse(url)
    hosts = [{"host": parsed.hostname, "port": parsed.port or 9200}]
    scheme = parsed.scheme or "http"
    use_ssl = scheme == "https"

    api_key = os.environ.get("OPENSEARCH_API_KEY", "").strip()
    username = os.environ.get("OPENSEARCH_USERNAME", "").strip()
    password = os.environ.get("OPENSEARCH_PASSWORD", "").strip()

    try:
        if api_key:
            # API key auth: standard OpenSearch Authorization header.
            # The key value is used verbatim in the header — the caller is
            # responsible for providing the correctly formatted value.
            print("opensearch_auth: using API key auth")  # log method only, never value
            return OpenSearch(
                hosts=hosts,
                http_compress=True,
                use_ssl=use_ssl,
                headers={"Authorization": f"ApiKey {api_key}"},
            )
        elif username and password:
            # Basic auth: both username and password must be non-empty.
            print("opensearch_auth: using Basic auth")  # log method only, never credentials
            return OpenSearch(
                hosts=hosts,
                http_compress=True,
                use_ssl=use_ssl,
                http_auth=(username, password),
            )
        else:
            # Unauthenticated fallback — for local dev or when no credentials
            # are configured.  Empty password with a username set is treated
            # as unauthenticated (not as Basic auth with an empty password,
            # which would be rejected by most clusters).
            print("opensearch_auth: using unauthenticated connection")
            return OpenSearch(
                hosts=hosts,
                http_compress=True,
                use_ssl=use_ssl,
            )
    except Exception:
        # Sanitized error: hostname/port only — no credential values.
        # `from None` suppresses __context__ chaining so the original exception
        # (which may contain credential values) is not exposed by logging frameworks.
        raise ConnectionError(
            f"Failed to build OpenSearch client for host "
            f"{parsed.hostname}:{parsed.port or 9200}"
        ) from None
