import type { Dispatch, SetStateAction } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { AddressPicker, type AddressPickerValue } from '@/components/broker/AddressPicker';
import { formatArea, formatPrice } from '@/lib/formatters';
import { PROPERTY_TYPES, type PropertyType } from '@/lib/listing-constants';
import type { AdminListingRow } from '@/hooks/useAdminData';
import { Image as ImageIcon } from 'lucide-react';
import type { EditorFormState, FieldErrors } from '@/hooks/admin/useListingEditorState';
import type { useAdminListingContact } from '@/hooks/useAdminListingContact';

const AREA_UNIT_OPTIONS = ['sq ft', 'sq m', 'cent', 'acre', 'guntha'];

const LAND_LIKE_TYPES: PropertyType[] = ['land', 'agricultural_land', 'residential_plot', 'commercial_land'];
const BUILDING_LIKE_TYPES: PropertyType[] = [
  'house',
  'villa',
  'apartment',
  'commercial',
  'commercial_building',
  'warehouse',
];

interface FormFieldSectionProps {
  form: EditorFormState;
  setForm: Dispatch<SetStateAction<EditorFormState | null>>;
  errors: FieldErrors;
}

function AreaRow({
  label,
  value,
  unit,
  onValueChange,
  onUnitChange,
}: {
  label: string;
  value: string;
  unit: string;
  onValueChange: (v: string) => void;
  onUnitChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>{label}</Label>
        <Input type="number" min={0} value={value} onChange={(e) => onValueChange(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Unit</Label>
        <Select value={unit} onValueChange={onUnitChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AREA_UNIT_OPTIONS.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {value.trim() && (
        <p className="text-xs text-muted-foreground col-span-2 -mt-2">
          {formatArea(Number(value), unit)}
        </p>
      )}
    </div>
  );
}

function MediaGallery({ listing }: { listing: AdminListingRow }) {
  const images = (() => {
    const raw = listing.raw_posts?.images;
    if (!Array.isArray(raw)) return [] as Array<{ url?: string }>;
    return raw as Array<{ url?: string }>;
  })();

  if (images.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground border rounded-md p-4">
        <ImageIcon className="h-4 w-4" />
        No photos recorded for this listing.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {images.map((img, i) => (
        <div key={img.url ?? i} className="relative aspect-square rounded overflow-hidden bg-muted">
          {img.url ? (
            <img src={img.url} alt={`Listing photo ${i + 1}`} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          {i === 0 && (
            <span className="absolute top-1 left-1 bg-black/70 text-white text-[10px] px-1 rounded">
              Cover
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function BasicDetailsSection({ form, setForm, errors }: FormFieldSectionProps) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Basic details
      </h3>
      <div className="space-y-2">
        <Label htmlFor="listing-editor-title">Title</Label>
        <Input
          id="listing-editor-title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          aria-invalid={!!errors.title}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="listing-editor-property_type">Property type</Label>
          <Select
            value={form.property_type}
            onValueChange={(v) => setForm({ ...form, property_type: v as PropertyType })}
          >
            <SelectTrigger id="listing-editor-property_type" aria-invalid={!!errors.property_type}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROPERTY_TYPES.map((pt) => (
                <SelectItem key={pt.value} value={pt.value}>
                  {pt.label}
                </SelectItem>
              ))}
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="listing-editor-seller_type">Seller type</Label>
          <Select
            value={form.seller_type || undefined}
            onValueChange={(v) => setForm({ ...form, seller_type: v as EditorFormState['seller_type'] })}
          >
            <SelectTrigger id="listing-editor-seller_type">
              <SelectValue placeholder="Unknown" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="owner">Owner</SelectItem>
              <SelectItem value="dealer">Dealer</SelectItem>
              <SelectItem value="broker">Broker</SelectItem>
              <SelectItem value="builder">Builder</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  );
}

function PropertyDetailsSection({ form, setForm }: FormFieldSectionProps) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Property details
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="listing-editor-bedrooms">Bedrooms</Label>
          <Input
            id="listing-editor-bedrooms"
            type="number"
            min={0}
            value={form.bedrooms}
            onChange={(e) => setForm({ ...form, bedrooms: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="listing-editor-bathrooms">Bathrooms</Label>
          <Input
            id="listing-editor-bathrooms"
            type="number"
            min={0}
            value={form.bathrooms}
            onChange={(e) => setForm({ ...form, bathrooms: e.target.value })}
          />
        </div>
      </div>
    </section>
  );
}

function PriceAreaSection({ form, setForm, errors }: FormFieldSectionProps) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Price &amp; area
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="listing-editor-price">Price (INR)</Label>
          <Input
            id="listing-editor-price"
            type="number"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            aria-invalid={!!errors.price}
          />
          {form.price.trim() && !errors.price && (
            <p className="text-xs text-muted-foreground">
              {formatPrice(Number(form.price), form.price_unit)}
            </p>
          )}
        </div>
      </div>

      {(LAND_LIKE_TYPES.includes(form.property_type) || form.land_area.trim()) && (
        <AreaRow
          label="Land area"
          value={form.land_area}
          unit={form.land_area_unit}
          onValueChange={(v) => setForm({ ...form, land_area: v })}
          onUnitChange={(v) => setForm({ ...form, land_area_unit: v })}
        />
      )}
      {(BUILDING_LIKE_TYPES.includes(form.property_type) || form.built_area.trim()) && (
        <AreaRow
          label="Built-up area"
          value={form.built_area}
          unit={form.built_area_unit}
          onValueChange={(v) => setForm({ ...form, built_area: v })}
          onUnitChange={(v) => setForm({ ...form, built_area_unit: v })}
        />
      )}
      {form.carpet_area.trim() && (
        <AreaRow
          label="Carpet area"
          value={form.carpet_area}
          unit={form.carpet_area_unit}
          onValueChange={(v) => setForm({ ...form, carpet_area: v })}
          onUnitChange={(v) => setForm({ ...form, carpet_area_unit: v })}
        />
      )}
      {form.super_built_area.trim() && (
        <AreaRow
          label="Super built-up area"
          value={form.super_built_area}
          unit={form.super_built_area_unit}
          onValueChange={(v) => setForm({ ...form, super_built_area: v })}
          onUnitChange={(v) => setForm({ ...form, super_built_area_unit: v })}
        />
      )}
    </section>
  );
}

function LocationSection({ form, setForm, errors }: FormFieldSectionProps) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Location
      </h3>
      {errors.locality && <p className="text-sm text-destructive">{errors.locality}</p>}
      <AddressPicker
        initialLatitude={form.latitude}
        initialLongitude={form.longitude}
        initialLocality={form.locality}
        initialConfirmed={form.latitude != null && form.longitude != null}
        onConfirm={(value: AddressPickerValue) =>
          setForm((prev) => (prev ? { ...prev, latitude: value.lat, longitude: value.lng } : prev))
        }
        onLocalityConfirmed={(locality) => setForm((prev) => (prev ? { ...prev, locality } : prev))}
      />
      <div className="space-y-2">
        <Label htmlFor="listing-editor-locality">Locality (text)</Label>
        <Input
          id="listing-editor-locality"
          value={form.locality}
          onChange={(e) => setForm({ ...form, locality: e.target.value })}
          aria-invalid={!!errors.locality}
        />
      </div>
    </section>
  );
}

function PhotosSection({ listing }: { listing: AdminListingRow }) {
  return (
    // Photos / media — view-only (see Honest Gaps: no confirmed admin write path)
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Photos
      </h3>
      <MediaGallery listing={listing} />
    </section>
  );
}

function DescriptionSection({ form, setForm }: FormFieldSectionProps) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Description
      </h3>
      <Textarea
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        rows={5}
      />
    </section>
  );
}

interface BrokerContactSectionProps {
  form: EditorFormState;
  showContacts: boolean;
  setShowContacts: (value: boolean) => void;
  contact: ReturnType<typeof useAdminListingContact>;
}

function BrokerContactSection({ form, showContacts, setShowContacts, contact }: BrokerContactSectionProps) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Broker &amp; contact
      </h3>
      <p className="text-sm text-muted-foreground">
        Source: <span className="font-medium text-foreground">{form.seller_type || 'Unknown'}</span>
      </p>
      {!showContacts ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setShowContacts(true)}>
          Reveal contact details
        </Button>
      ) : contact.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading contact…</p>
      ) : contact.isError ? (
        <p className="text-sm text-destructive">Could not load contact details.</p>
      ) : (
        <div className="text-sm space-y-1">
          <p>Phone: {contact.data?.contact_phone ?? '—'}</p>
          <p>Other contact info: {contact.data?.contact_info ?? '—'}</p>
        </div>
      )}
    </section>
  );
}

interface ListingEditorFormBodyProps {
  listing: AdminListingRow;
  form: EditorFormState;
  setForm: Dispatch<SetStateAction<EditorFormState | null>>;
  errors: FieldErrors;
  showContacts: boolean;
  setShowContacts: (value: boolean) => void;
  contact: ReturnType<typeof useAdminListingContact>;
}

/** Basic details through Broker & contact — everything before the Publication & lifecycle section. */
export function ListingEditorFormBody({
  listing,
  form,
  setForm,
  errors,
  showContacts,
  setShowContacts,
  contact,
}: ListingEditorFormBodyProps) {
  return (
    <>
      <BasicDetailsSection form={form} setForm={setForm} errors={errors} />
      <Separator />
      <PropertyDetailsSection form={form} setForm={setForm} errors={errors} />
      <Separator />
      <PriceAreaSection form={form} setForm={setForm} errors={errors} />
      <Separator />
      <LocationSection form={form} setForm={setForm} errors={errors} />
      <Separator />
      <PhotosSection listing={listing} />
      <Separator />
      <DescriptionSection form={form} setForm={setForm} errors={errors} />
      <Separator />
      <BrokerContactSection
        form={form}
        showContacts={showContacts}
        setShowContacts={setShowContacts}
        contact={contact}
      />
    </>
  );
}
