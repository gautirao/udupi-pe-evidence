import { Loader2 } from 'lucide-react';
import { RoleAwareHeader } from '@/components/layout/AppLayout';
import { useLandingPageState } from './landing/useLandingPageState';
import { LandingHero } from './landing/LandingHero';
import { TrendingLocalitiesSection } from './landing/TrendingLocalitiesSection';
import { LandingFeaturesSection } from './landing/LandingFeaturesSection';
import { LandingTrustSection } from './landing/LandingTrustSection';
import { LandingAreaOverviewSection } from './landing/LandingAreaOverviewSection';
import { LandingCtaSection } from './landing/LandingCtaSection';

// ────────────────────────────────────────────────────────────────────────────
// Honest curated early-access marketing content (Issue #1792).
//
// Guiding rule: nothing on this page may state a number or a verification claim
// the platform cannot substantiate at render time. Listing/area counts come
// live from GET /api/discover/summary; when that is loading, errored, or zero,
// the page falls back to non-numeric early-access copy — never a fabricated or
// placeholder number, and never a "verified" claim the data cannot back.
//
// The Trending Localities section prefers live data and, when no live areas are
// available, shows a non-numeric early-access note — it never renders hardcoded
// (e.g. Bangalore) fallback localities.
//
// Issue #2399: this page is a composition root only. Home interaction/nav
// state lives in useLandingPageState; hero, trending/localities, and each
// independent content section own their own cohesive boundary — see
// apps/web/src/pages/landing/ for the responsibility map.
// ────────────────────────────────────────────────────────────────────────────

function SiteHeader({ selectedCity }: { selectedCity?: string }) {
  return <RoleAwareHeader selectedCity={selectedCity} />;
}

export default function LandingPage() {
  const { selectedCity, setSelectedCity, locality, setLocality, showAuthLoader, handleExplore } =
    useLandingPageState();

  if (showAuthLoader) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader selectedCity={selectedCity} />

      <LandingHero
        selectedCity={selectedCity}
        onSelectCity={setSelectedCity}
        locality={locality}
        onLocalityChange={setLocality}
        onExplore={handleExplore}
      />

      <LandingFeaturesSection />

      <TrendingLocalitiesSection selectedCity={selectedCity} />

      <LandingTrustSection />

      <LandingAreaOverviewSection selectedCity={selectedCity} />

      <LandingCtaSection selectedCity={selectedCity} />
    </div>
  );
}
