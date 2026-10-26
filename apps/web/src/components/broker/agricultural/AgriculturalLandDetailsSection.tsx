import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AreaField } from '@/components/broker/AreaField';
import { PriceField } from '@/components/broker/PriceField';
import { FACING_OPTIONS } from '@/lib/listing-constants';
import type { ListingFieldKey } from '@/lib/listingFieldConfig';
import type { AgriPriceBreakdown } from '@/components/broker/agricultural/priceMath';
import { Field, Section } from './AgriculturalFormPrimitives';

interface AgriculturalLandDetailsSectionProps {
  landArea: number | null;
  landAreaUnit: string;
  onLandAreaChange: (area: number | null, unit: string) => void;
  priceRupees: number | null;
  priceHydrationSeed: number | null;
  onPriceChange: (rupees: number | null) => void;
  isRecoveringDraft?: boolean;
  hasAttempted: boolean;
  priceBreakdown: AgriPriceBreakdown;
  facing: string;
  onFacingChange: (value: string) => void;
  fieldVisible: (key: ListingFieldKey) => boolean;
}

/** #2398 / #2811 — Section 2: "Land details" (area, price + breakdown, facing). */
export function AgriculturalLandDetailsSection({
  landArea,
  landAreaUnit,
  onLandAreaChange,
  priceRupees,
  priceHydrationSeed,
  onPriceChange,
  isRecoveringDraft = false,
  hasAttempted,
  priceBreakdown,
  facing,
  onFacingChange,
  fieldVisible,
}: AgriculturalLandDetailsSectionProps) {
  return (
    <Section number={2} title="Land details">
      <AreaField
        id="landArea"
        label="Land area"
        propertyType="agricultural_land"
        initialArea={landArea}
        initialUnit={landAreaUnit}
        onChange={onLandAreaChange}
      />

      <div>
        <PriceField id="price" initialRupees={priceHydrationSeed} onChange={onPriceChange} required disabled={isRecoveringDraft} />
        {hasAttempted && (priceRupees == null || priceRupees <= 0) && (
          <p className="mt-1 text-sm text-destructive">A valid price greater than 0 is required.</p>
        )}
        {(priceBreakdown.perAcre != null || priceBreakdown.perCent != null || priceBreakdown.perSqft != null) ? (
          <p className="mt-2 font-mono text-xs text-muted-foreground" data-testid="agri-price-breakdown">
            {priceBreakdown.perAcre != null && `₹${priceBreakdown.perAcre.toLocaleString('en-IN')}/acre`}
            {priceBreakdown.perCent != null && ` · ₹${priceBreakdown.perCent.toLocaleString('en-IN')}/cent`}
            {priceBreakdown.perSqft != null && ` · ₹${priceBreakdown.perSqft.toLocaleString('en-IN')}/sqft`}
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Per-acre / per-cent / per-sq.ft price appears once you add area and price.</p>
        )}
      </div>

      {fieldVisible('facing') && (
        <Field id="facing" label="Facing">
          <Select value={facing} onValueChange={onFacingChange}>
            <SelectTrigger id="facing" className="h-11"><SelectValue placeholder="Select facing" /></SelectTrigger>
            <SelectContent>
              {FACING_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      )}
    </Section>
  );
}
