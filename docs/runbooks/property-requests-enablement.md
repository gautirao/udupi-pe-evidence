# Property requests: enablement runbook (#1793)

The "request this property" card (public POST) and the admin reader are dark by default. This runbook
covers the two flags, what must be true before turning them on, the checks to run after a deploy, and
how to run the optional end-to-end spec. **Production default: OFF.** Nothing below should be applied
to production without an explicit owner decision.

## 1. The two flags

| Layer | Setting | Default | Effect when off |
|---|---|---|---|
| Backend | env `PROPERTY_REQUESTS_ENABLED` (property `app.property-requests.enabled`, see `apps/api/src/main/resources/application.yml`) | `false` | `POST /api/public/property-requests` does not exist: it answers 404 and the public controller and the key guard are not wired. |
| Frontend | build-time `VITE_PROPERTY_REQUESTS_ENABLED` | `false` | The request card is not rendered and the `/admin/property-requests` route is hidden. |

Notes:
- The admin list `GET /api/admin/property-requests` is admin-only and is **not** behind the backend
  flag; it returns `phoneMasked` only. The frontend flag hides the admin screen, not the endpoint.
- `VITE_*` values are baked in at build time: changing the frontend flag needs a rebuild/redeploy of
  the frontend, not just an env edit.

## 2. Prerequisites before enabling (all required)

1. **#2792 retention purge.** Rows carry `retain_until` (12 months); the purge job
   (`PropertyRequestRetentionJob`, section 8) deletes expired rows and ships with the backend. Also have the deletion-email process ready for
   `remove-my-search@propertysignal.in` (a person asking to remove their search must be actioned).
2. **#2793 per-client rate limit / client-IP hardening.** Per-client limiting behind Render/Cloudflare
   is unresolved (the rightmost `X-Forwarded-For` entry may be a proxy hop). Limits are in-memory,
   per instance (`app.ratelimit.property-request.*` in `application.yml`). Resolve #2793, or
   deliberately raise the limits, before enabling.
3. **A real `PHONE_ENCRYPTION_KEY`**: Base64 of exactly 32 bytes, **no surrounding whitespace or
   newline**. The development fallback key is refused at startup when the backend flag is on.
4. The **V146** migration is applied (re-check its version against `main`).

## 3. Key rotation caveat (phone encryption)

Phones are stored AES-256-GCM encrypted (`phone_enc`, prefix `ENC:`) under `PHONE_ENCRYPTION_KEY`.
`phone_hash` is a keyed HMAC under the same key (used only for rate limiting).

If the key is changed, **rows written under the old key can no longer be decrypted. There is no
re-encryption job; they stay unreadable.** What happens to them (VERIFIED by
`PropertyRequestPersistenceIT#undecryptableRowDoesNotBreakAdminList`, which writes one row's ciphertext
under a different key straight through JDBC):

- Before this change, one such row made `PropertyRequestService#listRecent` throw
  (`JpaSystemException: Error attempting to apply AttributeConverter`), so the **whole admin list
  failed**.
- Now (`propertyrequest/TolerantPhoneConverter`), the list still returns every row; the unreadable row
  shows `phoneMasked = "unavailable"` (never ciphertext or digits), and the service logs a WARN with a
  count only. Those contacts are **lost for follow-up**: rotate the key only if that is acceptable, or
  contact those requesters from another source first.
- New rows are written under the new key and read normally. `phone_hash` of old rows differs from new
  hashes of the same number, so per-phone rate limiting does not carry across a rotation (in-memory
  anyway).
- `PhoneEncryptionConverter` itself is unchanged: other users of it (outside property requests) are
  not affected by this tolerance.

## 4. Backend ops checks (from the PR-B work)

The startup guard (`PropertyRequestEncryptionKeyGuard`, key resolution in `PhoneKeyResolver`) fails the
app closed when the flag is on and the key is wrong. Before deploying with the flag on, check:

- `SPRING_MAIN_LAZY_INITIALIZATION` is **unset** (the controller depends on the guard so it still runs
  under lazy init, but do not rely on that).
- **No conflicting key sources.** `PHONE_ENCRYPTION_KEY` (environment) is the only source. Do not also
  set `SECURITY_PHONE_ENCRYPTION_KEY`, `SPRING_APPLICATION_JSON` (with `security.phone.encryption-key`),
  `--security.phone.encryption-key`, or `-Dsecurity.phone.encryption-key`: the guard refuses a Spring
  property that disagrees with the key the converter really uses.
- **Never an empty `PHONE_ENCRYPTION_KEY`.** A blank value is treated as unset and the dev fallback
  would apply (the guard then refuses to start).
- `SERVER_FORWARD_HEADERS_STRATEGY` is **unset** (client-IP handling is part of #2793).
- **Do not set `org.springframework.web` to DEBUG in production**
  (`LOGGING_LEVEL_ORG_SPRINGFRAMEWORK_WEB`): a malformed-body DEBUG line can quote request input,
  which could include a submitted phone number.
- **Post-deploy flag-off check (when deploying with the flag still OFF):** `POST` to
  `/api/public/property-requests` must return **404**. Do this on every deploy that ships this code
  before the flag is turned on. Merged is not deployed: confirm the backend deploy actually finished.

## 5. Free-text phone rejection (new)

`requirement`, `areaLabel` and `city` on the public POST reject phone-like content server-side:
**400** `{"error":"VALIDATION_FAILED","fields":[{"field":"<requirement|areaLabel|city>","message":"Please enter contact numbers only in the Phone / WhatsApp field."}]}`.
No row is written, and the submitted digits are not echoed in the response or logged.

The rule is `ContactNumberRule.containsContactNumber` in
`apps/api/src/main/java/com/example/realestate/propertyrequest/ContactNumberRule.java`
(constraint `@NoContactNumber`; tests `ContactNumberRuleTest`): find maximal groups of ASCII digits
joined only by space, `.`, `-`, `(` or `)`, split each group into digit chunks (runs between separators),
and reject if any contiguous span of chunks concatenates to exactly 10 digits starting 6-9, or 12 digits
starting `91` then 6-9, or 11 digits starting `0` then 6-9 (a leading `+` is allowed). So two numbers
joined by spaces (`9876543210 9123456780`) are rejected. Range exemption: a span of 2 or more chunks is
treated as a rounded range (not tested against the shapes) only if ALL of its chunks end in `00`
(`60000-75000`, `80000 - 95000`, `65000 75000`). Otherwise the normal shape test applies, so
`98765 43200` and `+91 98765 43200` are rejected; single-chunk spans are never exempt (`9876543200`
is rejected). Spans stop growing past 12 digits, so the work is bounded (about 12 steps per chunk),
with no regex, and chunk bookkeeping grows with the chunk count, not the input length. Known limits:
- A number split so that every chunk ends in `00` (`98700 43200`) is accepted (slip).
- A 6-digit pincode followed by a number (`pin 600028 1200 sqft`) is rejected.
- Short-chunk concatenations that form a phone shape (`98765 4 3210`) are rejected.
- Full-width digits and other separators (NBSP, `/`, `_`, zero-width characters) are not separators;
  numbers split that way are not detected (known LOW gap, follow-up).

Prices, BHK counts, years and pincodes pass. The dedicated phone field is unchanged.

## 6. Enablement order

1. Prerequisites in section 2 done; section 4 checks green on the target environment.
2. Deploy backend with the flag **off**; run the 404 check.
3. Set `PROPERTY_REQUESTS_ENABLED=true` on the backend; confirm startup passes the guard and a test
   POST returns 201 (use a number you control; remove the row afterwards via the deletion process).
4. Build and deploy the frontend with `VITE_PROPERTY_REQUESTS_ENABLED=true`.
5. Watch logs for the `undecryptable phone` WARN and rate-limit rejections.

Rollback: set `PROPERTY_REQUESTS_ENABLED=false` (route returns 404 again) and rebuild the frontend with
the flag off. Stored rows remain and stay subject to retention.

## 7. Running the PR-C end-to-end spec (optional, not a release blocker)

`e2e/discover/property-request-card.spec.ts` exercises the card and the admin screen against a real
backend. It is skipped unless `PROPERTY_REQUEST_E2E=1`. It needs an **isolated fixture stack** and must
never run against a shared or hosted database:

- a throwaway Postgres container (not any hosted/shared database) for the backend;
- both flags on: backend `PROPERTY_REQUESTS_ENABLED=true` and frontend `VITE_PROPERTY_REQUESTS_ENABLED=true`;
- a throwaway `PHONE_ENCRYPTION_KEY` generated just for the run (32 random bytes, Base64; never the dev
  key, never a production key);
- an admin JWT minted by a local issuer that the throwaway backend is configured to trust (no real
  account or production secret).

Then run the spec with the project's local E2E runner from inside the worktree you are testing,
selecting the `full` project (the default `smoke` project does not include this spec) and one worker.
Discard the containers and key afterwards.

## 8. Retention purge (#2792)

`PropertyRequestRetentionJob` hard-deletes expired `property_requests` rows (encrypted buyer phone is PII).

- **Schedule:** daily at 03:00 UTC.
- **Predicate:** `retain_until < now()` (exclusive; a row exactly at the cutoff is kept). The period is the
  V146 `retain_until` column default (`now() + 12 months`); there is no second period in Java.
- **Batching:** 500 rows per statement, each batch its own transaction, looped until a short batch.
- **Metric:** counter `property_requests.retention.rows_purged` (no tags), emitted on every run including zero-row runs.
- **Logs:** counts and cutoff only (`... starting cutoff=...`, `... completed totalDeleted=N cutoff=...`); never row content.
- **Flag independence:** runs regardless of `PROPERTY_REQUESTS_ENABLED`, so rows from an enabled period still expire after rollback.
- **Manual read-only check** (should be 0 after the day's 03:00 UTC run; rows expiring later in the day
  are not yet purged, so do not compare against `now()`):

  ```sql
  SELECT count(*) FROM property_requests WHERE retain_until < date_trunc('day', now()) + interval '3 hours';
  ```
- **No failure signal (follow-up, not implemented):** the job raises no alert on exceptions. Suggested
  alert: no `property_requests_retention_rows_purged` datapoint, or no "retention purge completed" log
  line, for more than 25h.
- **Backups:** backups, PITR and dev copies keep expired rows until their own rotation. The 12-month
  guarantee covers the live table only.
