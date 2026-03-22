=== ROLLING CHECKPOINT START ===
Sprint: Sprint 28 — Trust UX + Photo Verification
GitHub Project: RE Trends (project 1, PVT_kwHOAAVnaM4BSWI7)

Sprint iteration ID: cdfcfe9d

Previously completed: RE-157 ✅ PR #547 | RE-154 ✅ PR #548 | RE-155 ✅ PR #549 | RE-156 ✅ PR #550 | RE-160 ✅ PR #551 | RE-162 ✅ PR #554

Remaining execution order: RE-159 | RE-158 | RE-161 | RE-163

Dependencies:
- RE-161 depends on RE-158 [OtpProvider interface]
- RE-163 depends on all prior [needs badge submissions + photo storage]

Pre-review flags:
- RE-158: security-reviewer required (OTP, PII, StubOtpProvider gating)
- RE-161: security-reviewer required (mandate upload, storage RLS)
- RE-163: security-reviewer required (admin-only endpoints)

Key decisions:
- OTP: StubOtpProvider behind OtpProvider interface; MSG91 deferred to issue #552
- OTP config: random 6-digit, WARN-logged, 10-min TTL, max 5 verify attempts, max 3 sends/phone/hour
- Identity: profile-level (phone_verified=true satisfies IDENTITY across all listings)
- GPS threshold: 200 meters
- Badge revocation: EARNED → AVAILABLE (SUSPENDED for admin/fraud only)
- RE-163 photo storage: V52 adds verification_asset_url to listing_verification_dimension
- Flyway ceiling: V51; V52 claimed by RE-163

Status: IN PROGRESS — RE-159 next

Next PR: RE-159
=== ROLLING CHECKPOINT END ===
