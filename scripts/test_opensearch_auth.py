"""
Unit tests for scripts/opensearch_auth.py — 6 required tests (AC9).

All tests run without a live OpenSearch cluster (OpenSearch constructor is
mocked via unittest.mock.patch).

Run with:
    python3 -m pytest scripts/test_opensearch_auth.py -v
"""

import os
import sys
import unittest
from unittest.mock import MagicMock, call, patch

# Ensure the scripts directory is on sys.path so opensearch_auth is importable
# whether pytest is run from the project root or the scripts/ directory.
_SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

import opensearch_auth  # noqa: E402 — must come after sys.path setup


BASE_URL = "http://localhost:9200"
HTTPS_URL = "https://my-cluster.onrender.com"


class TestBuildOpensearchClient(unittest.TestCase):
    """Tests for build_opensearch_client() in opensearch_auth.py."""

    def _clean_env(self, env: dict) -> dict:
        """Return a copy of env with OpenSearch auth vars cleared."""
        base = {
            "OPENSEARCH_API_KEY": "",
            "OPENSEARCH_USERNAME": "",
            "OPENSEARCH_PASSWORD": "",
        }
        base.update(env)
        return base

    # ------------------------------------------------------------------
    # AC9 test 1: unauthenticated when no env vars are set
    # ------------------------------------------------------------------
    def test_unauthenticated_client(self):
        """No env vars → OpenSearch() called without http_auth or auth headers."""
        # Patch the name as it is bound inside opensearch_auth (from opensearchpy import OpenSearch)
        with patch("opensearch_auth.OpenSearch") as mock_cls, \
             patch.dict(os.environ, self._clean_env({}), clear=False):
            mock_cls.return_value = MagicMock()
            opensearch_auth.build_opensearch_client(BASE_URL)

        args, kwargs = mock_cls.call_args
        self.assertNotIn("http_auth", kwargs)
        # headers may be absent entirely, or present but without Authorization
        headers = kwargs.get("headers", {})
        self.assertNotIn("Authorization", headers)

    # ------------------------------------------------------------------
    # AC9 test 2: Basic auth when USERNAME and PASSWORD both non-empty
    # ------------------------------------------------------------------
    def test_basic_auth_client(self):
        """USERNAME + PASSWORD → http_auth=(user, pass) passed to OpenSearch()."""
        env = self._clean_env({
            "OPENSEARCH_USERNAME": "admin",
            "OPENSEARCH_PASSWORD": "s3cr3t",
        })
        with patch("opensearch_auth.OpenSearch") as mock_cls, \
             patch.dict(os.environ, env, clear=False):
            mock_cls.return_value = MagicMock()
            opensearch_auth.build_opensearch_client(BASE_URL)

        args, kwargs = mock_cls.call_args
        self.assertEqual(kwargs.get("http_auth"), ("admin", "s3cr3t"))

    # ------------------------------------------------------------------
    # AC9 test 3: API key auth when OPENSEARCH_API_KEY is set
    # ------------------------------------------------------------------
    def test_api_key_client(self):
        """OPENSEARCH_API_KEY → Authorization: ApiKey header passed to OpenSearch()."""
        env = self._clean_env({"OPENSEARCH_API_KEY": "myapikey123"})
        with patch("opensearch_auth.OpenSearch") as mock_cls, \
             patch.dict(os.environ, env, clear=False):
            mock_cls.return_value = MagicMock()
            opensearch_auth.build_opensearch_client(BASE_URL)

        args, kwargs = mock_cls.call_args
        headers = kwargs.get("headers", {})
        self.assertIn("Authorization", headers)
        self.assertEqual(headers["Authorization"], "ApiKey myapikey123")
        # http_auth must NOT be set when using API key
        self.assertNotIn("http_auth", kwargs)

    # ------------------------------------------------------------------
    # AC9 test 4: API key takes precedence over Basic when both set
    # ------------------------------------------------------------------
    def test_api_key_precedence(self):
        """API_KEY + USERNAME + PASSWORD → API key wins (no http_auth used)."""
        env = self._clean_env({
            "OPENSEARCH_API_KEY": "keywinns",
            "OPENSEARCH_USERNAME": "admin",
            "OPENSEARCH_PASSWORD": "s3cr3t",
        })
        with patch("opensearch_auth.OpenSearch") as mock_cls, \
             patch.dict(os.environ, env, clear=False):
            mock_cls.return_value = MagicMock()
            opensearch_auth.build_opensearch_client(BASE_URL)

        args, kwargs = mock_cls.call_args
        headers = kwargs.get("headers", {})
        self.assertIn("Authorization", headers)
        self.assertEqual(headers["Authorization"], "ApiKey keywinns")
        self.assertNotIn("http_auth", kwargs)

    # ------------------------------------------------------------------
    # AC9 test 5: empty password falls back to unauthenticated
    # ------------------------------------------------------------------
    def test_basic_auth_empty_password_fallback(self):
        """USERNAME set but PASSWORD empty/unset → unauthenticated (not Basic auth)."""
        env = self._clean_env({
            "OPENSEARCH_USERNAME": "admin",
            "OPENSEARCH_PASSWORD": "",
        })
        with patch("opensearch_auth.OpenSearch") as mock_cls, \
             patch.dict(os.environ, env, clear=False):
            mock_cls.return_value = MagicMock()
            opensearch_auth.build_opensearch_client(BASE_URL)

        args, kwargs = mock_cls.call_args
        self.assertNotIn("http_auth", kwargs)
        headers = kwargs.get("headers", {})
        self.assertNotIn("Authorization", headers)

    # ------------------------------------------------------------------
    # AC9 test 6 + AC5/AC8: exception message MUST NOT leak credentials
    # ------------------------------------------------------------------
    def test_auth_failure_no_credential_leak(self):
        """ConnectionError raised when OpenSearch() raises; message must not contain credentials."""
        secret_api_key = "supersecretapikey"
        secret_password = "supersecretpassword"
        env = self._clean_env({
            "OPENSEARCH_API_KEY": secret_api_key,
            "OPENSEARCH_USERNAME": "admin",
            "OPENSEARCH_PASSWORD": secret_password,
        })
        with patch("opensearch_auth.OpenSearch") as mock_cls, \
             patch.dict(os.environ, env, clear=False):
            mock_cls.side_effect = Exception(
                f"connection refused with key={secret_api_key} pw={secret_password}"
            )
            with self.assertRaises(ConnectionError) as ctx:
                opensearch_auth.build_opensearch_client(BASE_URL)

        error_msg = str(ctx.exception)
        self.assertNotIn(secret_api_key, error_msg,
                         "API key value must NOT appear in the exception message")
        self.assertNotIn(secret_password, error_msg,
                         "Password value must NOT appear in the exception message")
        # Sanity: message should at least identify the host
        self.assertIn("localhost", error_msg)

    # ------------------------------------------------------------------
    # Advisory test: HTTPS URL sets use_ssl=True
    # ------------------------------------------------------------------
    def test_https_url_sets_use_ssl(self):
        """HTTPS URL → use_ssl=True passed to OpenSearch()."""
        with patch("opensearch_auth.OpenSearch") as mock_cls, \
             patch.dict(os.environ, self._clean_env({}), clear=False):
            mock_cls.return_value = MagicMock()
            opensearch_auth.build_opensearch_client(HTTPS_URL)

        args, kwargs = mock_cls.call_args
        self.assertTrue(kwargs.get("use_ssl"), "HTTPS URL must set use_ssl=True")


if __name__ == "__main__":
    unittest.main()
