import { useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, format } from 'date-fns';
import { Phone, Check, Heart, MessageCircle, TrendingUp, Calendar, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AreaMarketWidget } from '@/components/listing/AreaMarketWidget';
import { SignInGateCard } from '@/components/auth/SignInGateCard';
import { districtToCitySlug } from '@/lib/localityUtils';
import { slugifyFromAreaKey } from '@/lib/areaSlug';
import { cn } from '@/lib/utils';
import { TIME_SLOTS } from '@/hooks/useBookings';
import { PropertyListing } from '@/hooks/usePropertyListings';
import type { PublicListingDetail } from '@/pages/ListingDetail';
import type { User } from '@supabase/supabase-js';

/** Format '09:00-10:00' → '9 AM', '14:00-15:00' → '2 PM' */
function formatTimeLabel(slot: string): string {
  const hour = parseInt(slot.split('-')[0].split(':')[0], 10);
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

export interface ListingDetailSidebarProps {
  listing: PublicListingDetail;
  user: User | null;
  /** Opens the viewing-request modal, optionally seeded with a preferred date (yyyy-MM-dd) and time slot. */
  onOpenBookingModal: (date?: string, time?: string) => void;
  onShare: () => void;
  /** Save/favourite state + toggle (owned by ListingDetail; unchanged local behaviour — D1). */
  saved: boolean;
  onToggleSaved: () => void;
}

const DATE_PILL_COUNT = 5;

export function ListingDetailSidebar({
  listing,
  user,
  onOpenBookingModal,
  saved,
  onToggleSaved,
}: ListingDetailSidebarProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  function handleDateSelect(iso: string) {
    if (selectedDate === iso) {
      setSelectedDate(null);
      setSelectedTime(null);
    } else {
      setSelectedDate(iso);
      setSelectedTime(null); // reset time when switching date
    }
  }

  // Next 5 days as quick-pick pills. Selecting one reveals time slots inline so the
  // buyer can pick date + time before opening the modal (D3-A preserved).
  const today = new Date();
  const datePills = Array.from({ length: DATE_PILL_COUNT }, (_, i) => {
    const d = addDays(today, i);
    return {
      iso: format(d, 'yyyy-MM-dd'),
      weekday: i === 0 ? 'Today' : i === 1 ? 'Tom' : format(d, 'EEE'),
      dayNum: format(d, 'd'),
    };
  });

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
      {/* ── Request a viewing time ──────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-serif text-lg font-semibold text-foreground">Request a viewing time</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a preferred day and time in the next 2 weeks — the lister confirms the final slot.
        </p>

        {/* Quick-pick day pills */}
        <div className="mt-4 grid grid-cols-5 gap-2">
          {datePills.map((p) => {
            const active = selectedDate === p.iso;
            return (
              <button
                key={p.iso}
                type="button"
                onClick={() => handleDateSelect(p.iso)}
                aria-pressed={active}
                disabled={!user}
                className={cn(
                  'flex flex-col items-center rounded-lg border px-1 py-2 text-center transition-colors',
                  active
                    ? 'border-copper bg-copper-tint text-foreground'
                    : 'border-border bg-card hover:bg-muted',
                  !user && 'cursor-not-allowed opacity-60',
                )}
              >
                <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                  {p.weekday}
                </span>
                <span className="text-sm font-semibold">{p.dayNum}</span>
              </button>
            );
          })}
        </div>

        {user ? (
          <>
            {/* Time slots — appear once a day is picked */}
            {selectedDate && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Pick a preferred time
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {TIME_SLOTS.map((slot) => {
                    const timeActive = selectedTime === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setSelectedTime(timeActive ? null : slot)}
                        aria-pressed={timeActive}
                        className={cn(
                          'rounded-lg border px-2 py-1.5 text-center text-xs font-medium transition-colors',
                          timeActive
                            ? 'border-copper bg-copper-tint text-foreground'
                            : 'border-border bg-card text-foreground hover:bg-muted',
                        )}
                      >
                        {formatTimeLabel(slot)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => onOpenBookingModal(undefined, undefined)}
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Calendar className="h-3.5 w-3.5" />
              Choose another date
            </button>

            <Button
              className="mt-3 w-full bg-copper text-copper-foreground hover:bg-copper-hover"
              disabled={!selectedDate || !selectedTime}
              onClick={() => onOpenBookingModal(selectedDate ?? undefined, selectedTime ?? undefined)}
              data-testid="request-viewing-btn"
            >
              <Calendar className="h-4 w-4 mr-2" />
              Request viewing time
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {selectedDate && selectedTime
                ? 'Confirm the booking in the next step.'
                : selectedDate
                ? 'Now pick a preferred time.'
                : 'Pick a day to see available times.'}
            </p>

            <Button
              variant="outline"
              className="mt-3 w-full"
              onClick={() => onOpenBookingModal(selectedDate ?? undefined, selectedTime ?? undefined)}
              data-testid="contact-broker-btn"
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Contact broker
            </Button>
          </>
        ) : (
          <div className="mt-4">
            <SignInGateCard
              variant="card"
              description="Sign in to request a viewing or contact the lister"
              ctaLabel="Sign in to request a viewing"
              returnTo={`/listing/${listing.id}`}
            />
          </div>
        )}

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

      {/* Direct phone (authed + number present) — honest tel: path, never leaked to anon */}
      {user && listing.contact_phone && (
        <section
          className="rounded-2xl border border-green-200 bg-green-50/50 p-5 dark:bg-green-950/20"
          data-testid="contact-phone-section"
        >
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
            <Phone className="h-4 w-4 text-green-600" />
            Contact
          </h2>
          <a
            href={`tel:${listing.contact_phone}`}
            className="mb-3 block text-xl font-bold text-green-600 hover:underline"
          >
            {listing.contact_phone}
          </a>
          <Button asChild className="w-full bg-green-600 hover:bg-green-700">
            <a href={`tel:${listing.contact_phone}`}>
              <Phone className="h-4 w-4 mr-2" />
              Call Now
            </a>
          </Button>
        </section>
      )}

      {user && listing.contact_info && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-2 text-base font-semibold">Additional Contact Info</h2>
          <p className="text-sm text-muted-foreground">{listing.contact_info}</p>
        </section>
      )}
    </div>
  );
}
