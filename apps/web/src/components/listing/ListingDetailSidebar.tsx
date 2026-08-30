import { Link } from 'react-router-dom';
import { Check, Heart, TrendingUp, ChevronRight } from 'lucide-react';
import { AreaMarketWidget } from '@/components/listing/AreaMarketWidget';
import { ViewingRequestPanel } from '@/components/listing/ViewingRequestPanel';
import { districtToCitySlug } from '@/lib/localityUtils';
import { slugifyFromAreaKey } from '@/lib/areaSlug';
import { cn } from '@/lib/utils';
import { PropertyListing } from '@/hooks/usePropertyListings';
import type { PublicListingDetail } from '@/pages/ListingDetail';
import type { User } from '@supabase/supabase-js';

export interface ListingDetailSidebarProps {
  listing: PublicListingDetail;
  user: User | null;
  onShare: () => void;
  /** Save/favourite state + toggle (owned by ListingDetail; unchanged local behaviour — D1). */
  saved: boolean;
  onToggleSaved: () => void;
}

export function ListingDetailSidebar({
  listing,
  user,
  saved,
  onToggleSaved,
}: ListingDetailSidebarProps) {
  // ── Area Insights CTA: derive canonical /trends/{citySlug}/areas/{areaSlug} ──
  // areaKey format: IN|KA|{district}|{locality} — must have ≥ 4 pipe segments with a
  // non-empty last segment AND a known district in DISTRICT_TO_CITY_SLUG.
  // If derivation fails, hide the CTA to avoid a broken/undrivable link (R2).
  const localityInsights = (() => {
    const key = listing.areaKey;
    if (!key) return null;
    const parts = key.split('|');
    if (parts.length < 4) return null;
    const district = parts[2];
    const localitySegment = parts[3];
    if (!localitySegment) return null;
    const citySlug = districtToCitySlug(district);
    if (!citySlug) return null;
    const areaSlug = slugifyFromAreaKey(key);
    if (!areaSlug) return null;
    return { localityName: localitySegment, citySlug, areaSlug };
  })();

  const verifiedBroker = listing.sellerType === 'broker';

  return (
    <div className="space-y-4 md:sticky md:top-4 md:self-start">
      {/* ── Request a viewing time — fully inline (no modal); anon buyers get the
          same interactive panel (Option A, #1797) ─────────────────────────── */}
      <section id="viewing-request-panel" className="rounded-2xl border border-border bg-card p-5 scroll-mt-20">
        <ViewingRequestPanel listingId={listing.id} user={user} />

        {verifiedBroker && (
          <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-evergreen" aria-hidden="true" />
            Listed by a verified broker. We pass your request on — no numbers shared until you both agree.
          </p>
        )}

        {/* Save listing — reuses the existing local save toggle (D1: behaviour unchanged) */}
        <button
          type="button"
          onClick={onToggleSaved}
          aria-pressed={saved}
          className="mt-4 flex w-full items-center justify-center gap-2 border-t border-border pt-3 text-sm font-medium text-foreground transition-colors hover:text-primary"
        >
          <Heart className={cn('h-4 w-4', saved && 'fill-current text-rose-500')} aria-hidden="true" />
          {saved ? 'Saved' : 'Save listing'}
        </button>
      </section>

      {/* ── Area insights — dark navy promo card ────────────────────────────── */}
      {localityInsights && (
        <section className="rounded-2xl border border-primary bg-primary p-5 text-primary-foreground">
          <div className="mb-2 flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-copper">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
            Area insights
          </div>
          <h2 className="font-serif text-lg font-semibold">
            See area insights for {localityInsights.localityName}
          </h2>
          <p className="mt-1 text-sm text-primary-foreground/70">
            Price context, how active the market is, nearby schools and whether{' '}
            {localityInsights.localityName} fits what you're looking for.
          </p>
          <Link
            to={`/trends/${localityInsights.citySlug}/areas/${localityInsights.areaSlug}`}
            data-testid="locality-insights-link"
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-copper hover:underline"
          >
            View trends in this area
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      )}

      {/* AreaMarketWidget still expects the snake_case PropertyListing shape; the cast is
          safe because the widget degrades gracefully (renders "Not enough data"). */}
      <AreaMarketWidget listing={listing as unknown as PropertyListing} />
    </div>
  );
}
