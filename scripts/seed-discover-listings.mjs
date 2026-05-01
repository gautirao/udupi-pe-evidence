/**
 * Seed script: clears all property_listings, then creates 12 LIVE listings
 * (4 × Manipal, 4 × Malpe, 4 × Kaup) with real coordinates and the provided image.
 *
 * Usage: node scripts/seed-discover-listings.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://elyqnysyqbqoxqqrpiir.supabase.co';
const SUPABASE_KEY = 'sb_publishable_wwNV0JyvY4XdhciaEXHFCw_gFU9guLj';
const BROKER_EMAIL = 'testdealer@retrends.com';
const BROKER_PASS  = 'password';
const ADMIN_EMAIL  = 'testadmin@retrends.com';
const ADMIN_PASS   = 'password';
const BACKEND      = 'http://localhost:8085';
const IMAGE_FILE   = '/Users/gouthamrao/Downloads/flat3.jpg';

const DB_URL = 'host=aws-1-eu-west-1.pooler.supabase.com port=6543 dbname=postgres user=postgres.elyqnysyqbqoxqqrpiir sslmode=require';
const DB_PASS = 'Y3aCQ1trja2Xwgrw';

// Prices: paise column + rupee value for the price column validation
const PRICES_PAISE  = [10_000_000, 100_000_000, 1_000_000_000, 1_500_000_000];
const PRICES_RUPEES = [100_000,    1_000_000,   10_000_000,    15_000_000];

const PRICE_LABELS = ['1 Lakh', '10 Lakh', '1 Crore', '1.5 Crore'];

// Area keys match the DB values (tab-separated)
const AREAS = [
  {
    areaKey: 'IN|KA|Udupi|Manipal',
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
    areaKey: 'IN|KA|Udupi|Malpe',
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
    areaKey: 'IN|KA|Udupi|Kaup',
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

// ── DB helper ─────────────────────────────────────────────────────────────────

function psql(sql) {
  execSync(`PGPASSWORD="${DB_PASS}" psql "${DB_URL}" -c "${sql.replace(/"/g, '\\"')}"`, {
    stdio: 'pipe',
    env: { ...process.env, PGPASSWORD: DB_PASS },
  });
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

async function uploadImageOnce(token, userId) {
  const imageBytes = fs.readFileSync(IMAGE_FILE);
  const storagePath = `listings/${userId}/seed-flat3-${Date.now()}.jpg`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/listing-images/${storagePath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
    body: imageBytes,
  });
  if (!res.ok) throw new Error(`Image upload failed (${res.status}): ${await res.text()}`);
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
      monthlyRent: Math.round(priceRupees / 100), // ~1% of price as monthly rent
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

async function registerImagesOnListing(token, userId, listingId, publicUrl) {
  for (let n = 1; n <= 3; n++) {
    const storagePath = `listings/${userId}/${listingId}/seed/${Date.now()}-${n}.jpg`;
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

  const brokerToken = await getToken(BROKER_EMAIL, BROKER_PASS);
  const brokerId = getUserIdFromToken(brokerToken);
  const adminToken = await getToken(ADMIN_EMAIL, ADMIN_PASS);
  console.log(`[seed] Broker: ${brokerId}`);

  // 1. Delete all existing listings (handle RESTRICT FKs first)
  console.log('[seed] Clearing all listings...');
  execSync(
    `PGPASSWORD="${DB_PASS}" psql "${DB_URL}" -c "DELETE FROM listing_status_history" -c "DELETE FROM price_change_log" -c "DELETE FROM property_listings"`,
    { env: { ...process.env, PGPASSWORD: DB_PASS } }
  );
  console.log('[seed] All listings cleared');

  // 2. Upload shared image once
  console.log('[seed] Uploading image...');
  const { publicUrl } = await uploadImageOnce(brokerToken, brokerId);

  // 3. Create each listing
  const results = [];
  for (const area of AREAS) {
    console.log(`\n[seed] → ${area.areaName}`);
    for (let i = 0; i < 4; i++) {
      const [lat, lon] = area.coords[i];
      const title = `${PRICE_LABELS[i]} ${area.areaName} ${i % 2 === 0 ? 'Apartment' : 'House'}`;

      const listingId = await createDraftListing(brokerToken, {
        locality: area.locality,
        priceRupees: PRICES_RUPEES[i],
        title,
        index: i,
      });

      // 4. SQL: set area_key, lat/lon, price_paise, address_confirmed in one UPDATE
      const areaKeyEscaped = area.areaKey.replace(/'/g, "''").replace(/\\/g, '\\\\');
      execSync(
        `PGPASSWORD="${DB_PASS}" psql "${DB_URL}" -c "UPDATE property_listings SET area_key = '${areaKeyEscaped}', latitude = ${lat}, longitude = ${lon}, price_paise = ${PRICES_PAISE[i]}, address_confirmed = true WHERE id = '${listingId}'"`,
        { env: { ...process.env, PGPASSWORD: DB_PASS } }
      );

      // 5. Register 3 images, submit, approve
      await registerImagesOnListing(brokerToken, brokerId, listingId, publicUrl);
      await submitListing(brokerToken, listingId);
      await approveListing(adminToken, listingId);

      console.log(`  ✓ ${title} [${lat}, ${lon}] → ${listingId}`);
      results.push({ area: area.areaName, title, listingId, lat, lon, pricePaise: PRICES_PAISE[i] });
    }
  }

  console.log(`\n[seed] Done — ${results.length} LIVE listings created.`);
  console.log('[seed] Summary:');
  for (const r of results) {
    const crore = (r.pricePaise / 10_000_000 / 100).toFixed(2);
    console.log(`  ${r.area.padEnd(10)} ${r.title.padEnd(35)} [${r.lat}, ${r.lon}]`);
  }
}

main().catch(err => {
  console.error('[seed] FAILED:', err.message);
  process.exit(1);
});
