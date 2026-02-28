/**
 * Playwright global setup — runs once before the entire test suite.
 *
 * Responsibilities:
 *   1. Authenticate as a dealer via Supabase password grant.
 *   2. Create a DRAFT listing via POST /api/listings.
 *   3. Optionally approve it via POST /api/admin/listings/{id}/approve using admin creds.
 *   4. Write the result to e2e/.test-listing-id so individual specs can consume it.
 *
 * This function MUST NOT throw — any failure is logged and the suite runs in
 * degraded mode (listing-dependent tests will skip themselves).
 */

import * as fs from 'fs';
import * as path from 'path';

const BACKEND =
  process.env.BACKEND_BASE_URL ?? 'https://udupi-property-explorer.onrender.com';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

const ID_FILE = path.join(__dirname, '.test-listing-id');

/**
 * Obtain a Supabase access token via the password grant.
 * Returns null on any failure rather than throwing.
 */
async function getToken(email: string, password: string): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('[global-setup] VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY not set — cannot obtain token.');
    return null;
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
      },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '<unreadable>');
      console.log(`[global-setup] Supabase auth failed (${res.status}): ${text}`);
      return null;
    }

    const data = await res.json() as { access_token?: string };
    return data.access_token ?? null;
  } catch (err) {
    console.log(`[global-setup] Supabase auth request threw: ${String(err)}`);
    return null;
  }
}

export default async function globalSetup(): Promise<void> {
  const dealerEmail = process.env.DEALER_EMAIL ?? '';
  const dealerPassword = process.env.DEALER_PASSWORD ?? '';

  // ------------------------------------------------------------------
  // Guard: dealer creds required to create the listing
  // ------------------------------------------------------------------
  if (!dealerEmail || !dealerPassword) {
    console.log(
      '[global-setup] DEALER_EMAIL / DEALER_PASSWORD not set — skipping listing creation. ' +
      'Tests that depend on a live listing will skip themselves.',
    );
    return;
  }

  // ------------------------------------------------------------------
  // Step 1: Authenticate as dealer
  // ------------------------------------------------------------------
  const dealerToken = await getToken(dealerEmail, dealerPassword);
  if (!dealerToken) {
    console.log('[global-setup] Could not obtain dealer token — skipping listing creation.');
    return;
  }

  // ------------------------------------------------------------------
  // Step 2: Create a DRAFT listing
  // ------------------------------------------------------------------
  let listingId: string;
  try {
    const res = await fetch(`${BACKEND}/api/listings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dealerToken}`,
      },
      body: JSON.stringify({
        propertyType: 'RESIDENTIAL',
        title: '[E2E Test Listing] Auto-created by Playwright global-setup',
        description: 'Automatically created by Playwright global-setup. Safe to delete.',
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '<unreadable>');
      console.log(`[global-setup] POST /api/listings failed (${res.status}): ${text}`);
      return;
    }

    const data = await res.json() as { id?: string };
    if (!data.id) {
      console.log('[global-setup] POST /api/listings response has no id field — aborting.');
      return;
    }
    listingId = data.id;
    console.log(`[global-setup] Created DRAFT listing: ${listingId}`);
  } catch (err) {
    console.log(`[global-setup] POST /api/listings threw: ${String(err)}`);
    return;
  }

  // ------------------------------------------------------------------
  // Step 3: Optionally approve as admin
  // ------------------------------------------------------------------
  const adminEmail = process.env.ADMIN_EMAIL ?? '';
  const adminPassword = process.env.ADMIN_PASSWORD ?? '';
  let status: 'DRAFT' | 'LIVE' = 'DRAFT';

  if (adminEmail && adminPassword) {
    const adminToken = await getToken(adminEmail, adminPassword);
    if (adminToken) {
      try {
        const approveRes = await fetch(
          `${BACKEND}/api/admin/listings/${listingId}/approve`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${adminToken}`,
            },
          },
        );

        if (approveRes.ok) {
          status = 'LIVE';
          console.log(`[global-setup] Listing ${listingId} approved — status: LIVE`);
        } else {
          const text = await approveRes.text().catch(() => '<unreadable>');
          console.log(
            `[global-setup] Approve failed (${approveRes.status}): ${text} — listing stays DRAFT`,
          );
        }
      } catch (err) {
        console.log(`[global-setup] Approve request threw: ${String(err)} — listing stays DRAFT`);
      }
    } else {
      console.log('[global-setup] Could not obtain admin token — listing stays DRAFT.');
    }
  } else {
    console.log('[global-setup] ADMIN_EMAIL / ADMIN_PASSWORD not set — listing stays DRAFT.');
  }

  // ------------------------------------------------------------------
  // Step 4: Persist to e2e/.test-listing-id
  //   Line 1: UUID
  //   Line 2: LIVE or DRAFT
  // ------------------------------------------------------------------
  try {
    fs.writeFileSync(ID_FILE, `${listingId}\n${status}\n`, 'utf-8');
    console.log(`[global-setup] Wrote ${ID_FILE} (${listingId}, ${status})`);
  } catch (err) {
    console.log(`[global-setup] Could not write ${ID_FILE}: ${String(err)}`);
  }
}
