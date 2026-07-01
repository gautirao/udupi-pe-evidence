import { Bed, Bath, Maximize, Building2, Route, MapPin, ShieldCheck, Camera, Check, TriangleAlert } from 'lucide-react';
import { useListingImages } from '@/hooks/useListingImages';
import { formatPrice } from '@/lib/formatters';
import {
  FACING_OPTIONS,
  FURNISHING_OPTIONS,
  PROPERTY_STATUS_OPTIONS,
} from '@/lib/listing-constants';
import { InlineNearby } from '@/components/broker/residential/InlineNearby';
import { StrengthMeter } from '@/components/broker/residential/StrengthMeter';
import type { ListingStrengthResult } from '@/lib/listingStrength';
import type { DescriptionFacts } from '@/lib/listingDescriptionBuilder';

// ---------------------------------------------------------------------------
// Issue #1718 — residential single-page create parity (design-spec.md
// "reviewView" — listing-detail style). PURE PRESENTATION: hides missing
// optional fields (no fake defaults), never claims legal/RERA/document
// verification. "Edit" links jump the parent back to edit mode.
// ---------------------------------------------------------------------------

interface ReviewTile {
  key: string;
  icon: typeof Bed;
  label: string;
  value: string;
}

interface ReviewRow {
  key: string;
  label: string;
  value: string;
}

function labelFor(options: readonly { value: string; label: string }[], value: string): string | undefined {
  return options.find((o) => o.value === value)?.label;
}

export interface ResidentialReviewFacts extends DescriptionFacts {
  title: string;
  description: string;
  balconies: string;
  builtArea: number | null;
  superBuiltArea: string;
  parking2wCount: string;
  parking4wCount: string;
  ownershipType: string;
}

interface ResidentialReviewPreviewProps {
  listingId: string;
  facts: ResidentialReviewFacts;
  addressConfirmed: boolean;
  strengthResult: ListingStrengthResult;
  onEditSection: (section: 'details' | 'photos' | 'location' | 'description') => void;
}

export function ResidentialReviewPreview({
  listingId,
  facts,
  addressConfirmed,
  strengthResult,
  onEditSection,
}: ResidentialReviewPreviewProps) {
  const { images, imageCount } = useListingImages(listingId);
  const isApartment = facts.propertyType === 'apartment';
  const isHouseOrVilla = facts.propertyType === 'house' || facts.propertyType === 'villa';
  const isPlot = facts.propertyType === 'residential_plot';
  const isRent = facts.listingPurpose === 'rent';

  const kindLabel = { apartment: 'Apartment', house: 'Independent house', villa: 'Villa', residential_plot: 'Residential plot' }[facts.propertyType];
  const purposeLabel = isRent ? 'For rent' : 'For sale';

  const tiles: ReviewTile[] = [];
  const rows: ReviewRow[] = [];
  const addTile = (key: string, icon: typeof Bed, label: string, value: string | number | null | undefined) => {
    if (value != null && value !== '') tiles.push({ key, icon, label, value: String(value) });
  };
  const addRow = (label: string, value: string | number | null | undefined) => {
    if (value != null && value !== '') rows.push({ key: label, label, value: String(value) });
  };

  const furnishingLabel = labelFor(FURNISHING_OPTIONS, facts.furnishingStatus);
  const facingLabel = labelFor(FACING_OPTIONS, facts.facing);
  const possessionLabel = labelFor(PROPERTY_STATUS_OPTIONS, facts.possessionStatus);

  if (isApartment) {
    addTile('bedrooms', Bed, 'Bedrooms', facts.bedrooms && `${facts.bedrooms} BHK`);
    addTile('bathrooms', Bath, 'Bathrooms', facts.bathrooms);
    addTile('area', Maximize, 'Carpet area', facts.primaryAreaSqft && `${facts.primaryAreaSqft} sq.ft`);
    addTile('floor', Building2, 'Floor', facts.floorNumber && (facts.totalFloors ? `${facts.floorNumber} of ${facts.totalFloors}` : facts.floorNumber));
    addRow('Furnishing', furnishingLabel);
    addRow('Balconies', facts.balconies);
    addRow('Facing', facingLabel);
    addRow('Property status', !isRent ? possessionLabel : undefined);
    addRow('Built-up area', facts.builtArea && facts.builtArea > 0 ? `${facts.builtArea} sq.ft` : undefined);
    addRow('Super built-up area', facts.superBuiltArea && `${facts.superBuiltArea} sq.ft`);
    addRow('2-wheeler parking', facts.parking2wCount && facts.parking2wCount !== '0' ? facts.parking2wCount : undefined);
    addRow('4-wheeler parking', facts.parking4wCount && facts.parking4wCount !== '0' ? facts.parking4wCount : undefined);
    addRow('Lift', facts.hasLift ? 'Yes' : undefined);
    addRow('Power backup', facts.hasPowerBackup ? 'Yes' : undefined);
    addRow('Gated community', facts.isGated ? 'Yes' : undefined);
    addRow('Project / society', facts.projectName);
    addRow('Amenities', facts.amenities.length > 0 ? facts.amenities.join(', ') : undefined);
  } else if (isHouseOrVilla) {
    addTile('bedrooms', Bed, 'Bedrooms', facts.bedrooms && `${facts.bedrooms} BHK`);
    addTile('bathrooms', Bath, 'Bathrooms', facts.bathrooms);
    addTile('area', Maximize, 'Built-up area', facts.primaryAreaSqft && `${facts.primaryAreaSqft} sq.ft`);
    addTile('floors', Building2, 'Floors', facts.totalFloors);
    addRow('Furnishing', furnishingLabel);
    addRow('Facing', facingLabel);
    addRow('Property status', !isRent ? possessionLabel : undefined);
    addRow('2-wheeler parking', facts.parking2wCount && facts.parking2wCount !== '0' ? facts.parking2wCount : undefined);
    addRow('4-wheeler parking', facts.parking4wCount && facts.parking4wCount !== '0' ? facts.parking4wCount : undefined);
    addRow('Gated community', facts.isGated ? 'Yes' : undefined);
    addRow('Garden', facts.hasGarden ? 'Yes' : undefined);
    addRow('Community amenities', facts.amenities.length > 0 ? facts.amenities.join(', ') : undefined);
  } else {
    addTile('area', Maximize, 'Plot area', facts.primaryAreaSqft && `${facts.primaryAreaSqft} sq.ft`);
    addTile('road', Route, 'Road width', facts.roadWidthFt && `${facts.roadWidthFt} ft`);
    addTile('facing', MapPin, 'Facing', facingLabel);
    addTile('dimensions', Maximize, 'Dimensions', facts.plotDimensions);
    addRow('Ownership type', facts.ownershipType);
  }

  const priceDisplay = (() => {
    const amount = isRent ? facts.monthlyRent : facts.priceRupees;
    if (amount == null || amount <= 0) return 'Add a price';
    return `${formatPrice(amount)}${isRent ? '/mo' : ''}`;
  })();

  const specs = tiles.slice(0, 4).map((t) => t.value);

  const trustChecks = [
    { key: 'photos', label: 'Photos added', ok: imageCount > 0 },
    { key: 'cover', label: 'Cover photo selected', ok: imageCount > 0 },
    { key: 'location', label: 'Location pinned', ok: addressConfirmed },
    { key: 'description', label: 'Description added', ok: facts.description.trim().length > 0 },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.7fr_1fr]" data-testid="residential-review-preview">
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
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">{kindLabel}</span>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold">{purposeLabel}</span>
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
            {facts.projectName.trim() ? `${facts.projectName}, ${facts.locality}` : (facts.locality || 'Add a locality')}
          </div>
          <div className="mt-3 font-mono text-2xl font-semibold text-foreground">{priceDisplay}</div>
        </div>

        {/* Property details */}
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[15px] font-bold">Property details</h3>
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
            <p className="text-sm text-muted-foreground">Add property details and they'll appear here.</p>
          )}
        </div>

        {/* About */}
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[15px] font-bold">About this property</h3>
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
          <p className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {addressConfirmed ? 'Location pinned on the map' : 'Location not pinned yet'}
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
            What you've added so far. ReTrends doesn't verify ownership or documents — buyers see only these honest signals.
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
    return <p className="text-sm italic text-muted-foreground">No description yet. Add one so buyers know what makes this property worth a visit.</p>;
  }
  return <p className="max-w-[70ch] text-[15px] leading-relaxed text-foreground">{description}</p>;
}
