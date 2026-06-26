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
  if (rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//') && !rawReturnTo.startsWith('/http')) {
    return rawReturnTo;
  }
  return null;
}
