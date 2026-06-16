/**
 * AgriListingDetail — agricultural listing detail page (RE: Figma /agri-listing redesign).
 *
 * Renders the premium two-column real-estate detail layout that matches the
 * Figma reference. Used ONLY for `propertyType === 'agricultural_land'`; all
 * other property types continue to use the legacy ListingDetail layout, so
 * existing tests and behaviour for those types are unaffected.
 *
 * Functionality preserved / reused (not reimplemented):
 *   - Plot boundary map  → ListingDetailBoundaryMap
 *   - Nearby essentials  → NearbyPois
 *   - Nearby schools     → useNearbySchools hook
 *   - "More in {locality}" → SimilarListings
 *   - Area market widget → AreaMarketWidget
 *   - Request Viewing / Contact Broker / Copy Link / Open in Maps / View Trends
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Camera,
  Share2,
  Heart,
  Check,
  MapPin,
  ExternalLink,
  Ruler,
  IndianRupee,
  Coins,
  Sprout,
  Droplets,
  Route,
  GraduationCap,
  TrendingUp,
  BarChart3,
  Calendar,
  Copy,
  Map as MapIcon,
  Clock,
  FileText,
  AlertTriangle,
  Info,
  Lock,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ListingDetailBoundaryMap } from '@/components/listing/ListingDetailBoundaryMap';
import { NearbyPois } from '@/components/poi/NearbyPois';
import { SimilarListings } from '@/components/listing/SimilarListings';
import { AreaMarketWidget } from '@/components/listing/AreaMarketWidget';
import { ListingGallery } from '@/components/listing/ListingGallery';
import { useNearbySchools } from '@/hooks/useSchoolSearch';
import { formatPrice, formatArea } from '@/lib/formatters';
import {
  WATER_SOURCE_LABELS,
  SOIL_TYPE_LABELS,
  ROAD_ACCESS_LABELS,
  CULTIVATION_STATUS_LABELS,
  OWNERSHIP_TYPE_LABELS,
} from '@/lib/agriFieldLabels';
import { formatListingId } from '@/lib/listing-id';
import { DISTRICT_TO_CITY_SLUG, DEFAULT_CITY } from '@/lib/localityUtils';
import { useToast } from '@/hooks/use-toast';
import type { PropertyImage, PropertyListing } from '@/hooks/usePropertyListings';
import type { PublicListingDetail } from '@/pages/ListingDetail';

// Forest-green accent matching the Figma reference. The app theme `primary`
// token is near-black navy, so agri CTAs/links use this scoped green instead.
// Expressed as Tailwind arbitrary-value classes so hover/focus states work via CSS.
const GREEN_BTN = 'bg-[#1b6b4a] hover:bg-[#15573b] text-white';
const GREEN_TEXT = 'text-[#1b6b4a]';
const GREEN_OUTLINE = 'text-[#1b6b4a] border-[#1b6b4a] hover:bg-[#1b6b4a]/5';

const ACRES_PER_HECTARE = 0.404686;

export interface AgriListingDetailProps {
  listing: PublicListingDetail;
  user: User | null;
  copied: boolean;
  onShare: () => void;
  onOpenBookingModal: () => void;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Convert a land area + unit to numeric acres (best-effort). */
function toAcres(area?: number | null, unit?: string | null): number | null {
  if (area == null) return null;
  const u = (unit ?? '').toLowerCase().trim();
  if (u.startsWith('acre')) return area;
  if (u.startsWith('cent')) return area / 100;
  if (u.startsWith('gunt')) return area / 40;
  if (u.startsWith('hect')) return area / ACRES_PER_HECTARE;
  return area; // assume acres when unit unknown
}

interface SectionCardProps {
  title?: string;
  titleIcon?: React.ReactNode;
  titleSuffix?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** White rounded card with subtle border used throughout the page. */
function SectionCard({ title, titleIcon, titleSuffix, children, className = '' }: SectionCardProps) {
  return (
    <section className={`rounded-2xl border border-border bg-card p-5 md:p-6 ${className}`}>
      {title && (
        <div className="mb-4 flex items-center gap-2">
          {titleIcon}
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {titleSuffix}
        </div>
      )}
      {children}
    </section>
  );
}

/** A small fact tile (icon + label + value) in the title card summary row. */
function FactTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

/** A label ↔ value row inside the grouped Property Overview card. */
function OverviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function OverviewGroup({
  heading,
  show,
  children,
}: {
  heading: string;
  /** Render the group only when at least one of its rows has a value. */
  show: boolean;
  children: React.ReactNode;
}) {
  if (!show) return null;
  return (
    <div className="mb-5 last:mb-0">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {heading}
      </p>
      <div>{children}</div>
    </div>
  );
}

// ── breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb({ locality, title }: { locality: string | null; title: string }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <li>
          <Link to="/" className="hover:text-foreground">Home</Link>
        </li>
        <li aria-hidden="true">/</li>
        <li>
          <Link to="/" className="hover:text-foreground">Discover</Link>
        </li>
        {locality && (
          <>
            <li aria-hidden="true">/</li>
            <li>
              <Link to="/" className="hover:text-foreground">{locality}</Link>
            </li>
          </>
        )}
        <li aria-hidden="true">/</li>
        <li aria-current="page" className="truncate font-medium text-foreground">{title}</li>
      </ol>
    </nav>
  );
}

// ── hero ─────────────────────────────────────────────────────────────────────

function HeroMedia({
  images,
  effectiveImageCount,
  isAnonymous,
  listingId,
  copied,
  onShare,
}: {
  images: PropertyImage[];
  effectiveImageCount: number;
  isAnonymous: boolean;
  listingId: string;
  copied: boolean;
  onShare: () => void;
}) {
  const { toast } = useToast();
  const [saved, setSaved] = useState(false);

  const actions = (
    <div className="absolute right-4 top-4 z-10 flex gap-2">
      <button
        type="button"
        onClick={onShare}
        aria-label="Share listing"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted"
      >
        {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={() => {
          setSaved((s) => !s);
          toast({ title: saved ? 'Removed from saved' : 'Saved', description: 'This listing was added to your saved items.' });
        }}
        aria-label={saved ? 'Remove from saved' : 'Save listing'}
        aria-pressed={saved}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted"
      >
        <Heart className={`h-4 w-4 ${saved ? 'fill-current text-rose-500' : ''}`} />
      </button>
    </div>
  );

  // When the listing has photos, reuse the existing gallery (keeps anon lock,
  // counters, thumbnails). Otherwise render the Figma empty-state hero.
  if (images.length > 0 || effectiveImageCount > 0) {
    return (
      <div className="relative">
        {actions}
        <ListingGallery
          images={images}
          effectiveImageCount={effectiveImageCount}
          isAnonymous={isAnonymous}
          listingId={listingId}
        />
      </div>
    );
  }

  return (
    <div className="relative mb-6 flex h-[320px] items-center justify-center rounded-2xl border border-border bg-muted/50 md:h-[360px]">
      {actions}
      <div className="text-center text-muted-foreground">
        <Camera className="mx-auto mb-3 h-10 w-10 opacity-50" aria-hidden="true" />
        <p className="font-medium text-foreground/80">Photos not uploaded yet</p>
        <p className="mt-1 text-sm">The seller hasn't added photos for this listing</p>
      </div>
    </div>
  );
}

// ── nearby schools (restyled, reuses the hook) ───────────────────────────────

function AgriNearbySchools({ listingId }: { listingId: string }) {
  const { data, isLoading, isError } = useNearbySchools(listingId, 3);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }
  if (isError || !data || data.count === 0) return null;

  return (
    <div className="mt-5 border-t border-border pt-5">
      <div className="mb-3 flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-foreground">Nearby Schools</h3>
        <span className="text-sm font-normal text-muted-foreground">
          ({data.count} within 3 km)
        </span>
      </div>
      <ul className="divide-y divide-border">
        {data.schools.map((school) => {
          const board = school.board ?? school.boardType;
          const distance =
            school.distanceKm < 1
              ? `${Math.round(school.distanceKm * 1000)} m`
              : `${school.distanceKm.toFixed(1)} km`;
          return (
            <li key={school.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-start gap-2.5">
                <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{school.name}</p>
                  {board && (
                    <span className="mt-1 inline-block rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {board}
                    </span>
                  )}
                </div>
              </div>
              <span className="shrink-0 text-sm text-muted-foreground">{distance}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── transparency (2×2 chip grid) ─────────────────────────────────────────────

function TransparencyChip({
  icon,
  text,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  text: string;
  tone?: 'neutral' | 'warning';
}) {
  const toneClass =
    tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-border bg-muted/40 text-muted-foreground';
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-sm ${toneClass}`}>
      <span className="shrink-0" aria-hidden="true">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

// ── sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({
  listing,
  user,
  priceDisplay,
  priceSubtitle,
  mapsHref,
  onShare,
  copied,
  onRequestViewing,
}: {
  listing: PublicListingDetail;
  user: User | null;
  priceDisplay: string | null;
  priceSubtitle: string | null;
  mapsHref: string | null;
  onShare: () => void;
  copied: boolean;
  onRequestViewing: () => void;
}) {
  const trendsHref = (() => {
    if (!listing.areaKey) return null;
    const parts = listing.areaKey.split('|');
    const trendCity = (parts[2] && DISTRICT_TO_CITY_SLUG[parts[2]]) ?? DEFAULT_CITY;
    return `/trends?city=${trendCity}&areaKey=${encodeURIComponent(listing.areaKey)}`;
  })();
  const localityName = listing.locality ?? 'this area';

  return (
    <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
      {/* Price + primary actions */}
      <div className="rounded-2xl border border-border bg-card p-5">
        {priceDisplay ? (
          <p className="text-3xl font-bold text-foreground">{priceDisplay}</p>
        ) : !user ? (
          <div
            className={`flex items-center gap-1.5 text-sm font-medium ${GREEN_TEXT}`}
            data-testid="agri-detail-price-signin"
          >
            <Lock className="h-4 w-4" aria-hidden="true" />
            <Link to={`/auth?returnTo=/listing/${listing.id}`} className="hover:underline">
              Sign in to view price
            </Link>
          </div>
        ) : null}
        {priceSubtitle && (
          <p className="mt-1 text-sm text-muted-foreground">{priceSubtitle}</p>
        )}

        <Button className={`mt-4 w-full ${GREEN_BTN}`} onClick={onRequestViewing}>
          Request Viewing
        </Button>
        <Button variant="outline" className="mt-2 w-full" onClick={onRequestViewing}>
          Contact Broker
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Broker will confirm availability and documentation
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={onShare} className="gap-1.5">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy Link'}
          </Button>
          {mapsHref ? (
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <a href={mapsHref} target="_blank" rel="noopener noreferrer">
                <MapIcon className="h-3.5 w-3.5" />
                Open in Maps
              </a>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled className="gap-1.5">
              <MapIcon className="h-3.5 w-3.5" />
              Open in Maps
            </Button>
          )}
        </div>
        {!user && (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            <Link to={`/auth?returnTo=/listing/${listing.id}`} className="underline hover:text-foreground">
              Sign in
            </Link>{' '}
            for full broker details
          </p>
        )}
      </div>

      {/* Locality Insights */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-2 flex items-center gap-2">
          <TrendingUp className={`h-4 w-4 ${GREEN_TEXT}`} aria-hidden="true" />
          <h2 className="font-semibold text-foreground">Locality Insights</h2>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          View market trends and insights for {localityName}
        </p>
        {trendsHref ? (
          <Button variant="outline" className={`w-full ${GREEN_OUTLINE}`} asChild>
            <Link to={trendsHref}>View Trends</Link>
          </Button>
        ) : (
          <Button variant="outline" className="w-full" disabled>
            View Trends
          </Button>
        )}
      </div>

      {/* Area Market (reuses existing widget; renders "Not enough data" empty state) */}
      <div className="[&>*]:rounded-2xl">
        <AreaMarketWidget listing={listing as unknown as PropertyListing} />
      </div>
    </div>
  );
}

// ── main ─────────────────────────────────────────────────────────────────────

export function AgriListingDetail({
  listing,
  user,
  copied,
  onShare,
  onOpenBookingModal,
}: AgriListingDetailProps) {
  const navigate = useNavigate();

  const title = listing.title || `Agricultural Land in ${listing.locality || 'Unknown Location'}`;

  // Synthesize the gallery image set the same way the legacy page does.
  const rawImages = listing.images || [];
  const images: PropertyImage[] =
    rawImages.length > 0
      ? rawImages
      : listing.primaryImageUrl
        ? [{ url: listing.primaryImageUrl, alt: 'Property image' }]
        : [];
  const effectiveImageCount =
    typeof listing.imageCount === 'number' ? listing.imageCount : images.length;

  // ── derived values ──
  const priceRupees =
    listing.pricePaise != null ? Math.round(listing.pricePaise / 100) : (listing.price ?? null);
  const acres = toAcres(listing.landArea, listing.landAreaUnit) ?? listing.computedAreaAcres ?? null;

  const landAreaDisplay =
    listing.landArea != null ? formatArea(listing.landArea, listing.landAreaUnit) : null;
  const priceDisplay = priceRupees != null && priceRupees > 0 ? formatPrice(priceRupees) : null;
  const perAcreDisplay =
    priceRupees != null && priceRupees > 0 && acres != null && acres > 0
      ? `${formatPrice(Math.round(priceRupees / acres))}/acre`
      : null;
  const hectaresDisplay = acres != null ? `~${(acres * ACRES_PER_HECTARE).toFixed(2)} hectares` : null;

  const priceSubtitle =
    perAcreDisplay && landAreaDisplay
      ? `${perAcreDisplay} · ${landAreaDisplay}`
      : perAcreDisplay ?? landAreaDisplay ?? null;

  const mapsHref =
    listing.latitude != null && listing.longitude != null
      ? `https://www.google.com/maps/search/${listing.latitude},${listing.longitude}`
      : null;

  const hasBoundaryDisclaimer = typeof listing.boundary === 'string' && listing.boundary.length > 0;

  const handleRequestViewing = () => {
    if (user) {
      onOpenBookingModal();
    } else {
      navigate(`/auth?returnTo=/listing/${listing.id}`);
    }
  };

  // Summary fact tiles (only render those with a value).
  const facts: { icon: React.ReactNode; label: string; value: string }[] = [];
  if (landAreaDisplay) facts.push({ icon: <Ruler className="h-3.5 w-3.5" />, label: 'Land Area', value: landAreaDisplay });
  if (priceDisplay) facts.push({ icon: <IndianRupee className="h-3.5 w-3.5" />, label: 'Total Price', value: priceDisplay });
  if (perAcreDisplay) facts.push({ icon: <Coins className="h-3.5 w-3.5" />, label: 'Per Acre', value: perAcreDisplay });
  if (listing.cultivationStatus) facts.push({ icon: <Sprout className="h-3.5 w-3.5" />, label: 'Cultivation', value: CULTIVATION_STATUS_LABELS[listing.cultivationStatus] ?? listing.cultivationStatus });
  if (listing.waterSource) facts.push({ icon: <Droplets className="h-3.5 w-3.5" />, label: 'Water Source', value: WATER_SOURCE_LABELS[listing.waterSource] ?? listing.waterSource });
  if (listing.roadAccess) facts.push({ icon: <Route className="h-3.5 w-3.5" />, label: 'Road Access', value: ROAD_ACCESS_LABELS[listing.roadAccess] ?? listing.roadAccess });

  // Anonymous users have price withheld by the backend (#1454). Show a locked
  // price tile in the summary grid instead of silently omitting it.
  const showPriceLocked = !user && priceDisplay === null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <Breadcrumb locality={listing.locality} title={title} />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── main column ── */}
        <div className="space-y-6 lg:col-span-2">
          <HeroMedia
            images={images}
            effectiveImageCount={effectiveImageCount}
            isAnonymous={!user}
            listingId={listing.id}
            copied={copied}
            onShare={onShare}
          />

          {/* Title + summary facts */}
          <SectionCard>
            <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
              Agricultural Land
            </span>
            <h1 className="mt-3 text-2xl font-bold text-foreground md:text-3xl">{title}</h1>
            {listing.listingNumber != null && (
              <p className="mt-1 font-mono text-sm text-muted-foreground">
                {formatListingId(listing.listingNumber)}
              </p>
            )}
            {listing.locality && (
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  {listing.locality}, Udupi District, Karnataka
                </span>
                {mapsHref && (
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 font-medium hover:underline ${GREEN_TEXT}`}
                  >
                    View on Google Maps
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}

            {(facts.length > 0 || showPriceLocked) && (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {facts.map((f) => (
                  <FactTile key={f.label} icon={f.icon} label={f.label} value={f.value} />
                ))}
                {showPriceLocked && (
                  <div
                    className="rounded-xl border border-border bg-card px-3 py-2.5"
                    data-testid="agri-detail-price-locked-tile"
                  >
                    <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
                      <IndianRupee className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="text-[11px] font-medium uppercase tracking-wide">Total Price</span>
                    </div>
                    <p className={`flex items-center gap-1 text-sm font-semibold ${GREEN_TEXT}`}>
                      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                      <Link to={`/auth?returnTo=/listing/${listing.id}`} className="hover:underline">
                        Sign in
                      </Link>
                    </p>
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          {/* Property Overview — grouped sections */}
          <SectionCard title="Property Overview">
            <OverviewGroup
              heading="Land Details"
              show={Boolean(landAreaDisplay || hectaresDisplay || listing.surveyNumber || !user)}
            >
              <OverviewRow label="Land Area" value={landAreaDisplay} />
              <OverviewRow label="Approx. Area" value={hectaresDisplay} />
              {listing.surveyNumber ? (
                <OverviewRow label="Survey Number" value={listing.surveyNumber} />
              ) : !user ? (
                <div
                  className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-b-0"
                  data-testid="agri-detail-survey-signin"
                >
                  <span className="text-sm text-muted-foreground">Survey Number</span>
                  <span className={`inline-flex items-center gap-1 text-sm font-medium ${GREEN_TEXT}`}>
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    <Link to={`/auth?returnTo=/listing/${listing.id}`} className="hover:underline">
                      Sign in to view
                    </Link>
                  </span>
                </div>
              ) : null}
            </OverviewGroup>

            <OverviewGroup
              heading="Agriculture Details"
              show={Boolean(listing.waterSource || listing.soilType || listing.cultivationStatus)}
            >
              <OverviewRow label="Water Source" value={listing.waterSource ? (WATER_SOURCE_LABELS[listing.waterSource] ?? listing.waterSource) : undefined} />
              <OverviewRow label="Soil Type" value={listing.soilType ? (SOIL_TYPE_LABELS[listing.soilType] ?? listing.soilType) : undefined} />
              <OverviewRow label="Cultivation Status" value={listing.cultivationStatus ? (CULTIVATION_STATUS_LABELS[listing.cultivationStatus] ?? listing.cultivationStatus) : undefined} />
            </OverviewGroup>

            <OverviewGroup
              heading="Access & Ownership"
              show={Boolean(listing.roadAccess || listing.ownershipType)}
            >
              <OverviewRow label="Road Access" value={listing.roadAccess ? (ROAD_ACCESS_LABELS[listing.roadAccess] ?? listing.roadAccess) : undefined} />
              <OverviewRow label="Ownership Type" value={listing.ownershipType ? (OWNERSHIP_TYPE_LABELS[listing.ownershipType] ?? listing.ownershipType) : undefined} />
            </OverviewGroup>

            {hasBoundaryDisclaimer && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  The boundary drawn on the map is approximate and should be legally verified before purchase.
                </span>
              </div>
            )}
          </SectionCard>

          {/* Plot Location & Boundary */}
          {listing.latitude != null && listing.longitude != null && (
            <SectionCard title="Plot Location &amp; Boundary">
              <div className="overflow-hidden rounded-xl border border-border">
                <ListingDetailBoundaryMap
                  boundary={listing.boundary}
                  lat={listing.latitude}
                  lng={listing.longitude}
                />
              </div>
              {mapsHref && (
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={mapsHref} target="_blank" rel="noopener noreferrer">View full map</a>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href={mapsHref} target="_blank" rel="noopener noreferrer">Open in Maps</a>
                  </Button>
                </div>
              )}
              <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                The boundary shown is approximate. Always verify with an official land survey before proceeding.
              </p>
            </SectionCard>
          )}

          {/* Listing Transparency */}
          <SectionCard title="Listing Transparency">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {typeof listing.daysOnMarket === 'number' && listing.daysOnMarket > 0 && (
                <TransparencyChip
                  icon={<Clock className="h-4 w-4" />}
                  text={`Listed ${listing.daysOnMarket} ${listing.daysOnMarket === 1 ? 'day' : 'days'} ago`}
                />
              )}
              {listing.lastUpdatedAt && (
                <TransparencyChip
                  icon={<Clock className="h-4 w-4" />}
                  text="Recently updated"
                />
              )}
              <TransparencyChip
                icon={<FileText className="h-4 w-4" />}
                text="Documentation should be verified"
                tone="warning"
              />
              <TransparencyChip
                icon={<AlertTriangle className="h-4 w-4" />}
                text="Boundary is approximate"
                tone="warning"
              />
            </div>
          </SectionCard>

          {/* Nearby Essentials (reuses NearbyPois) + Nearby Schools */}
          <SectionCard title="Nearby Essentials">
            <NearbyPois listingId={listing.id} propertyType={listing.propertyType} />
            <AgriNearbySchools listingId={listing.id} />
          </SectionCard>

          {/* More in {locality} */}
          <SimilarListings
            listingId={listing.id}
            locality={listing.locality}
            propertyType={listing.propertyType}
          />
        </div>

        {/* ── sidebar ── */}
        <Sidebar
          listing={listing}
          user={user}
          priceDisplay={priceDisplay}
          priceSubtitle={priceSubtitle}
          mapsHref={mapsHref}
          onShare={onShare}
          copied={copied}
          onRequestViewing={handleRequestViewing}
        />
      </div>
    </div>
  );
}
