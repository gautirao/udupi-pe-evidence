/**
 * Playwright global setup — runs once before the entire test suite.
 *
 * Responsibilities:
 *   1. Authenticate as a broker via Supabase password grant.
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

/**
 * Attempts to register a single image against the backend, retrying on transient
 * 5xx / 503 / 429 responses (RE-164: pessimistic lock timeout on Render Postgres).
 *
 * Retry schedule: 500ms → 1000ms → 2000ms (3 attempts total, 2 waits).
 * Returns true if the image was registered (201 or 409 — idempotent duplicate is ok).
 * Returns false if all attempts are exhausted — caller decides whether to hard-fail.
 */
async function registerImage(
  listingId: string,
  storagePath: string,
  url: string,
  token: string,
  filename: string,
  maxRetries = 3,
): Promise<boolean> {
  const delays = [500, 1000, 2000];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${BACKEND}/api/listings/${listingId}/images`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ storagePath, url }),
      });

      // 201 Created or 409 Conflict (idempotent duplicate) — both mean the image
      // record is present in the DB.
      if (res.ok || res.status === 409) {
        return true;
      }

      const isRetryable = res.status === 429 || res.status >= 500;
      const text = await res.text().catch(() => '<unreadable>');

      if (isRetryable && attempt < maxRetries) {
        const delayMs = delays[attempt - 1] ?? 2000;
        console.log(
          `[global-setup] Register image ${filename} retry ${attempt}/${maxRetries} (${res.status}) — waiting ${delayMs}ms`,
        );
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }

      // Non-retryable or retries exhausted
      console.warn(`[global-setup] Register image ${filename} failed (${res.status}): ${text}`);
      return false;
    } catch (err) {
      if (attempt < maxRetries) {
        const delayMs = delays[attempt - 1] ?? 2000;
        console.log(
          `[global-setup] Register image ${filename} retry ${attempt}/${maxRetries} (network error: ${String(err)}) — waiting ${delayMs}ms`,
        );
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      console.warn(`[global-setup] Register image ${filename} threw on final attempt: ${String(err)}`);
      return false;
    }
  }

  return false;
}

export default async function globalSetup(): Promise<void> {
  const brokerEmail = process.env.BROKER_EMAIL ?? process.env.DEALER_EMAIL ?? '';
  const brokerPassword = process.env.BROKER_PASSWORD ?? process.env.DEALER_PASSWORD ?? '';

  // ------------------------------------------------------------------
  // Guard: broker creds required to create the listing
  // ------------------------------------------------------------------
  if (!brokerEmail || !brokerPassword) {
    console.log(
      '[global-setup] BROKER_EMAIL / DEALER_EMAIL not set — skipping listing creation. ' +
      'Tests that depend on a live listing will skip themselves.',
    );
    return;
  }

  // ------------------------------------------------------------------
  // Step 1: Authenticate as broker
  // ------------------------------------------------------------------
  const brokerToken = await getToken(brokerEmail, brokerPassword);
  if (!brokerToken) {
    console.log('[global-setup] Could not obtain broker token — skipping listing creation.');
    return;
  }
  const brokerUserId = getUserIdFromToken(brokerToken);

  // ------------------------------------------------------------------
  // Step 2: Create a DRAFT listing
  // ------------------------------------------------------------------
  let listingId: string;
  try {
    const res = await fetch(`${BACKEND}/api/listings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${brokerToken}`,
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
          Authorization: `Bearer ${brokerToken}`,
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

    // 3b: Register 3 stub images (metadata only — no actual file upload needed).
    // registerImage uses SELECT ... FOR UPDATE which can time out on Render's shared
    // Postgres under rapid sequential calls (RE-164). Retry up to 3 times on any
    // 5xx / 503 / 429 with exponential backoff (500ms, 1000ms, 2000ms).
    const stubImages = ['img-1.jpg', 'img-2.jpg', 'img-3.jpg'];
    let imagesRegistered = 0;
    for (const filename of stubImages) {
      const storagePath = `listings/${brokerUserId}/${listingId}/${filename}`;
      const registered = await registerImage(
        listingId,
        storagePath,
        `https://placeholder.invalid/${filename}`,
        brokerToken,
        filename,
      );
      if (registered) imagesRegistered++;
    }
    if (imagesRegistered === 0) {
      // All 3 images failed — submission requires at least 1 image.
      // Write the ID file first so teardown can clean up the DRAFT listing even
      // when setup fails at this step. Then throw to surface the problem.
      try {
        fs.writeFileSync(ID_FILE, `${listingId}\nDRAFT\n`, 'utf-8');
        console.log(`[global-setup] Wrote ${ID_FILE} (${listingId}, DRAFT) before throwing`);
      } catch (writeErr) {
        console.log(`[global-setup] Could not write ${ID_FILE} before throw: ${String(writeErr)}`);
      }
      throw new Error(
        '[global-setup] All 3 image registrations failed after retries. ' +
        'The listing cannot be submitted without images. ' +
        'Check backend logs for PessimisticLockingFailureException / 503 responses.',
      );
    }
    console.log(`[global-setup] Registered ${imagesRegistered}/3 stub images`);

    // 3c: Submit for review (DRAFT → PENDING_REVIEW)
    let submitted = false;
    try {
      const submitRes = await fetch(`${BACKEND}/api/listings/${listingId}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${brokerToken}` },
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
