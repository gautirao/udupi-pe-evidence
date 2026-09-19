# Cloudflare R2 Infrastructure & Operational Runbook

**Issue**: #2631 (`ops/2631-r2-infrastructure`)  
**PR**: #2637  
**Parent Architecture**: #2625  
**Status**: `WAITING_ON_OWNER_CLOUDFLARE_ACTION`  
**Last Updated**: 2026-09-19  

---

## 1. Action Status & Owner Hand-off

> [!IMPORTANT]
> **Status: WAITING_ON_OWNER_CLOUDFLARE_ACTION**
> 
> Live provisioning of Cloudflare R2 resources and production secret binding require explicit Cloudflare Account and Render Administrative privileges. All configuration templates, CORS rules, provisioning scripts, smoke-test suites, and operational policies have been prepared in this repository.

### Small Exact List of Owner Actions Required:

1. **Cloudflare R2 Bucket Creation**:
   - Log in to Cloudflare Dashboard → **R2** → **Create Bucket**.
   - Bucket Name: `propertysignal-listing-images`
   - Storage Class: `Standard`

2. **Custom Domain Attachment (`img.propertysignal.in`)**:
   - In `propertysignal-listing-images` Bucket Settings → **Custom Domains** → **Connect Domain**.
   - Domain: `img.propertysignal.in`
   - Confirm Cloudflare DNS CNAME record creation and TLS certificate issuance.
   - Ensure public `r2.dev` access is **Disabled** or not used.

3. **CORS Policy Application**:
   - Bucket Settings → **CORS Policy** → Paste contents of `infra/r2/cors.json` (or use `infra/r2/provision-r2.sh`).

4. **Bucket-Scoped API Credential Generation**:
   - Cloudflare Account R2 Overview → **Manage R2 API Tokens** → **Create API Token**.
   - Permissions: `Object Read`, `Object Write`, `Object Delete`.
   - Bucket Scope: Apply **ONLY** to `propertysignal-listing-images`.
   - Note down: `Account ID`, `Access Key ID`, and `Secret Access Key`.

5. **Render Environment Variable Configuration**:
   - Set the following environment variables in Render production backend service dashboard:
     ```env
     LISTING_IMAGE_STORAGE_PROVIDER=r2
     R2_ACCOUNT_ID=<your-cloudflare-account-id>
     R2_ACCESS_KEY_ID=<your-bucket-access-key-id>
     R2_SECRET_ACCESS_KEY=<your-bucket-secret-access-key>
     R2_LISTING_IMAGE_BUCKET=propertysignal-listing-images
     R2_LISTING_IMAGE_PUBLIC_BASE_URL=https://img.propertysignal.in
     ```
   - *Do not remove existing Supabase credentials if required by other database or auth features.*

6. **Execute Verification Smoke Test**:
   - Execute `infra/r2/smoke-test.sh` to confirm end-to-end connectivity, HTTPS, CORS policies, and cache headers.

---

## 2. Production Architecture & Data Flow

```text
Browser PUT (Upload Flow)
  │
  ├── 1. Request Presigned Upload URL ──► Java Backend (/api/listings/{id}/images/upload-url)
  │◄── 2. Return Presigned S3 API URL ──┤ (Uses R2 API S3 Endpoint: <account>.r2.cloudflarestorage.com)
  │
  └── 3. Direct Browser PUT Byte Upload ──► Cloudflare R2 S3 Endpoint
                                              │
                                              ▼
                                   [propertysignal-listing-images]

Browser GET (Public Image Delivery Flow)
  │
  └── GET https://img.propertysignal.in/<object-key>
        │
        ▼
  Cloudflare Edge CDN (Global Cache)
        │
        ▼ (Cache miss)
  Cloudflare R2 Bucket [propertysignal-listing-images]
```

### Key Architectural Boundaries:
- **Upload Domain**: Presigned S3 API URLs use `<account-id>.r2.cloudflarestorage.com` (S3 API protocol). Presigned URLs MUST NOT use the custom domain.
- **Delivery Domain**: Public GET requests MUST use `https://img.propertysignal.in/<object-key>` served via Cloudflare CDN.
- **Application Code Scoping**: Scraping/import pipelines hotlink original scraped URLs (#2624). Only user/broker listing image uploads target R2.

---

## 3. Cloudflare R2 Bucket Specification

- **Bucket Name**: `propertysignal-listing-images`
- **Storage Class**: `Standard`
- **Region**: Automatic / Global
- **Development Domain (`r2.dev`)**: Disabled / Strictly prohibited for production use.
- **Public Domain**: `img.propertysignal.in`

---

## 4. Custom Domain & DNS / TLS Setup

- **Custom Domain**: `img.propertysignal.in`
- **DNS Record**: CNAME record `img.propertysignal.in` pointing to Cloudflare R2 managed bucket endpoint (auto-configured by Cloudflare R2 Custom Domain wizard).
- **TLS / SSL**:
  - Managed SSL certificate issued by Cloudflare Universal SSL (`*.propertysignal.in` / `img.propertysignal.in`).
  - Minimum TLS Version: `1.2`.
  - SSL/TLS Encryption Mode: `Full (strict)`.
  - HTTP Access: Automatic HTTPS redirection enabled.

---

## 5. CORS Policy Specification

File: `infra/r2/cors.json`

```json
[
  {
    "AllowedOrigins": [
      "https://propertysignal.in",
      "https://www.propertysignal.in",
      "https://staging.propertysignal.in"
    ],
    "AllowedMethods": [
      "PUT"
    ],
    "AllowedHeaders": [
      "Content-Type",
      "Cache-Control"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

### Security Directives:
- **No Wildcard Origins**: `AllowedOrigins: ["*"]` is strictly forbidden in production.
- **Allowed Methods**: `PUT` only for direct browser uploads. (GET is served directly via Cloudflare CDN / Custom Domain).
- **Allowed Headers**: Exact headers signed by backend S3 presigned URL generator (`Content-Type`, `Cache-Control`).
- **Expose Headers**: `ETag` exposed for upload integrity verification.
- **Preflight Cache**: `MaxAgeSeconds = 3600` (1 hour) to reduce OPTIONS preflight overhead.

---

## 6. CDN & Cache Policy

- **Public Delivery URL**: `https://img.propertysignal.in/<object-key>`
- **Object Key Immutability**: All listing image object keys are immutable random UUIDs (e.g. `listings/f47ac10b-58cc-4372-a567-0e02b2c3d479/a8f3b21c.jpg`). Updating an image uploads to a new UUID key; keys are never overwritten in-place.
- **Cache-Control Metadata**: Uploaded objects carry metadata:
  ```http
  Cache-Control: public, max-age=31536000, immutable
  ```
- **Cloudflare Edge Cache Policy**: Cloudflare CDN respects the `Cache-Control` header and caches objects at edge locations globally for 1 year.
- **Deletion & Stale-Cache Handling Policy**:
  1. When a user deletes a listing image, the application backend immediately deletes the DB row in `listing_images` (DB is source of truth).
  2. The frontend and API immediately stop rendering or referencing the deleted image URL.
  3. Because object URLs are immutable UUIDs, old URLs remaining in downstream browser/CDN cache pose zero collision risk for new uploads.
  4. If an immediate purge from Cloudflare edge cache is required for privacy or legal compliance, ops can issue a Purge Cache request by URL via Cloudflare API:
     ```bash
     curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache" \
       -H "Authorization: Bearer {api_token}" \
       -H "Content-Type: application/json" \
       --data '{"files":["https://img.propertysignal.in/listings/.../photo.jpg"]}'
     ```

---

## 7. Least-Privilege Credential Contract

Backend services require Cloudflare R2 credentials to generate presigned S3 upload URLs and perform delete operations.

### Credential Scope:
- **Type**: R2 API Token / S3 Access Keys.
- **Permissions**:
  - `object:read` (HEAD / Object metadata checks)
  - `object:put` (Presigned PUT signature generation)
  - `object:delete` (Object deletion)
- **Bucket Restriction**: Scoped strictly to `propertysignal-listing-images`.
- **Prohibitions**:
  - Token MUST NOT have Admin privileges.
  - Token MUST NOT have access to other R2 buckets or Cloudflare Account settings.

---

## 8. Backend Environment Variable Manifest

The following environment variables MUST be configured in Render:

| Variable Name | Required Value / Description | Example |
|---|---|---|
| `LISTING_IMAGE_STORAGE_PROVIDER` | `r2` | `r2` |
| `R2_ACCOUNT_ID` | Cloudflare Account ID | `0123456789abcdef0123456789abcdef` |
| `R2_ACCESS_KEY_ID` | Bucket-scoped Access Key ID | `a1b2c3d4e5f67890` |
| `R2_SECRET_ACCESS_KEY` | Bucket-scoped Secret Access Key | `[SECURED_SECRET]` |
| `R2_LISTING_IMAGE_BUCKET` | `propertysignal-listing-images` | `propertysignal-listing-images` |
| `R2_LISTING_IMAGE_PUBLIC_BASE_URL` | `https://img.propertysignal.in` | `https://img.propertysignal.in` |

> [!WARNING]
> Do NOT print or commit real secret values to git or documentation.

---

## 9. Runbook & Safe Verification Sequence

Run `infra/r2/smoke-test.sh` to execute the following 8 checks:

1. **Bucket Existence**: Verify `propertysignal-listing-images` exists in Cloudflare R2.
2. **Canary Image GET**: Upload a dummy non-customer canary image (`canary-test.png`) and verify retrieval via `https://img.propertysignal.in/canary-test.png`.
3. **HTTPS Verification**: Ensure custom domain returns valid SSL/TLS certificate on port 443.
4. **Cache Header Inspection**: Verify `Cache-Control: public, max-age=31536000, immutable` is returned in HTTP response headers.
5. **Approved Origin CORS Preflight**: Issue OPTIONS request with `Origin: https://propertysignal.in` and verify `Access-Control-Allow-Origin: https://propertysignal.in` and `Access-Control-Allow-Methods: PUT`.
6. **Disallowed Origin CORS Rejection**: Issue OPTIONS request with `Origin: https://unauthorized-domain.com` and verify origin is NOT reflected in `Access-Control-Allow-Origin`.
7. **Scope Isolation**: Verify R2 credentials fail if attempted against an invalid or separate bucket.
8. **No `r2.dev` Usage**: Confirm application config and base URL use `https://img.propertysignal.in` exclusively.

---

## 10. Rollback & Emergency Plan

If R2 storage fails or requires temporary rollback to Supabase storage during launch:

1. **Revert Render Environment Variable**:
   Set `LISTING_IMAGE_STORAGE_PROVIDER=supabase` (or previous active provider) in Render Dashboard.
2. **Restart Backend Service**:
   Trigger backend deploy/restart on Render.
3. **Data Impact & Retention**:
   - Images stored in R2 bucket during the active period will remain safely in R2.
   - Application logic will resume using Supabase Storage bucket `listing-images`.
   - R2 bucket `propertysignal-listing-images` MUST NOT be deleted during rollback to preserve uploaded objects.
