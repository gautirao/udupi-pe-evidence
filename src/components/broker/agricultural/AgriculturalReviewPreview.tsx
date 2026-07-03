import { Sprout, Maximize, MapPin, ShieldCheck, Camera, Check, TriangleAlert } from 'lucide-react';
import { useListingImages } from '@/hooks/useListingImages';
import { formatPrice } from '@/lib/formatters';
import {
  WATER_SOURCE_LABELS,
  SOIL_TYPE_LABELS,
  ROAD_ACCESS_LABELS,
  CULTIVATION_STATUS_LABELS,
  OWNERSHIP_TYPE_LABELS,
  LAND_CATEGORY_LABELS,
} from '@/lib/agriFieldLabels';
import { FACING_OPTIONS } from '@/lib/listing-constants';
import { InlineNearby } from '@/components/broker/residential/InlineNearby';
import { StrengthMeter } from '@/components/broker/residential/StrengthMeter';
import type { ListingStrengthResult } from '@/lib/listingStrength';
import { computeAgriPriceBreakdown } from '@/components/broker/agricultural/priceMath';

// ---------------------------------------------------------------------------
// Issue #1627 — agricultural review-tile variant, sibling of
// commercial/CommercialReviewPreview.tsx (#1684). PURE PRESENTATION: hides
// missing optional fields (no fake defaults), and NEVER claims verification
// of survey number / RTC / ownership / crops — those are shown exactly as
// entered, with an explicit "not verified" note. The confirmed pin renders
// as LOCATION only, never implied as a legal/survey boundary (AC5).
// ---------------------------------------------------------------------------

interface ReviewTile {
  key: string;
  icon: typeof Sprout;
  label: string;
  value: string;
}

interface ReviewRow {
  key: string;
  label: string;
  value: string;
}

function labelFrom(map: Record<string, string>, code: string): string | undefined {
  return code ? map[code] : undefined;
}

export interface AgriculturalReviewFacts {
  propertyType: string;
  listingPurpose: 'sale';
  title: string;
  description: string;
  locality: string;
  landArea: number | null;
  landAreaUnit: string;
  facing: string;
  waterSource: string;
  soilType: string;
  roadAccess: string;
  cultivationStatus: string;
  landCategory: string;
  ownershipType: string;
  surveyNumber: string;
  farmhouseAvailable: string;
  fencingDone: string;
  /** FE-only, shown in review but never sent to the backend — see AgriculturalListingForm doc. */
  rtc: string;
  crops: readonly string[];
  features: readonly string[];
  priceRupees: number | null;
}

interface AgriculturalReviewPreviewProps {
  listingId: string;
  facts: AgriculturalReviewFacts;
  addressConfirmed: boolean;
  strengthResult: ListingStrengthResult;
  onEditSection: (section: 'details' | 'photos' | 'location' | 'description') => void;
}

export function AgriculturalReviewPreview({
  listingId,
  facts,
  addressConfirmed,
  strengthResult,
  onEditSection,
}: AgriculturalReviewPreviewProps) {
  const { images, imageCount } = useListingImages(listingId);

  const tiles: ReviewTile[] = [];
  const rows: ReviewRow[] = [];
  const addTile = (key: string, icon: typeof Sprout, label: string, value: string | number | null | undefined) => {
    if (value != null && value !== '') tiles.push({ key, icon, label, value: String(value) });
  };
  const addRow = (label: string, value: string | number | null | undefined) => {
    if (value != null && value !== '') rows.push({ key: label, label, value: String(value) });
  };

  addTile('area', Maximize, 'Land area', facts.landArea ? `${facts.landArea} ${facts.landAreaUnit || 'acre'}` : undefined);
  const facingLabel = FACING_OPTIONS.find((o) => o.value === facts.facing)?.label;
  addRow('Facing', facingLabel);
  addRow('Water source', labelFrom(WATER_SOURCE_LABELS, facts.waterSource));
  addRow('Soil type', labelFrom(SOIL_TYPE_LABELS, facts.soilType));
  addRow('Road access', labelFrom(ROAD_ACCESS_LABELS, facts.roadAccess));
  addRow('Cultivation status', labelFrom(CULTIVATION_STATUS_LABELS, facts.cultivationStatus));
  addRow('Land category', labelFrom(LAND_CATEGORY_LABELS, facts.landCategory));
  addRow('Farmhouse', facts.farmhouseAvailable === 'true' ? 'Yes' : facts.farmhouseAvailable === 'false' ? 'No' : undefined);
  addRow('Fencing', facts.fencingDone === 'true' ? 'Yes' : facts.fencingDone === 'false' ? 'No' : undefined);
  addRow('Ownership', labelFrom(OWNERSHIP_TYPE_LABELS, facts.ownershipType));
  addRow('Survey number', facts.surveyNumber);
  addRow('RTC (as entered, not saved to record yet)', facts.rtc);
  addRow('Crops (as entered)', facts.crops.length > 0 ? facts.crops.join(', ') : undefined);
  addRow('Features (as entered)', facts.features.length > 0 ? facts.features.join(', ') : undefined);

  const priceBreakdown = computeAgriPriceBreakdown(facts.priceRupees, facts.landArea, facts.landAreaUnit);
  const priceDisplay = facts.priceRupees != null && facts.priceRupees > 0 ? formatPrice(facts.priceRupees) : 'Add a price';

  const specs = tiles.slice(0, 4).map((t) => t.value);

  const trustChecks = [
    { key: 'photos', label: 'Photos added', ok: imageCount > 0 },
    { key: 'cover', label: 'Cover photo selected', ok: imageCount > 0 },
    { key: 'location', label: 'Location pinned', ok: addressConfirmed },
    { key: 'description', label: 'Description added', ok: facts.description.trim().length > 0 },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.7fr_1fr]" data-testid="agricultural-review-preview">
      <div className="space-y-4">
        {/* Gallery */}
        <div className="relative aspect-[16/7] overflow-hidden rounded-2xl border bg-muted">
          {imageCount > 0 && images[0] ? (
            <img src={images[0].url} alt="Cover" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <Camera className="h-6 w-6" aria-hidden="true" />
              <span className="text-sm">No photos added yet</span>
              <button type="button" onClick={() => onEditSection('photos')} className="text-xs font-semibold text-primary underline-offset-2 hover:underline">
                Add photos
              </button>
            </div>
          )}
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-card/95 px-2.5 py-1 text-xs font-semibold shadow-sm">
            <ShieldCheck className="h-3 w-3 text-primary" aria-hidden="true" />
            Listed by a broker account
          </span>
          <button
            type="button"
            onClick={() => onEditSection('photos')}
            className="absolute right-3 top-3 rounded-full bg-card/95 px-3 py-1 text-xs font-semibold shadow-sm"
          >
            Edit photos
          </button>
        </div>

        {/* Summary */}
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="mb-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">Agricultural land</span>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold">For sale</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-serif text-2xl font-semibold text-foreground">{facts.title.trim() || 'Untitled listing'}</h2>
            <button type="button" onClick={() => onEditSection('details')} className="shrink-0 pt-1 text-xs font-semibold text-primary">
              Edit
            </button>
          </div>
          {specs.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 text-sm font-semibold text-foreground">
              {specs.map((s, i) => <span key={i}>{s}</span>)}
            </div>
          )}
          <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {facts.locality || 'Add a locality'}
          </div>
          <div className="mt-3 font-mono text-2xl font-semibold text-foreground">{priceDisplay}</div>
          {(priceBreakdown.perAcre != null || priceBreakdown.perCent != null || priceBreakdown.perSqft != null) && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {priceBreakdown.perAcre != null && `₹${priceBreakdown.perAcre.toLocaleString('en-IN')}/acre`}
              {priceBreakdown.perCent != null && ` · ₹${priceBreakdown.perCent.toLocaleString('en-IN')}/cent`}
              {priceBreakdown.perSqft != null && ` · ₹${priceBreakdown.perSqft.toLocaleString('en-IN')}/sqft`}
            </p>
          )}
        </div>

        {/* Land details */}
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[15px] font-bold">Land details</h3>
            <button type="button" onClick={() => onEditSection('details')} className="text-xs font-semibold text-primary">Edit</button>
          </div>
          {tiles.length > 0 && (
            <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {tiles.map((t) => (
                <div key={t.key} className="flex flex-col gap-1.5 rounded-lg border bg-muted/40 p-3">
                  <t.icon className="h-4 w-4 text-foreground/70" aria-hidden="true" />
                  <span className="font-mono text-sm font-semibold text-foreground">{t.value}</span>
                  <span className="text-[11px] text-muted-foreground">{t.label}</span>
                </div>
              ))}
            </div>
          )}
          {rows.length > 0 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {rows.map((r) => (
                <div key={r.key} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="font-semibold text-foreground">{r.value}</span>
                </div>
              ))}
            </div>
          )}
          {tiles.length === 0 && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">Add land details and they'll appear here.</p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Survey number, RTC, ownership, and crops are shown exactly as entered by the seller/broker — ReTrends does not verify land records.
          </p>
        </div>

        {/* About */}
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[15px] font-bold">About this land</h3>
            <button type="button" onClick={() => onEditSection('description')} className="text-xs font-semibold text-primary">Edit</button>
          </div>
          <DescriptionOrEmpty description={facts.description.trim() || undefined} />
        </div>

        {/* Location & nearby */}
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[15px] font-bold">Location &amp; nearby</h3>
            <button type="button" onClick={() => onEditSection('location')} className="text-xs font-semibold text-primary">Edit</button>
          </div>
          <p className="mb-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {addressConfirmed ? 'Location pinned on the map' : 'Location not pinned yet'}
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            The pin marks the location only — it is not a legal or survey boundary.
          </p>
          <InlineNearby listingId={listingId} propertyType={facts.propertyType} addressConfirmed={addressConfirmed} />
        </div>

        {/* What's on this listing */}
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <h3 className="mb-1 flex items-center gap-2 text-[15px] font-bold">
            <ShieldCheck className="h-4 w-4 text-foreground/70" aria-hidden="true" />
            What's on this listing
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">
            What you've added so far. ReTrends doesn't verify ownership, survey records, or documents — buyers see only these honest signals.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {trustChecks.map((c) => (
              <div key={c.key} className="flex items-start gap-2 text-sm">
                {c.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />}
                {c.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right rail */}
      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Editor view · only you see this</p>
        <StrengthMeter result={strengthResult} variant="review" />
      </div>
    </div>
  );
}

/** Hides the description block entirely when empty rather than showing a fake placeholder claim. */
function DescriptionOrEmpty({ description }: { description: string | undefined }) {
  if (!description) {
    return <p className="text-sm italic text-muted-foreground">No description yet. Add one so buyers know what makes this land worth a visit.</p>;
  }
  return <p className="max-w-[70ch] text-[15px] leading-relaxed text-foreground">{description}</p>;
}
