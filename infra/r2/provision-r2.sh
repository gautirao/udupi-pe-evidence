#!/usr/bin/env bash
set -euo pipefail

# Provisioning script for Cloudflare R2 listing-images infrastructure
# Issue #2631 - PropertySignal Infrastructure

BUCKET_NAME="${R2_LISTING_IMAGE_BUCKET:-propertysignal-listing-images}"
CUSTOM_DOMAIN="${R2_CUSTOM_DOMAIN:-img.propertysignal.in}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORS_FILE="${SCRIPT_DIR}/cors.json"

echo "=== PropertySignal Cloudflare R2 Provisioning Helper ==="
echo "Bucket: ${BUCKET_NAME}"
echo "Custom Domain: ${CUSTOM_DOMAIN}"
echo "CORS File: ${CORS_FILE}"
echo ""

if ! command -v wrangler &> /dev/null; then
    echo "ERROR: 'wrangler' CLI is not installed or not available in PATH."
    echo "Please install wrangler (npm install -g wrangler) or perform provisioning via Cloudflare Dashboard."
    echo "Refer to docs/ops/r2-listing-images-infrastructure.md for manual provisioning steps."
    exit 1
fi

echo "[1/4] Creating R2 Bucket '${BUCKET_NAME}'..."
wrangler r2 bucket create "${BUCKET_NAME}" || echo "Bucket '${BUCKET_NAME}' may already exist."

echo "[2/4] Setting CORS Policy on '${BUCKET_NAME}'..."
wrangler r2 bucket cors set "${BUCKET_NAME}" --file "${CORS_FILE}"

echo "[3/4] Domain setup notes:"
echo "To attach custom domain '${CUSTOM_DOMAIN}', run:"
echo "  wrangler r2 bucket domain add ${BUCKET_NAME} ${CUSTOM_DOMAIN}"
echo "Or configure Custom Domains in Cloudflare R2 Dashboard under Bucket Settings."

echo "[4/4] Provisioning scaffold complete. Run smoke-test.sh to verify setup once DNS propagates."
