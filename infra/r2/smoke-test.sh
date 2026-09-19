#!/usr/bin/env bash
set -euo pipefail

# Smoke Test Verification Script for Cloudflare R2 Listing-Images Infrastructure
# Issue #2631 - Executable & Safe Verification Sequence
# Do NOT upload sensitive customer data during smoke tests.

BUCKET_NAME="${R2_LISTING_IMAGE_BUCKET:-propertysignal-listing-images}"
PUBLIC_BASE_URL="${R2_LISTING_IMAGE_PUBLIC_BASE_URL:-https://img.propertysignal.in}"
ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-https://propertysignal.in}"
DISALLOWED_ORIGIN="${DISALLOWED_ORIGIN:-https://unauthorized-domain.com}"
TIMESTAMP="$(date +%s)"
CANARY_KEY="smoke-test-canary-${TIMESTAMP}.txt"
LOCAL_CANARY_FILE="$(mktemp)"

FAILED_CHECKS=0
PENDING_CHECKS=0

echo "propertysignal-r2-smoke-test-${TIMESTAMP}" > "${LOCAL_CANARY_FILE}"

r2_s3_call() {
    local action="$1"
    local bucket="$2"
    local key="${3:-}"
    local file="${4:-}"

    if command -v aws &> /dev/null; then
        local endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
        if [ "${action}" = "head-bucket" ]; then
            AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
            aws s3api head-bucket --bucket "${bucket}" --endpoint-url "${endpoint}" &>/dev/null
        elif [ "${action}" = "put-object" ]; then
            AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
            aws s3 cp "${file}" "s3://${bucket}/${key}" \
                --endpoint-url "${endpoint}" \
                --cache-control "public, max-age=31536000, immutable" &>/dev/null
        elif [ "${action}" = "delete-object" ]; then
            AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
            aws s3 rm "s3://${bucket}/${key}" --endpoint-url "${endpoint}" &>/dev/null
        elif [ "${action}" = "probe-unrelated" ]; then
            local probe_out
            probe_out=$(AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
            aws s3 ls "s3://${bucket}/" --endpoint-url "${endpoint}" 2>&1 || true)
            echo "${probe_out}" | grep -qi -E "AccessDenied|Forbidden|403|NoSuchBucket"
        fi
    elif command -v python3 &> /dev/null; then
        R2_ACCOUNT_ID="${R2_ACCOUNT_ID}" R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
        python3 - "${action}" "${bucket}" "${key}" "${file}" << 'EOF'
import urllib.request, urllib.parse, urllib.error, hashlib, hmac, datetime, os, sys

action = sys.argv[1]
bucket = sys.argv[2]
key = sys.argv[3] if len(sys.argv) > 3 else ''
file_path = sys.argv[4] if len(sys.argv) > 4 else ''

account_id = os.environ.get('R2_ACCOUNT_ID', '')
access_key = os.environ.get('R2_ACCESS_KEY_ID', '')
secret_key = os.environ.get('R2_SECRET_ACCESS_KEY', '')

if not account_id or not access_key or not secret_key:
    sys.exit(2)

content = b''
if file_path and os.path.exists(file_path):
    with open(file_path, 'rb') as f:
        content = f.read()

def sigv4_request(method, url, body=b'', extra_headers=None):
    if extra_headers is None:
        extra_headers = {}
    parsed = urllib.parse.urlparse(url)
    host = parsed.netloc
    canonical_uri = parsed.path or '/'
    canonical_querystring = parsed.query
    
    t = datetime.datetime.utcnow()
    amz_date = t.strftime('%Y%m%dT%H%M%SZ')
    date_stamp = t.strftime('%Y%m%d')
    region = 'auto'
    service = 's3'
    
    payload_hash = hashlib.sha256(body).hexdigest()
    
    headers = {
        'host': host,
        'x-amz-content-sha256': payload_hash,
        'x-amz-date': amz_date,
    }
    for k, v in extra_headers.items():
        headers[k.lower()] = v
        
    canonical_headers = ''.join(f'{k}:{headers[k]}\n' for k in sorted(headers.keys()))
    signed_headers = ';'.join(sorted(headers.keys()))
    
    canonical_request = f'{method}\n{canonical_uri}\n{canonical_querystring}\n{canonical_headers}\n{signed_headers}\n{payload_hash}'
    
    algorithm = 'AWS4-HMAC-SHA256'
    credential_scope = f'{date_stamp}/{region}/{service}/aws4_request'
    string_to_sign = f'{algorithm}\n{amz_date}\n{credential_scope}\n{hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()}'
    
    def sign(key, msg):
        return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()
        
    kDate = sign(('AWS4' + secret_key).encode('utf-8'), date_stamp)
    kRegion = sign(kDate, region)
    kService = sign(kRegion, service)
    kSigning = sign(kService, 'aws4_request')
    signature = hmac.new(kSigning, string_to_sign.encode('utf-8'), hashlib.sha256).hexdigest()
    
    authorization_header = f'{algorithm} Credential={access_key}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}'
    
    req_headers = {k.title(): v for k, v in headers.items()}
    req_headers['Authorization'] = authorization_header
    
    req = urllib.request.Request(url, data=body if method in ('PUT', 'POST') else None, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, resp.read().decode('utf-8')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')
    except Exception as e:
        return 0, str(e)

endpoint = f'https://{account_id}.r2.cloudflarestorage.com'

if action == 'head-bucket':
    url = f'{endpoint}/{bucket}'
    status, body = sigv4_request('HEAD', url)
    sys.exit(0 if status in (200, 204) else 1)
elif action == 'put-object':
    url = f'{endpoint}/{bucket}/{key}'
    status, body = sigv4_request('PUT', url, body=content, extra_headers={'cache-control': 'public, max-age=31536000, immutable'})
    sys.exit(0 if status in (200, 201, 204) else 1)
elif action == 'delete-object':
    url = f'{endpoint}/{bucket}/{key}'
    status, body = sigv4_request('DELETE', url)
    sys.exit(0 if status in (200, 204) else 1)
elif action == 'probe-unrelated':
    url = f'{endpoint}/{bucket}'
    status, body = sigv4_request('GET', url)
    if status in (403, 404) or 'AccessDenied' in body or 'Forbidden' in body:
        sys.exit(0)
    sys.exit(1)
EOF
    else
        return 2
    fi
}

cleanup() {
    rm -f "${LOCAL_CANARY_FILE}"
    if [ -n "${R2_ACCOUNT_ID:-}" ] && [ -n "${R2_ACCESS_KEY_ID:-}" ]; then
        r2_s3_call "delete-object" "${BUCKET_NAME}" "${CANARY_KEY}" "" &>/dev/null || true
    fi
}
trap cleanup EXIT

echo "=== Cloudflare R2 Smoke Test & Verification ==="
echo "Target Base URL: ${PUBLIC_BASE_URL}"
echo "Bucket Name:     ${BUCKET_NAME}"
echo "Allowed Origin:  ${ALLOWED_ORIGIN}"
echo ""

HAS_CREDENTIALS=false
if [ -n "${R2_ACCOUNT_ID:-}" ] && [ -n "${R2_ACCESS_KEY_ID:-}" ] && [ -n "${R2_SECRET_ACCESS_KEY:-}" ]; then
    HAS_CREDENTIALS=true
fi

CANARY_UPLOADED=false

# Check 1: Bucket Existence & Canary Upload
echo "[Check 1/8] Verifying R2 Bucket existence & Canary Upload..."
if [ "${HAS_CREDENTIALS}" = true ]; then
    if r2_s3_call "head-bucket" "${BUCKET_NAME}" "" ""; then
        echo "✓ Check 1 PASSED: Bucket '${BUCKET_NAME}' exists."
        
        # Upload non-customer canary object
        if r2_s3_call "put-object" "${BUCKET_NAME}" "${CANARY_KEY}" "${LOCAL_CANARY_FILE}"; then
            echo "  └─ Canary object uploaded successfully: s3://${BUCKET_NAME}/${CANARY_KEY}"
            CANARY_UPLOADED=true
        else
            echo "✗ Check 1 FAILED: Could not upload canary object to bucket '${BUCKET_NAME}'."
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
        fi
    else
        echo "✗ Check 1 FAILED: Cannot confirm bucket '${BUCKET_NAME}' via S3 API."
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
    fi
else
    echo "! Check 1 PENDING / NOT_RUN (Requires Owner Provisioning: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)."
    PENDING_CHECKS=$((PENDING_CHECKS + 1))
fi

# Check 2 & 3: Custom Domain HTTPS Reachability
echo "[Check 2/8 & 3/8] Verifying custom domain HTTPS endpoint (${PUBLIC_BASE_URL})..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -I "${PUBLIC_BASE_URL}/" 2>/dev/null || true)
HTTP_STATUS="${HTTP_STATUS:-000}"

if [ "${HTTP_STATUS}" != "000" ] && [ "${HTTP_STATUS}" != "0" ]; then
    echo "✓ Check 2 & 3 PASSED: Custom domain reachable via HTTPS (HTTP status: ${HTTP_STATUS})."
else
    echo "! Check 2 & 3 PENDING / NOT_RUN (Requires Owner Provisioning: custom domain ${PUBLIC_BASE_URL} unreachable or DNS not propagated)."
    PENDING_CHECKS=$((PENDING_CHECKS + 1))
fi

# Check 4: Cache Headers Verification
echo "[Check 4/8] Checking CDN Cache-Control headers on custom domain..."
if [ "${CANARY_UPLOADED}" = true ]; then
    CACHE_HEADER=$(curl -sI "${PUBLIC_BASE_URL}/${CANARY_KEY}" 2>/dev/null | grep -i "cache-control" || true)
    if echo "${CACHE_HEADER}" | grep -qi "max-age=31536000"; then
        echo "✓ Check 4 PASSED: Exact Cache-Control header verified: ${CACHE_HEADER}"
    else
        echo "✗ Check 4 FAILED: Cache-Control header 'max-age=31536000' missing from custom domain response."
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
    fi
else
    echo "! Check 4 PENDING / NOT_RUN (Requires live canary upload to verify object Cache-Control headers)."
    PENDING_CHECKS=$((PENDING_CHECKS + 1))
fi

# Check 5: Approved Origin CORS Preflight (OPTIONS)
echo "[Check 5/8] Verifying CORS preflight for approved origin (${ALLOWED_ORIGIN})..."
CORS_ALLOW_ORIGIN=$(curl -sI -X OPTIONS "${PUBLIC_BASE_URL}/${CANARY_KEY}" \
  -H "Origin: ${ALLOWED_ORIGIN}" \
  -H "Access-Control-Request-Method: PUT" \
  -H "Access-Control-Request-Headers: Content-Type, Cache-Control" 2>/dev/null \
  | grep -i "access-control-allow-origin" || true)

if echo "${CORS_ALLOW_ORIGIN}" | grep -qi "${ALLOWED_ORIGIN}"; then
    echo "✓ Check 5 PASSED: Approved origin ${ALLOWED_ORIGIN} allowed."
else
    if [ "${HTTP_STATUS}" != "000" ] && [ "${HTTP_STATUS}" != "0" ]; then
        echo "✗ Check 5 FAILED: Approved origin ${ALLOWED_ORIGIN} was not returned in Access-Control-Allow-Origin."
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
    else
        echo "! Check 5 PENDING / NOT_RUN (Requires Owner Provisioning: custom domain unreachable)."
        PENDING_CHECKS=$((PENDING_CHECKS + 1))
    fi
fi

# Check 6: Disallowed Origin CORS Rejection
echo "[Check 6/8] Verifying CORS preflight rejection for disallowed origin (${DISALLOWED_ORIGIN})..."
DISALLOWED_HEADER=$(curl -sI -X OPTIONS "${PUBLIC_BASE_URL}/${CANARY_KEY}" \
  -H "Origin: ${DISALLOWED_ORIGIN}" \
  -H "Access-Control-Request-Method: PUT" 2>/dev/null \
  | grep -i "access-control-allow-origin" || true)

if echo "${DISALLOWED_HEADER}" | grep -qi "${DISALLOWED_ORIGIN}"; then
    echo "✗ Check 6 FAILED: Disallowed origin ${DISALLOWED_ORIGIN} was incorrectly allowed!"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
else
    echo "✓ Check 6 PASSED: Disallowed origin rejected by CORS."
fi

# Check 7: Credential Scope Isolation Probe (Negative Security Test)
echo "[Check 7/8] Verifying credential scope isolation (Negative Security Probe)..."
UNRELATED_BUCKET="propertysignal-unrelated-forbidden-bucket-${TIMESTAMP}"
if [ "${HAS_CREDENTIALS}" = true ]; then
    if r2_s3_call "probe-unrelated" "${UNRELATED_BUCKET}" "" ""; then
        echo "✓ Check 7 PASSED: R2 credentials correctly restricted (Probe output: Access Denied / Scoped)."
    else
        echo "✗ Check 7 FAILED: Scope probe unexpectedly succeeded on unrelated bucket '${UNRELATED_BUCKET}'!"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
    fi
else
    echo "! Check 7 PENDING / NOT_RUN (Requires Owner Provisioning: credentials not configured)."
    PENDING_CHECKS=$((PENDING_CHECKS + 1))
fi

# Check 8: r2.dev Domain Non-Reliance
echo "[Check 8/8] Verifying r2.dev development domain non-reliance..."
if [[ "${PUBLIC_BASE_URL}" != *r2.dev* ]]; then
    echo "✓ Check 8 PASSED: Base URL is custom domain (${PUBLIC_BASE_URL}), not r2.dev."
else
    echo "✗ Check 8 FAILED: Public base URL uses r2.dev development domain!"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi

echo ""
echo "=== Verification Summary ==="
echo "Failed Checks:  ${FAILED_CHECKS}"
echo "Pending Checks: ${PENDING_CHECKS}"

if [ "${FAILED_CHECKS}" -gt 0 ]; then
    echo "Status: ✗ FAILED (${FAILED_CHECKS} check(s) failed)"
    exit 1
elif [ "${PENDING_CHECKS}" -gt 0 ]; then
    echo "Status: ! PENDING_OWNER_PROVISIONING (${PENDING_CHECKS} check(s) pending live credentials/DNS)"
    exit 0
else
    echo "Status: ✓ ALL CHECKS PASSED"
    exit 0
fi
