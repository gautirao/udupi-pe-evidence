/**
 * Playwright global setup — runs once before the entire test suite.
 *
 * Responsibilities:
 *   1. Authenticate as a dealer via Supabase password grant.
 *   2. Create a DRAFT listing via POST /api/listings.
 *   3. If admin creds are present, prepare the listing for approval:
 *        a. PATCH addressConfirmed=true
 *        b. Register 3 stub images (metadata only, no real files)
 *        c. Submit for review (DRAFT → PENDING_REVIEW)
 *        d. Admin approve (PENDING_REVIEW → LIVE)
 *   4. Write the result to e2e/.test-listing-id so individual specs can consume it.
 *
 * This function MUST NOT throw for missing credentials. It WILL throw if admin
 * credentials are set but the approve endpoint fails — that is a hard failure,
 * not graceful degradation. Listing-dependent tests without admin creds will
 * skip themselves.
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

/** Decode the `sub` claim (user UUID) from a JWT without verifying signature. */
function getUserIdFromToken(token: string): string {
  const payload = token.split('.')[1] ?? '';
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as { sub?: string };
  return decoded.sub ?? '';
}

export default async function globalSetup(): Promise<void> {
  const dealerEmail = process.env.BROKER_EMAIL ?? process.env.DEALER_EMAIL ?? '';
  const dealerPassword = process.env.BROKER_PASSWORD ?? process.env.DEALER_PASSWORD ?? '';

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
  const dealerUserId = getUserIdFromToken(dealerToken);

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
        propertyType: 'house',
        title: '[E2E Test Listing] Auto-created by Playwright global-setup',
        locality: 'Udupi',
        price: 5000000,
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
    // 3a: PATCH addressConfirmed=true (required for submission)
    try {
      const patchRes = await fetch(`${BACKEND}/api/listings/${listingId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${dealerToken}`,
        },
        body: JSON.stringify({ addressConfirmed: true }),
      });
      if (!patchRes.ok) {
        const text = await patchRes.text().catch(() => '<unreadable>');
        console.log(`[global-setup] PUT addressConfirmed failed (${patchRes.status}): ${text}`);
      } else {
        console.log('[global-setup] Set addressConfirmed=true');
      }
    } catch (err) {
      console.log(`[global-setup] PUT addressConfirmed threw: ${String(err)}`);
    }

    // 3b: Register 3 stub images (metadata only — no actual file upload needed)
    const stubImages = ['img-1.jpg', 'img-2.jpg', 'img-3.jpg'];
    for (const filename of stubImages) {
      const storagePath = `listings/${dealerUserId}/${listingId}/${filename}`;
      try {
        const imgRes = await fetch(`${BACKEND}/api/listings/${listingId}/images`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${dealerToken}`,
          },
          body: JSON.stringify({
            storagePath,
            url: `https://placeholder.invalid/${filename}`,
          }),
        });
        if (!imgRes.ok) {
          const text = await imgRes.text().catch(() => '<unreadable>');
          console.log(`[global-setup] Register image ${filename} failed (${imgRes.status}): ${text}`);
        }
      } catch (err) {
        console.log(`[global-setup] Register image ${filename} threw: ${String(err)}`);
      }
    }
    console.log('[global-setup] Registered 3 stub images');

    // 3c: Submit for review (DRAFT → PENDING_REVIEW)
    let submitted = false;
    try {
      const submitRes = await fetch(`${BACKEND}/api/listings/${listingId}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${dealerToken}` },
      });
      if (submitRes.ok) {
        submitted = true;
        console.log('[global-setup] Submitted listing for review (PENDING_REVIEW)');
      } else {
        const text = await submitRes.text().catch(() => '<unreadable>');
        console.log(`[global-setup] Submit failed (${submitRes.status}): ${text} — listing stays DRAFT`);
      }
    } catch (err) {
      console.log(`[global-setup] Submit threw: ${String(err)} — listing stays DRAFT`);
    }

    // 3d: Admin approve (PENDING_REVIEW → LIVE)
    if (submitted) {
      const adminToken = await getToken(adminEmail, adminPassword);
      if (adminToken) {
        let approveRes: Response;
        try {
          approveRes = await fetch(
            `${BACKEND}/api/admin/listings/${listingId}/approve`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${adminToken}`,
              },
            },
          );
        } catch (err) {
          throw new Error(
            `[global-setup] Approve request threw: ${String(err)}. ` +
            'Admin credentials are set — this is a hard failure.',
          );
        }

        if (approveRes.ok) {
          status = 'LIVE';
          console.log(`[global-setup] Listing ${listingId} approved — status: LIVE`);
        } else {
          const text = await approveRes.text().catch(() => '<unreadable>');
          throw new Error(
            `[global-setup] Approve failed (${approveRes.status}): ${text}. ` +
            'Admin credentials are set — this is a hard failure, not graceful degradation. ' +
            'If approveListing is intentionally disabled, remove ADMIN_EMAIL/ADMIN_PASSWORD from .env.e2e.',
          );
        }
      } else {
        console.log('[global-setup] Could not obtain admin token — listing stays DRAFT.');
      }
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
