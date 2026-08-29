import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateListing } from '@/hooks/usePropertyListings';
import type { AdminListingRow } from '@/hooks/useAdminData';
import { useListingActivity } from '@/hooks/useListingActivity';
import { useAdminListingContact } from '@/hooks/useAdminListingContact';
import { stripStatusFromUpdate } from '@/lib/listingInventory';
import type { PropertyType } from '@/lib/listing-constants';
import { invalidateListingQueries } from '@/hooks/admin/invalidateListingQueries';

type SellerType = 'owner' | 'dealer' | 'broker' | 'builder' | '';

export interface EditorFormState {
  title: string;
  property_type: PropertyType;
  seller_type: SellerType;
  locality: string;
  latitude: number | null;
  longitude: number | null;
  price: string;
  price_unit: string;
  land_area: string;
  land_area_unit: string;
  built_area: string;
  built_area_unit: string;
  carpet_area: string;
  carpet_area_unit: string;
  super_built_area: string;
  super_built_area_unit: string;
  bedrooms: string;
  bathrooms: string;
  description: string;
}

export function toFormState(listing: AdminListingRow): EditorFormState {
  return {
    title: listing.title ?? '',
    // Supabase codegen types property_type as its own DB enum, which is kept
    // in lockstep with PropertyType's string union but is a structurally
    // distinct type alias — this cast documents that, rather than widening.
    property_type: listing.property_type as PropertyType,
    // AdminListingRow deliberately leaves seller_type as the DB-generated
    // `string` (see useAdminData.ts's Slice 6 comment) — narrowing it here to
    // the 4 real values the Select below offers, since anything else would
    // fail validate()'s Select rendering anyway.
    seller_type: (listing.seller_type as SellerType) || '',
    locality: listing.locality ?? '',
    latitude: listing.latitude,
    longitude: listing.longitude,
    price: listing.price != null ? String(listing.price) : '',
    price_unit: listing.price_unit ?? 'INR',
    land_area: listing.land_area != null ? String(listing.land_area) : '',
    land_area_unit: listing.land_area_unit ?? 'cent',
    built_area: listing.built_area != null ? String(listing.built_area) : '',
    built_area_unit: listing.built_area_unit ?? 'sq ft',
    carpet_area: listing.carpet_area != null ? String(listing.carpet_area) : '',
    carpet_area_unit: listing.carpet_area_unit ?? 'sq ft',
    super_built_area: listing.super_built_area != null ? String(listing.super_built_area) : '',
    super_built_area_unit: listing.super_built_area_unit ?? 'sq ft',
    bedrooms: listing.bedrooms != null ? String(listing.bedrooms) : '',
    bathrooms: listing.bathrooms != null ? String(listing.bathrooms) : '',
    description: listing.description ?? '',
  };
}

export interface FieldErrors {
  title?: string;
  property_type?: string;
  locality?: string;
  price?: string;
}

export function validate(form: EditorFormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.title.trim()) errors.title = 'Title is required.';
  if (!form.property_type) errors.property_type = 'Property type is required.';
  if (!form.locality.trim()) errors.locality = 'Locality is required.';
  if (form.price.trim() && (Number.isNaN(Number(form.price)) || Number(form.price) < 0)) {
    errors.price = 'Price must be a non-negative number.';
  }
  return errors;
}

/**
 * Owns the editor drawer's local field-editing state: form data, dirty/stale
 * tracking, validation, contact lazy-load, activity history, and the save
 * flow. `isStale` and `isDirty` are kept in this single hook (not split
 * apart) so they can't desync — a desync risk is a save silently overwriting
 * a concurrent edit from another tab. See #2377 decomposition brief.
 */
export function useListingEditorState(
  listing: AdminListingRow | undefined | null,
  open: boolean,
  initialSection: 'details' | 'activity',
  onOpenChange: (open: boolean, options?: { skipUnsavedCheck?: boolean }) => void,
) {
  const queryClient = useQueryClient();
  const updateListing = useUpdateListing();

  const [form, setForm] = useState<EditorFormState | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState<EditorFormState | null>(null);
  const [openedUpdatedAt, setOpenedUpdatedAt] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmStaleSave, setConfirmStaleSave] = useState(false);
  const [showContacts, setShowContacts] = useState(false);

  // Re-seed local form state whenever a *different* listing is opened.
  useEffect(() => {
    if (listing) {
      const next = toFormState(listing);
      setForm(next);
      setInitialSnapshot(next);
      setOpenedUpdatedAt(listing.updated_at);
      setErrors({});
      setShowContacts(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing?.id]);

  // Deep-link: "View activity" overflow action opens the drawer scrolled to
  // the activity section instead of forcing a separate view/route.
  useEffect(() => {
    if (open && initialSection === 'activity' && listing) {
      const timer = setTimeout(() => {
        document.getElementById('listing-editor-activity')?.scrollIntoView({ block: 'start' });
      }, 50);
      return () => clearTimeout(timer);
    }
    // Intentionally keyed on listing?.id (not the listing object) — re-running
    // this on every background refetch would re-trigger the scroll-into-view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialSection, listing?.id]);

  const isDirty = useMemo(() => {
    if (!form || !initialSnapshot) return false;
    return JSON.stringify(form) !== JSON.stringify(initialSnapshot);
  }, [form, initialSnapshot]);

  const isStale = !!listing && !!openedUpdatedAt && listing.updated_at !== openedUpdatedAt;

  const activity = useListingActivity(listing?.id ?? null);
  const contact = useAdminListingContact(listing?.id ?? null, showContacts);

  function requestClose() {
    if (isDirty) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  }

  function buildUpdatePayload(current: EditorFormState) {
    // #2369 boundary: this payload is a plain field update and must NEVER
    // include `status`. stripStatusFromUpdate is defense-in-depth — the
    // object literal below never sets `status` to begin with.
    return stripStatusFromUpdate({
      title: current.title.trim(),
      property_type: current.property_type,
      seller_type: current.seller_type ? current.seller_type : null,
      locality: current.locality.trim() || null,
      latitude: current.latitude,
      longitude: current.longitude,
      price: current.price.trim() ? Number(current.price) : null,
      price_unit: current.price_unit || null,
      land_area: current.land_area.trim() ? Number(current.land_area) : null,
      land_area_unit: current.land_area.trim() ? current.land_area_unit : null,
      built_area: current.built_area.trim() ? Number(current.built_area) : null,
      built_area_unit: current.built_area.trim() ? current.built_area_unit : null,
      carpet_area: current.carpet_area.trim() ? Number(current.carpet_area) : null,
      carpet_area_unit: current.carpet_area.trim() ? current.carpet_area_unit : null,
      super_built_area: current.super_built_area.trim() ? Number(current.super_built_area) : null,
      super_built_area_unit: current.super_built_area.trim() ? current.super_built_area_unit : null,
      bedrooms: current.bedrooms.trim() ? Number(current.bedrooms) : null,
      bathrooms: current.bathrooms.trim() ? Number(current.bathrooms) : null,
      description: current.description.trim() || null,
    });
  }

  async function doSave() {
    if (!listing || !form) return;
    const fieldErrors = validate(form);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) {
      // Focus the first invalid field.
      const firstKey = Object.keys(fieldErrors)[0];
      document.getElementById(`listing-editor-${firstKey}`)?.focus();
      return;
    }

    await updateListing.mutateAsync({ id: listing.id, updates: buildUpdatePayload(form) });
    // useUpdateListing (shared with broker pages) only invalidates
    // ['property-listings'] — the admin inventory table/tab-counts/deep-link
    // caches need their own invalidation so a saved field edit is reflected
    // immediately instead of showing the pre-save row until the next
    // natural refetch (#2370 delta, teammate-reported regression).
    await invalidateListingQueries(queryClient);
    setInitialSnapshot(form);
    setOpenedUpdatedAt(new Date().toISOString());
  }

  function handleSaveClick() {
    if (isStale) {
      setConfirmStaleSave(true);
      return;
    }
    void doSave();
  }

  return {
    form,
    setForm,
    errors,
    isDirty,
    isStale,
    activity,
    contact,
    showContacts,
    setShowContacts,
    confirmDiscard,
    setConfirmDiscard,
    confirmStaleSave,
    setConfirmStaleSave,
    updateListing,
    doSave,
    handleSaveClick,
    requestClose,
  };
}
