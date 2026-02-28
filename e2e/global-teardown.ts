/**
 * Playwright global teardown — runs once after the entire test suite completes.
 *
 * Responsibilities:
 *   1. Read e2e/.test-listing-id to find the listing created by global-setup.
 *   2. Authenticate as dealer and DELETE /api/listings/{id}.
 *   3. Remove e2e/.test-listing-id regardless of whether the DELETE succeeded.
 *
 * This function MUST NOT throw — cleanup is best-effort only. Any failure is
 * logged and execution continues so Playwright can exit normally.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

    if (!res.ok) return null;

    const data = await res.json() as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

export default async function globalTeardown(): Promise<void> {
  // ------------------------------------------------------------------
  // Step 1: Read the ID file
  // ------------------------------------------------------------------
  if (!fs.existsSync(ID_FILE)) {
    console.log('[global-teardown] No .test-listing-id file found — nothing to clean up.');
    return;
  }

  let listingId: string;
  try {
    const contents = fs.readFileSync(ID_FILE, 'utf-8').trim();
    listingId = contents.split('\n')[0].trim();
    if (!listingId) {
      console.log('[global-teardown] .test-listing-id is empty — skipping DELETE.');
      fs.unlinkSync(ID_FILE);
      return;
    }
  } catch (err) {
    console.log(`[global-teardown] Could not read .test-listing-id: ${String(err)}`);
    return;
  }

  // ------------------------------------------------------------------
  // Step 2: Authenticate as dealer
  // ------------------------------------------------------------------
  const dealerEmail = process.env.DEALER_EMAIL ?? '';
  const dealerPassword = process.env.DEALER_PASSWORD ?? '';

  if (!dealerEmail || !dealerPassword) {
    console.log(
      `[global-teardown] DEALER_EMAIL / DEALER_PASSWORD not set — cannot delete listing ${listingId}. ` +
      'Remove it manually.',
    );
    // Still remove the ID file so stale data doesn't affect future runs.
    try { fs.unlinkSync(ID_FILE); } catch { /* best-effort */ }
    return;
  }

  const token = await getToken(dealerEmail, dealerPassword);
  if (!token) {
    console.log(
      `[global-teardown] Could not obtain dealer token — cannot delete listing ${listingId}. ` +
      'Remove it manually.',
    );
    try { fs.unlinkSync(ID_FILE); } catch { /* best-effort */ }
    return;
  }

  // ------------------------------------------------------------------
  // Step 3: DELETE the listing
  // ------------------------------------------------------------------
  try {
    const res = await fetch(`${BACKEND}/api/listings/${listingId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.ok || res.status === 404) {
      console.log(`[global-teardown] Deleted listing ${listingId} (status ${res.status})`);
    } else {
      const text = await res.text().catch(() => '<unreadable>');
      console.log(
        `[global-teardown] DELETE /api/listings/${listingId} returned ${res.status}: ${text}. ` +
        'Listing may need manual cleanup.',
      );
    }
  } catch (err) {
    console.log(
      `[global-teardown] DELETE /api/listings/${listingId} threw: ${String(err)}. ` +
      'Listing may need manual cleanup.',
    );
  }

  // ------------------------------------------------------------------
  // Step 4: Remove the ID file regardless of DELETE outcome
  // ------------------------------------------------------------------
  try {
    fs.unlinkSync(ID_FILE);
    console.log(`[global-teardown] Removed ${ID_FILE}`);
  } catch (err) {
    console.log(`[global-teardown] Could not remove ${ID_FILE}: ${String(err)}`);
  }
}
