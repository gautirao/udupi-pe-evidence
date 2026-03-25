# Auth Strategy Decision — MVP

**Date:** 2026-03-25
**Status:** Approved
**Supersedes:** Earlier assumption that MSG91 SMS OTP was a launch blocker (issue #552)

## 1. Executive recommendation

**Primary auth: Google Sign-In. Fallback: Email OTP / magic link. Phone collected later in profile, not as an auth gate. SMS OTP removed from MVP scope.**

## 2. Why the direction changed

The original MVP plan assumed phone OTP (via MSG91 SMS) was required for launch. Research into India's telecom regulatory landscape revealed this creates significant launch friction:

- **DLT registration** (mandatory for all SMS in India including OTP) requires 3 separate registrations (entity, header, template), each taking 3-7 business days. Total: 7-15 days before the first OTP can be sent.
- **Document rejection** is the #1 cause of delays — name mismatches between PAN/GST/COI cause rejections.
- **Template rigidity** — changing OTP message wording requires re-approval (3-7 days).
- **Aggregators don't bypass DLT** — MSG91/Gupshup require your own entity registration.
- **Cost** — while per-SMS costs are low (INR 0.19-0.25 via MSG91), the operational overhead is disproportionate for an MVP.

Google Sign-In eliminates all of this: zero regulatory burden, zero cost, hours to set up, and 82%+ reach in India (Gmail penetration).

## 3. Options considered

### SMS OTP (via MSG91)
- **Pro:** Strongest identity signal in India (phone = Aadhaar-linked). Familiar UX. Works on all devices.
- **Con:** DLT registration overhead (7-15 days). Template rigidity. Operational complexity. Cost per OTP.
- **Verdict:** Deferred to Phase 2. Not justified for MVP given the setup overhead.

### WhatsApp OTP (via MSG91)
- **Pro:** No DLT required. Cheaper than SMS (INR 0.13/msg). High trust in India. Fast delivery.
- **Con:** Requires Meta Business verification (1-14 days). BSP setup. Requires internet. 70-75% delivery rate (offline users).
- **Verdict:** Deferred to Phase 1.5. Better than SMS for India (no DLT), but still adds MVP complexity without proportionate value.

### Email OTP / magic links (Supabase native)
- **Pro:** Zero cost. Zero setup. Built into Supabase.
- **Con:** Weak as primary for Indian consumer apps. Users have Gmail but don't actively check email for OTPs. Not the norm for Indian marketplaces.
- **Verdict:** Good fallback. Not suitable as primary.

### Google Sign-In
- **Pro:** Free. Hours to set up. Highest conversion (20-35% improvement over OTP). 82% India reach (Gmail). One-tap mobile UX. Rich profile data (name, email, photo) from day 1.
- **Con:** Doesn't verify a phone number. Requires Google account. No phone-based identity signal.
- **Verdict:** Best primary auth for MVP.

### Truecaller SDK
- **Pro:** Free phone verification with zero DLT. 180M+ Indian users. Used by MagicBricks, Flipkart.
- **Con:** Only works for users with Truecaller installed. Not a universal auth method.
- **Verdict:** Worth evaluating for Phase 2 as a frictionless phone verification add-on.

## 4. MVP auth strategy

| Layer | Method | Rationale |
|-------|--------|-----------|
| **Primary auth** | Google Sign-In | Free, instant setup, highest conversion, 82%+ India reach |
| **Fallback auth** | Email + password (current) + Email OTP | Already implemented. Catches non-Google users. |
| **Phone collection** | Profile completion step | "Add your phone number to receive booking updates" — optional, not an auth gate |
| **Trust badge OTP** | Stub provider for soft launch | Badges are a trust signal, not an auth gate. Manual admin badge grant as MVP fallback. |

### What is explicitly NOT in MVP
- SMS OTP for login or signup
- WhatsApp OTP for login or signup
- MSG91 integration
- Phone number as a required field for any user flow

## 5. Phase 1.5 / post-MVP auth roadmap

### Phase 1 — MVP (now)
- Google Sign-In + email+password + email OTP
- Phone collected optionally in profile
- Trust OTP on stub provider
- Admin can manually grant trust badges

### Phase 1.5 — Post-validation (50-100 active users)
- Add WhatsApp OTP via MSG91 for trust badge verification only (not login)
- Start DLT registration process in parallel
- Add WhatsApp notifications (booking confirmations, listing approvals)

### Phase 2 — Scale (1000+ users)
- WhatsApp OTP as optional login method
- SMS OTP as fallback (DLT registered by now)
- Phone verification required for brokers
- Truecaller SDK evaluation

## 6. Implications for trust verification in MVP

The trust verification system currently uses `OtpProvider` for Identity and Authority badges. With the stub provider:

- **Identity badge:** Stub OTP works for development/testing. For production soft launch, admin can manually grant Identity badges for early users, OR the stub can remain active with the understanding that the OTP code is "123456" (acceptable for a controlled soft launch with known early users).
- **Authority badge (owner path):** Same as Identity — stub or manual grant.
- **Authority badge (broker path):** Uses document upload (mandate review), NOT OTP. Unaffected by this decision.
- **Location, Photos badges:** Use GPS/photo upload, NOT OTP. Unaffected.

**Bottom line:** Trust badges are degraded but not broken in MVP. The manual admin grant path provides a workable fallback for the soft launch period.

## 7. Implications for analytics / measuring registered users

| Metric | Impact |
|--------|--------|
| Unique user count | Reliable — Google enforces phone verification on accounts internally |
| Growth reporting | Clean — one user per Google account |
| Fake account risk | Low — Google's own fraud detection applies |
| Signup conversion | Better than OTP flows (20-35% improvement) |
| Phone-verified user count | Deferred — will have this metric once WhatsApp OTP is added in Phase 1.5 |
| Investor credibility | Good for MVP. Phone-verified count is stronger for later fundraising rounds. |

## 8. Explicit note on prior assumption

**This decision supersedes the earlier assumption that MSG91 SMS OTP (issue #552) was a Sprint 31 launch blocker.** Issue #552 is reclassified as post-MVP (Phase 1.5). The OTP provider stub is acceptable for MVP soft launch.

## 9. Sources

- DLT registration requirements: TRAI TCCCPR 2018, verified via MSG91/2Factor.in/CoreFactors documentation
- Gmail penetration India: 82.4% (Sci-Tech-Today 2025)
- Google Sign-In conversion impact: 20-35% improvement (LoginRadius, InfluenceFlow)
- WhatsApp auth pricing India: INR 0.13/message (Meta official, effective 2025)
- MSG91 SMS pricing: INR 0.19-0.25/OTP (MSG91 pricing page)
- Truecaller SDK: 7B+ sign-up requests, 45K+ apps (Business Standard Nov 2024)
- Supabase auth: supports Google OAuth natively (Supabase docs)
