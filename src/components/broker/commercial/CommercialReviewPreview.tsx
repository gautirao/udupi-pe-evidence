import { Building2, Maximize, MapPin, ShieldCheck, Camera, Check, TriangleAlert } from 'lucide-react';
import { useListingImages } from '@/hooks/useListingImages';
import { formatPrice } from '@/lib/formatters';
import {
  COMMERCIAL_SUBTYPE_OPTIONS,
  COMMERCIAL_FLOOR_CHOICE_OPTIONS,
  COMMERCIAL_FLOOR_MODE_OPTIONS,
  COMMERCIAL_OCCUPANCY_STATUS_OPTIONS,
  COMMERCIAL_FURNISHING_STATUS_OPTIONS,
  COMMERCIAL_OWNERSHIP_OPTIONS,
  COMMERCIAL_AVAILABILITY_OPTIONS,
} from '@/lib/listing-constants';
import { InlineNearby } from '@/components/broker/residential/InlineNearby';
import { StrengthMeter } from '@/components/broker/residential/StrengthMeter';
import type { ListingStrengthResult } from '@/lib/listingStrength';
import type { CommercialSubtype } from '@/lib/listingFieldConfig';

// ---------------------------------------------------------------------------
// #1684 [M38-13B] — commercial review-tile variant of ResidentialReviewPreview.
// NOT a reuse of ResidentialReviewPreview — that component is typed/worded for
// the 4 residential subtypes and would silently omit every commercial field
// (subtype/floor/hub/office/warehouse/land detail, utilities, suitable uses).
// PURE PRESENTATION: hides missing optional fields (no fake defaults), and
// NEVER claims verification, guaranteed ROI/yield/footfall, or a legal/zoning
// determination — those numbers are shown as exactly what the broker typed,
// nothing more.
// ---------------------------------------------------------------------------

interface ReviewTile {
  key: string;
  icon: typeof Building2;
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

export interface CommercialReviewFacts {
  propertyType: string;
  commercialSubtype: CommercialSubtype | undefined;
  listingPurpose: 'sale' | 'rent' | 'lease';
  title: string;
  description: string;
  locality: string;
  primaryAreaSqft: number | null;
  areaUnit: string;
  floorChoice: string;
  hubType: string;
  floorMode: string;
  occupancyStatus: string;
  officeSeats: string;
  officeCabins: string;
  officeMeetingRooms: string;
  warehouseClearHeightFt: string;
  warehouseFlooring: string;
  commercialZoning: string;
  commercialOwnership: string;
  washroomsPublic: string;
  washroomsPrivate: string;
  parkingPublicCount: string;
  parkingPrivateCount: string;
  commercialFurnishingStatus: string;
  utilities: readonly string[];
  suitableUses: readonly string[];
  commercialAvailability: string;
  priceRupees: number | null;
  monthlyRent: number | null;
  leaseTermMonths: string;
  expectedRentalYieldPct: string;
}

interface CommercialReviewPreviewProps {
  listingId: string;
  facts: CommercialReviewFacts;
  addressConfirmed: boolean;
  strengthResult: ListingStrengthResult;
  onEditSection: (section: 'details' | 'photos' | 'location' | 'description') => void;
}

export function CommercialReviewPreview({
  listingId,
  facts,
  addressConfirmed,
  strengthResult,
  onEditSection,
}: CommercialReviewPreviewProps) {
  const { images, imageCount } = useListingImages(listingId);
  const isRentOrLease = facts.listingPurpose === 'rent' || facts.listingPurpose === 'lease';

  const kindLabel = labelFor(COMMERCIAL_SUBTYPE_OPTIONS, facts.commercialSubtype ?? '') ?? 'Commercial';
  const purposeLabel = facts.listingPurpose === 'sale' ? 'For sale' : facts.listingPurpose === 'lease' ? 'For lease' : 'For rent';

  const tiles: ReviewTile[] = [];
  const rows: ReviewRow[] = [];
  const addTile = (key: string, icon: typeof Building2, label: string, value: string | number | null | undefined) => {
    if (value != null && value !== '') tiles.push({ key, icon, label, value: String(value) });
  };
  const addRow = (label: string, value: string | number | null | undefined) => {
    if (value != null && value !== '') rows.push({ key: label, label, value: String(value) });
  };

  addTile('area', Maximize, 'Area', facts.primaryAreaSqft ? `${facts.primaryAreaSqft} ${facts.areaUnit || 'sqft'}` : undefined);

  const subtype = facts.commercialSubtype;
  if (subtype === 'SHOP' || subtype === 'OFFICE') {
    addTile('floor', Building2, 'Floor', labelFor(COMMERCIAL_FLOOR_CHOICE_OPTIONS, facts.floorChoice));
    addRow('Location type', facts.hubType);
    if (subtype === 'SHOP') {
      addRow('Occupancy', labelFor(COMMERCIAL_OCCUPANCY_STATUS_OPTIONS, facts.occupancyStatus));
    }
    if (subtype === 'OFFICE') {
      addRow('Seats', facts.officeSeats);
      addRow('Cabins', facts.officeCabins);
      addRow('Meeting rooms', facts.officeMeetingRooms);
    }
  } else if (subtype === 'BUILDING') {
    addTile('floors', Building2, 'Floors', labelFor(COMMERCIAL_FLOOR_MODE_OPTIONS, facts.floorMode));
    addRow('Occupancy', labelFor(COMMERCIAL_OCCUPANCY_STATUS_OPTIONS, facts.occupancyStatus));
  } else if (subtype === 'WAREHOUSE') {
    addTile('height', Maximize, 'Clear height', facts.warehouseClearHeightFt && `${facts.warehouseClearHeightFt} ft`);
    addRow('Flooring', facts.warehouseFlooring);
  } else if (subtype === 'LAND') {
    addRow('Zoning', facts.commercialZoning);
    addRow('Ownership', labelFor(COMMERCIAL_OWNERSHIP_OPTIONS, facts.commercialOwnership));
  }

  if (subtype !== 'LAND') {
    addRow('Public washrooms', facts.washroomsPublic && facts.washroomsPublic !== '0' ? facts.washroomsPublic : undefined);
    addRow('Private washrooms', facts.washroomsPrivate && facts.washroomsPrivate !== '0' ? facts.washroomsPrivate : undefined);
    addRow('Public parking', facts.parkingPublicCount && facts.parkingPublicCount !== '0' ? facts.parkingPublicCount : undefined);
    addRow('Private parking', facts.parkingPrivateCount && facts.parkingPrivateCount !== '0' ? facts.parkingPrivateCount : undefined);
    addRow('Furnishing', labelFor(COMMERCIAL_FURNISHING_STATUS_OPTIONS, facts.commercialFurnishingStatus));
    addRow('Utilities', facts.utilities.length > 0 ? facts.utilities.join(', ') : undefined);
  }
  addRow('Suitable for', facts.suitableUses.length > 0 ? facts.suitableUses.join(', ') : undefined);
  addRow('Availability', labelFor(COMMERCIAL_AVAILABILITY_OPTIONS, facts.commercialAvailability));

  if (facts.listingPurpose === 'sale') {
    addRow('Expected rental yield', facts.expectedRentalYieldPct ? `${facts.expectedRentalYieldPct}%` : undefined);
  } else {
    addRow('Lease term', facts.leaseTermMonths ? `${facts.leaseTermMonths} months` : undefined);
  }

  const priceDisplay = (() => {
    const amount = isRentOrLease ? facts.monthlyRent : facts.priceRupees;
    if (amount == null || amount <= 0) return 'Add a price';
    return `${formatPrice(amount)}${isRentOrLease ? '/mo' : ''}`;
  })();

  const specs = tiles.slice(0, 4).map((t) => t.value);

  const trustChecks = [
    { key: 'photos', label: 'Photos added', ok: imageCount > 0 },
    { key: 'cover', label: 'Cover photo selected', ok: imageCount > 0 },
    { key: 'location', label: 'Location pinned', ok: addressConfirmed },
    { key: 'description', label: 'Description added', ok: facts.description.trim().length > 0 },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.7fr_1fr]" data-testid="commercial-review-preview">
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
            {facts.locality || 'Add a locality'}
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
          {facts.listingPurpose === 'sale' && facts.expectedRentalYieldPct && (
            <p className="mt-3 text-xs text-muted-foreground">
              Rental yield shown is the figure you entered — not verified, guaranteed, or platform-computed.
            </p>
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
            What you've added so far. ReTrends doesn't verify ownership, zoning, or documents — buyers see only these honest signals.
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
