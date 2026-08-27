import { User } from '@supabase/supabase-js';

/** Compute role-aware default landing target for a logged-in user. */
export function getRoleAwareDefaultLanding(
  user: User | null,
  isAdmin: boolean,
  isBroker: boolean
): string {
  if (!user) return '/discover';
  if (isAdmin) return '/admin/listings/pending';
  if (isBroker) {
    const hasPhone = Boolean(user.phone || user.user_metadata?.phone);
    if (!hasPhone && user.user_metadata?.broker_setup_incomplete) {
      return '/broker/setup';
    }
    return '/broker/dashboard';
  }
  const isCreatedRecently = user.created_at
    ? Date.now() - new Date(user.created_at).getTime() < 120000
    : false;
  const onboardingDone =
    user.user_metadata?.onboarding_completed ||
    (typeof window !== 'undefined' && localStorage.getItem(`onboarding_done_${user.id}`));

  if (isCreatedRecently && !onboardingDone) {
    return '/onboarding';
  }
  return '/discover';
}

/** Sanitise returnTo URL parameter. */
export function getSafeReturnTo(rawReturnTo: string | null | undefined): string | null {
  if (!rawReturnTo) return null;

  // Normalise backslashes to forward slashes before validating: browsers
  // historically treat a leading "/\" the same as "//" (protocol-relative),
  // so "/\evil.com" and "/\/evil.com" must be judged as if they were "//evil.com".
  // Also strip ASCII tab/CR/LF, matching the WHATWG URL parser's own stripping
  // behaviour — without this, "/ht\ntp://evil.com" breaks the contiguous
  // scheme-char regex below and would otherwise pass through unrejected.
  const normalized = rawReturnTo.replace(/\\/g, '/').replace(/[\t\r\n]/g, '');

  if (!normalized.startsWith('/') || normalized.startsWith('//')) {
    return null;
  }

  // Reject any scheme-like prefix immediately after the leading slash
  // (e.g. "/http://evil.com", "/HTTP://evil.com", "/javascript:alert(1)"),
  // matched case-insensitively since URL schemes are case-insensitive.
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized.slice(1))) {
    return null;
  }

  return rawReturnTo;
}
