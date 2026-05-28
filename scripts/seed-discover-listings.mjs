/**
 * Seed script: idempotent upsert of 12 LIVE [E2E] listings
 * (4 × Manipal, 4 × Malpe, 4 × Kaup) with real coordinates.
 *
 * Usage:
 *   source .env.seed && node scripts/seed-discover-listings.mjs
 *
 * Idempotency guarantee:
 *   - Listings are identified by (user_id, title). Title always starts with "[E2E]".
 *   - If a listing already exists → SQL UPDATE only (no re-create).
 *   - If it does not exist → CREATE via API, then SQL UPDATE.
 *   - Rows whose title does NOT start with "[E2E]" are never touched.
 *   - No DELETE / TRUNCATE / DROP is ever executed.
 *
 * Required env vars: see .env.seed.example at the repo root.
 */

import fs from 'fs';
import { execSync } from 'child_process';

// ── Env-var validation ────────────────────────────────────────────────────────

function collectEnv(keys) {
  const missing = [];
  const values = {};
  for (const key of keys) {
    const val = process.env[key];
    if (!val) {
      missing.push(key);
    } else {
      values[key] = val;
    }
  }
  if (missing.length > 0) {
    for (const k of missing) {
      console.error(`[seed] ERROR: Missing required env var: ${k}`);
    }
    process.exit(1);
  }
  return values;
}

// ── Config (from env) ─────────────────────────────────────────────────────────

const REQUIRED = [
  'SEED_SUPABASE_URL',
  'SEED_SUPABASE_KEY',
  'SEED_BROKER_EMAIL',
  'SEED_BROKER_PASSWORD',
  'SEED_ADMIN_EMAIL',
  'SEED_ADMIN_PASSWORD',
  'SEED_DB_HOST',
  'SEED_DB_USER',
  'SEED_DB_PASSWORD',
];

const env = collectEnv(REQUIRED);

const SUPABASE_URL   = env.SEED_SUPABASE_URL;
const SUPABASE_KEY   = env.SEED_SUPABASE_KEY;
const BROKER_EMAIL   = env.SEED_BROKER_EMAIL;
const BROKER_PASS    = env.SEED_BROKER_PASSWORD;
const ADMIN_EMAIL    = env.SEED_ADMIN_EMAIL;
const ADMIN_PASS     = env.SEED_ADMIN_PASSWORD;
const BACKEND        = process.env.SEED_BACKEND_URL ?? 'http://localhost:8085';
const IMAGE_PATH     = process.env.SEED_IMAGE_PATH ?? null;

// ── Listing data ──────────────────────────────────────────────────────────────

// Prices: paise (stored in DB) + rupee value (accepted by API)
const PRICES_PAISE  = [10_000_000, 100_000_000, 1_000_000_000, 1_500_000_000];
const PRICES_RUPEES = [100_000,    1_000_000,   10_000_000,    15_000_000];
const PRICE_LABELS  = ['1 Lakh',   '10 Lakh',   '1 Crore',     '1.5 Crore'];

const AREAS = [
  {
    areaKey:  'IN|KA|Udupi|Manipal',
    areaName: 'Manipal',
    locality: 'Manipal',
    coords: [
      [13.3522, 74.7873],
      [13.3545, 74.7895],
      [13.3498, 74.7852],
      [13.3560, 74.7840],
    ],
  },
  {
    areaKey:  'IN|KA|Udupi|Malpe',
    areaName: 'Malpe',
    locality: 'Malpe',
    coords: [
      [13.3507, 74.7037],
      [13.3484, 74.7033],
      [13.3620, 74.6979],
      [13.3475, 74.7018],
    ],
  },
  {
    areaKey:  'IN|KA|Udupi|Kaup',
    areaName: 'Kaup',
    locality: 'Kaup',
    coords: [
      [13.2106, 74.7403],
      [13.2130, 74.7422],
      [13.2085, 74.7380],
      [13.2152, 74.7445],
    ],
  },
];

// ── DB helpers (stdin-based to avoid shell injection) ─────────────────────────

function psqlEnv() {
  return {
    ...process.env,
    PGPASSWORD: process.env.SEED_DB_PASSWORD,
    PGHOST:     process.env.SEED_DB_HOST,
    PGPORT:     process.env.SEED_DB_PORT || '6543',
    PGDATABASE: process.env.SEED_DB_NAME || 'postgres',
    PGUSER:     process.env.SEED_DB_USER,
    PGSSLMODE:  'require',
  };
}

/**
 * Execute a SQL statement via psql stdin. Throws on non-zero exit.
 */
function psql(sql) {
  execSync('psql', {
    input: sql,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: psqlEnv(),
  });
}

/**
 * Execute a SQL query via psql stdin and return trimmed stdout.
 * Uses -t (tuples only) and -A (unaligned) so output is a bare value.
 */
function psqlQuery(sql) {
  const output = execSync('psql -t -A', {
    input: sql,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: psqlEnv(),
  });
  return output.toString().trim();
}

/**
 * Return { id, status } if exactly one row matches (user_id, title),
 * null if none, or throw if multiple found.
 * The AND title LIKE '[E2E]%' guard prevents accidental matches on non-seed rows.
 */
function findExistingListing(userId, title) {
  // Escape single quotes for SQL string literal
  const safeTitle  = title.replace(/'/g, "''");
  const safeUserId = userId.replace(/'/g, "''");
  const sql = `SELECT id, status FROM property_listings WHERE user_id = '${safeUserId}' AND title = '${safeTitle}' AND title LIKE '[E2E]%';`;
  const result = psqlQuery(sql);
  if (!result) return null;
  const rows = result.split('\n').filter(Boolean);
  if (rows.length > 1) {
    throw new Error(`Ambiguous: ${rows.length} rows found for title="${title}". Skipping.`);
  }
  const [id, status] = rows[0].split('|');
  return { id, status };
}

/**
 * SQL UPDATE to stamp area_key, lat/lon, price_paise, address_confirmed
 * on an existing listing row.
 */
function updateListingFields(listingId, areaKey, lat, lon, pricePaise) {
  const safeAreaKey = areaKey.replace(/'/g, "''");
  const safeId = listingId.replace(/'/g, "''");
  const sql = `
UPDATE property_listings
SET
  area_key          = '${safeAreaKey}',
  latitude          = ${lat},
  longitude         = ${lon},
  price_paise       = ${pricePaise},
  address_confirmed = true
WHERE id = '${safeId}';
`;
  psql(sql);
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function getToken(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Auth failed for ${email}: ${res.status} ${await res.text()}`);
  const { access_token } = await res.json();
  return access_token;
}

function getUserIdFromToken(token) {
  const payload = token.split('.')[1] ?? '';
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
  return decoded.sub;
}

/**
 * Upload the seed image once to a deterministic storage path.
 * Re-runs overwrite the same slot instead of leaking orphaned files.
 */
async function uploadImageOnce(token, userId) {
  const imageBytes = fs.readFileSync(IMAGE_PATH);
  const storagePath = `listings/${userId}/e2e-seed-image.jpg`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/listing-images/${storagePath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
    body: imageBytes,
  });
  // 200 = created, 409 = already exists (idempotent — overwrite via upsert header not needed)
  if (!res.ok && res.status !== 409) {
    throw new Error(`Image upload failed (${res.status}): ${await res.text()}`);
  }
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/listing-images/${storagePath}`;
  console.log(`[seed] Image uploaded → ${publicUrl}`);
  return { storagePath, publicUrl };
}

async function createDraftListing(token, { locality, priceRupees, title, index }) {
  const isRent = index >= 2;
  const body = {
    propertyType: 'house',
    title,
    locality,
    price: priceRupees,
    listingPurpose: isRent ? 'rent' : 'sale',
    bedrooms: (index % 3) + 1,
    bathrooms: (index % 3) + 1 >= 3 ? 2 : (index % 3) + 1,
    builtArea: 1000 + index * 200,
    builtAreaUnit: 'sq ft',
    ...(isRent && {
      monthlyRent: Math.round(priceRupees / 100),
      securityDepositMonths: 2,
    }),
  };
  const res = await fetch(`${BACKEND}/api/listings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Create listing failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.id;
}

async function deleteListing(token, listingId) {
  try {
    const res = await fetch(`${BACKEND}/api/listings/${listingId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.warn(`[seed]   cleanup DELETE failed (${res.status}) for ${listingId}`);
    }
  } catch (err) {
    console.warn(`[seed]   cleanup DELETE threw: ${err.message}`);
  }
}

async function registerImagesOnListing(token, userId, listingId, publicUrl) {
  for (let n = 1; n <= 3; n++) {
    // Deterministic storage path per image slot — avoids orphaned duplicates on re-run
    const storagePath = `listings/${userId}/${listingId}/e2e-seed-${n}.jpg`;
    const res = await fetch(`${BACKEND}/api/listings/${listingId}/images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ storagePath, url: publicUrl }),
    });
    if (!res.ok) throw new Error(`Register image ${n} failed (${res.status}): ${await res.text()}`);
  }
}

async function submitListing(token, listingId) {
  const res = await fetch(`${BACKEND}/api/listings/${listingId}/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Submit failed (${res.status}): ${await res.text()}`);
}

async function approveListing(adminToken, listingId) {
  const res = await fetch(`${BACKEND}/api/admin/listings/${listingId}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!res.ok) throw new Error(`Approve failed (${res.status}): ${await res.text()}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[seed] Starting...');
  console.log(`[seed] Backend: ${BACKEND}`);

  // Authenticate
  const brokerToken = await getToken(BROKER_EMAIL, BROKER_PASS);
  const brokerId    = getUserIdFromToken(brokerToken);
  const adminToken  = await getToken(ADMIN_EMAIL, ADMIN_PASS);
  console.log(`[seed] Broker ID: ${brokerId}`);

  // Image upload (optional)
  let publicUrl = null;
  if (IMAGE_PATH) {
    if (fs.existsSync(IMAGE_PATH)) {
      console.log(`[seed] Uploading image from ${IMAGE_PATH}...`);
      ({ publicUrl } = await uploadImageOnce(brokerToken, brokerId));
    } else {
      console.warn(`[seed] SEED_IMAGE_PATH set but file not found: ${IMAGE_PATH} — skipping image upload`);
    }
  } else {
    console.log('[seed] SEED_IMAGE_PATH not set — skipping image upload');
  }

  // Process each listing
  let succeeded = 0;
  let skipped   = 0;
  let failed    = 0;

  for (const area of AREAS) {
    console.log(`\n[seed] → ${area.areaName}`);

    for (let i = 0; i < 4; i++) {
      const [lat, lon] = area.coords[i];
      const title = `[E2E] ${PRICE_LABELS[i]} ${area.areaName} ${i % 2 === 0 ? 'Apartment' : 'House'}`;

      let listingId = null;
      let created   = false;

      try {
        // 1. Idempotency check — look for an existing row
        let existing;
        try {
          existing = findExistingListing(brokerId, title);
        } catch (ambiguousErr) {
          console.error(`[seed]   SKIP (ambiguous) "${title}": ${ambiguousErr.message}`);
          skipped++;
          continue;
        }

        if (existing) {
          console.log(`[seed]   EXISTS "${title}" → ${existing.id} (status: ${existing.status}) — updating fields`);
          listingId = existing.id;
        } else {
          // 2. Create via API
          listingId = await createDraftListing(brokerToken, {
            locality:    area.locality,
            priceRupees: PRICES_RUPEES[i],
            title,
            index:       i,
          });
          created = true;
        }

        // 3. SQL UPDATE — stamp area_key, coordinates, price_paise, address_confirmed
        try {
          updateListingFields(listingId, area.areaKey, lat, lon, PRICES_PAISE[i]);
        } catch (sqlErr) {
          if (created) {
            console.error(`[seed]   SQL UPDATE failed for "${title}" (${listingId}): ${sqlErr.message}`);
            console.log(`[seed]   Rolling back newly created listing ${listingId}...`);
            await deleteListing(brokerToken, listingId);
          } else {
            console.error(`[seed]   SQL UPDATE failed for existing "${title}" (${listingId}): ${sqlErr.message}`);
          }
          failed++;
          continue;
        }

        // 4. Images, submit, approve:
        //    - Always for new listings.
        //    - Also re-drive for existing listings that are not yet LIVE
        //      (handles prior runs interrupted between CREATE and approve).
        const isNew        = created;
        const isIncomplete = existing != null && existing.status !== 'LIVE';

        if (isNew && publicUrl) {
          await registerImagesOnListing(brokerToken, brokerId, listingId, publicUrl);
        }
        if (isNew || isIncomplete) {
          // Submit is safe to call even if already submitted (catch 4xx and proceed)
          try {
            await submitListing(brokerToken, listingId);
          } catch (_submitErr) {
            // May already be in PENDING/LIVE state from a prior interrupted run — proceed to approve
          }
          await approveListing(adminToken, listingId);
        }

        const action = created ? 'CREATED' : (isIncomplete ? 'REACTIVATED' : 'UPDATED');
        console.log(`[seed]   ${action} "${title}" [${lat}, ${lon}] → ${listingId}`);
        succeeded++;

      } catch (err) {
        console.error(`[seed]   FAILED "${title}": ${err.message}`);
        failed++;
      }
    }
  }

  console.log(`\n[seed] Done — ${succeeded} succeeded, ${skipped} skipped, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('[seed] FATAL:', err.message);
  process.exit(1);
});
