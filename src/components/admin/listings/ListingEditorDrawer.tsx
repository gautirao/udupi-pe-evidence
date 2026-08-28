import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AddressPicker, type AddressPickerValue } from '@/components/broker/AddressPicker';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useUpdateListing } from '@/hooks/usePropertyListings';
import type { AdminListingRow } from '@/hooks/useAdminData';
import { useListingActivity } from '@/hooks/useListingActivity';
import { useAdminListingContact } from '@/hooks/useAdminListingContact';
import { formatPrice, formatArea, formatRelativeDate } from '@/lib/formatters';
import { PROPERTY_TYPES, type PropertyType } from '@/lib/listing-constants';
import {
  canTogglePublish,
  formatDisplayId,
  getQualityBucket,
  isPubliclyVisible,
  needsAttention,
  stripStatusFromUpdate,
  QUALITY_BUCKET_LABELS,
} from '@/lib/listingInventory';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

type SellerType = 'owner' | 'dealer' | 'broker' | 'builder' | '';

interface EditorFormState {
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

function toFormState(listing: AdminListingRow): EditorFormState {
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

interface FieldErrors {
  title?: string;
  property_type?: string;
  locality?: string;
  price?: string;
}

function validate(form: EditorFormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.title.trim()) errors.title = 'Title is required.';
  if (!form.property_type) errors.property_type = 'Property type is required.';
  if (!form.locality.trim()) errors.locality = 'Locality is required.';
  if (form.price.trim() && (Number.isNaN(Number(form.price)) || Number(form.price) < 0)) {
    errors.price = 'Price must be a non-negative number.';
  }
  return errors;
}

export interface ListingEditorDrawerProps {
  listing: AdminListingRow | undefined | null;
  /** True while the listing is still loading from the table's dataset (deep-link case). */
  isResolvingListing?: boolean;
  open: boolean;
  onOpenChange: (open: boolean, options?: { skipUnsavedCheck?: boolean }) => void;
  initialSection?: 'details' | 'activity';
}

export function ListingEditorDrawer({
  listing,
  isResolvingListing = false,
  open,
  onOpenChange,
  initialSection = 'details',
}: ListingEditorDrawerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateListing = useUpdateListing();

  const [form, setForm] = useState<EditorFormState | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState<EditorFormState | null>(null);
  const [openedUpdatedAt, setOpenedUpdatedAt] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmStaleSave, setConfirmStaleSave] = useState(false);
  const [publishAction, setPublishAction] = useState<'publish' | 'unpublish' | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [approveScrapedConfirm, setApproveScrapedConfirm] = useState(false);
  const [restoreRejectedNote, setRestoreRejectedNote] = useState('');
  const [confirmRestoreRejected, setConfirmRestoreRejected] = useState(false);
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

  // #2370: the admin inventory table now reads from `useAdminListingsPage` /
  // `useAdminListingsTabCounts` / `useAdminListingById` (server-side
  // pagination), not the old `useAdminListings` snapshot — every lifecycle
  // mutation below must invalidate all of them, or the table and tab counts
  // go stale after an archive/restore/approve action taken from the drawer.
  function invalidateListingQueries() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-listings'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-listings-page'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-listings-tab-counts'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-listing-by-id'] }),
    ]);
  }

  const archiveMutation = useMutation({
    mutationFn: (payload: { id: string; reasonNote?: string }) =>
      api.post(`/api/admin/listings/${payload.id}/archive`, payload.reasonNote ? { reasonNote: payload.reasonNote } : undefined),
    onSuccess: () => {
      invalidateListingQueries();
      toast({ title: 'Listing archived' });
      setConfirmArchive(false);
      setArchiveReason('');
    },
    onError: (error: Error) => {
      toast({ title: 'Archive failed', description: error.message, variant: 'destructive' });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/listings/${id}/restore`),
    onSuccess: () => {
      invalidateListingQueries();
      toast({ title: 'Listing restored to draft' });
      setConfirmRestore(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Restore failed', description: error.message, variant: 'destructive' });
    },
  });

  const approveScrapedMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/listings/${id}/approve-scraped`),
    onSuccess: () => {
      invalidateListingQueries();
      toast({ title: 'Listing approved as live' });
      setApproveScrapedConfirm(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Approval failed', description: error.message, variant: 'destructive' });
    },
  });

  const restoreRejectedMutation = useMutation({
    mutationFn: ({ id, moderationNote }: { id: string; moderationNote: string }) =>
      api.post(`/api/admin/listings/${id}/restore-rejected`, { moderationNote }),
    onSuccess: () => {
      invalidateListingQueries();
      toast({ title: 'Listing restored to live' });
      setConfirmRestoreRejected(false);
      setRestoreRejectedNote('');
    },
    onError: (error: Error) => {
      toast({ title: 'Restore failed', description: error.message, variant: 'destructive' });
    },
  });

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
    await invalidateListingQueries();
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

  function handleTogglePublish(nextChecked: boolean) {
    setPublishAction(nextChecked ? 'publish' : 'unpublish');
  }

  async function confirmPublishToggle() {
    if (!listing || !publishAction) return;
    // Re-check at confirm-time, not just at click-time: the confirm dialog can
    // stay open across a background refetch. If listing.status moved away
    // from LIVE while the dialog was open, flipping is_valid here would
    // create exactly the contradictory-visibility state this page is meant
    // to detect and flag (code-reviewer finding #1, #2370 delta).
    if (!canTogglePublish(listing)) {
      setPublishAction(null);
      toast({
        title: 'No longer available',
        description: 'This listing is no longer LIVE, so it can’t be published or unpublished from here.',
        variant: 'destructive',
      });
      return;
    }
    await updateListing.mutateAsync({
      id: listing.id,
      updates: stripStatusFromUpdate({ is_valid: publishAction === 'publish' }),
    });
    // Same gap as doSave(): useUpdateListing only invalidates
    // ['property-listings'], so without this the Switch (bound directly to
    // `listing.is_valid` from the admin-listings-page/admin-listing-by-id
    // cache) never flips after a successful publish/unpublish confirm.
    await invalidateListingQueries();
    setPublishAction(null);
  }

  if (!open) return null;

  // Distinguish "still fetching the dataset" from "fetch finished and this id
  // genuinely isn't in it" (deleted, or outside the loaded window) — without
  // this, a stale/unresolvable ?edit=<id> deep-link left the drawer spinning
  // forever with no way out (code-reviewer finding #3, #2370 delta).
  const listingNotFound = !isResolvingListing && !listing;
  const showLoading = !listingNotFound && (isResolvingListing || !listing || !form);

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl overflow-y-auto p-0"
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            requestClose();
          }}
        >
          {listingNotFound ? (
            <div className="flex flex-col min-h-full">
              <SheetHeader className="px-6 pt-6 pb-4 border-b">
                <SheetTitle>Listing not found</SheetTitle>
                <SheetDescription>
                  This listing couldn't be found — it may have been deleted or the id is invalid.
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 flex items-center justify-center px-6 py-12 text-center">
                <div className="space-y-4">
                  <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Try closing this panel and reloading the inventory list, or search for the
                    listing again.
                  </p>
                </div>
              </div>
              <SheetFooter className="px-6 py-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false, { skipUnsavedCheck: true })}
                >
                  Close panel
                </Button>
              </SheetFooter>
            </div>
          ) : showLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex flex-col min-h-full">
              <SheetHeader className="px-6 pt-6 pb-4 border-b">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <SheetTitle className="flex items-center gap-2">
                      {formatDisplayId(listing.listing_number)}
                      <Badge variant="outline">{listing.status ?? 'unknown'}</Badge>
                      {isPubliclyVisible(listing) ? (
                        <Badge className="bg-green-500/10 text-green-700 border-0">Public</Badge>
                      ) : (
                        <Badge className="bg-gray-500/10 text-gray-600 border-0">Hidden</Badge>
                      )}
                    </SheetTitle>
                    <SheetDescription>{listing.title || 'Untitled listing'}</SheetDescription>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/listing/${listing.id}`} target="_blank" rel="noopener noreferrer">
                      {isPubliclyVisible(listing) ? 'View public listing' : 'Preview (draft)'}
                      <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                    </Link>
                  </Button>
                </div>

                {isStale && (
                  <div
                    role="alert"
                    className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                  >
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>
                      This listing changed elsewhere since you opened it (last updated{' '}
                      {formatRelativeDate(listing.updated_at)}). Saving may overwrite that change.
                    </span>
                  </div>
                )}

                {listing.status === 'PENDING_REVIEW' && (
                  <div className="mt-3 flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                    <ShieldAlert className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>
                      This listing is awaiting moderation. Saving here only updates its fields — it
                      never approves, rejects, or changes its status. Decide approval from{' '}
                      <Link to="/admin/listings/pending" className="underline font-medium">
                        Pending approvals
                      </Link>
                      .
                    </span>
                  </div>
                )}
              </SheetHeader>

              <div className="flex-1 px-6 py-5 space-y-8">
                {Object.keys(errors).length > 0 && (
                  <div
                    role="alert"
                    className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                  >
                    <p className="font-medium mb-1">Fix the following before saving:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {Object.values(errors).map((msg) => (
                        <li key={msg}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <fieldset disabled={updateListing.isPending} className="space-y-8">
                  {/* Basic details */}
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
                          onValueChange={(v) => setForm({ ...form, seller_type: v as SellerType })}
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

                  <Separator />

                  {/* Property details */}
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

                  <Separator />

                  {/* Price & area */}
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

                  <Separator />

                  {/* Location */}
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
                        setForm((prev) =>
                          prev ? { ...prev, latitude: value.lat, longitude: value.lng } : prev,
                        )
                      }
                      onLocalityConfirmed={(locality) =>
                        setForm((prev) => (prev ? { ...prev, locality } : prev))
                      }
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

                  <Separator />

                  {/* Photos / media — view-only (see Honest Gaps: no confirmed admin write path) */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Photos
                    </h3>
                    <MediaGallery listing={listing} />
                  </section>

                  <Separator />

                  {/* Description */}
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

                  <Separator />

                  {/* Broker / contact */}
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

                  <Separator />

                  {/* Publication & lifecycle */}
                  <section className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Publication &amp; lifecycle
                    </h3>

                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <Label>Public visibility</Label>
                        <p className="text-sm text-muted-foreground">
                          {canTogglePublish(listing)
                            ? 'Controls whether this LIVE listing is visible to the public.'
                            : `Only LIVE listings can be published/unpublished. This listing is ${listing.status}.`}
                        </p>
                      </div>
                      <Switch
                        checked={listing.is_valid}
                        disabled={!canTogglePublish(listing) || updateListing.isPending}
                        onCheckedChange={handleTogglePublish}
                        aria-label="Toggle public visibility"
                      />
                    </div>

                    {needsAttention(listing) && (
                      <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <span>This listing is flagged as needing attention.</span>
                      </div>
                    )}

                    <div className="rounded-lg border p-3 space-y-2">
                      <p className="text-sm font-medium">
                        Quality score: {listing.quality_score ?? 'Not scored'}
                        {listing.quality_score != null && (
                          <span className="text-muted-foreground font-normal">
                            {' '}
                            ({QUALITY_BUCKET_LABELS[getQualityBucket(listing.quality_score)]})
                          </span>
                        )}
                      </p>
                      <QualityBreakdown breakdown={listing.quality_breakdown} />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {listing.status !== 'ARCHIVED' ? (
                        <Button type="button" variant="outline" onClick={() => setConfirmArchive(true)}>
                          <Archive className="h-4 w-4 mr-2" />
                          Archive
                        </Button>
                      ) : (
                        <Button type="button" variant="outline" onClick={() => setConfirmRestore(true)}>
                          <ArchiveRestore className="h-4 w-4 mr-2" />
                          Restore to draft
                        </Button>
                      )}

                      {listing.status === 'SCRAPED' && (
                        <Button
                          type="button"
                          variant="outline"
                          className="text-green-600 border-green-200 hover:bg-green-50"
                          onClick={() => setApproveScrapedConfirm(true)}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Approve as live
                        </Button>
                      )}
                      {listing.status === 'REJECTED' && (
                        <Button
                          type="button"
                          variant="outline"
                          className="text-blue-600 border-blue-200 hover:bg-blue-50"
                          onClick={() => setConfirmRestoreRejected(true)}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Restore to live
                        </Button>
                      )}
                    </div>
                  </section>

                  <Separator />

                  {/* Activity history */}
                  <section id="listing-editor-activity" className="space-y-3" data-initial-focus={initialSection === 'activity'}>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Activity history
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Only actions routed through the admin API (approve, reject, archive, restore,
                      etc.) appear here. Plain field edits and publish/unpublish toggles saved from
                      this drawer are NOT recorded in this log.
                    </p>
                    {activity.isLoading ? (
                      <p className="text-sm text-muted-foreground">Loading activity…</p>
                    ) : activity.isError ? (
                      <p className="text-sm text-destructive">Could not load activity.</p>
                    ) : activity.entries.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No recorded activity for this listing.</p>
                    ) : (
                      <ul className="space-y-2">
                        {activity.entries.map((entry) => (
                          <li key={entry.id} className="text-sm border rounded-md px-3 py-2">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{entry.action.replace(/_/g, ' ')}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatRelativeDate(entry.createdAt)}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </fieldset>
              </div>

              <SheetFooter className="px-6 py-4 border-t sticky bottom-0 bg-background">
                <Button type="button" variant="outline" onClick={requestClose}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleSaveClick} disabled={updateListing.isPending || !isDirty}>
                  {updateListing.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save changes
                </Button>
              </SheetFooter>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Unsaved changes */}
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved edits on this listing. Closing now will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDiscard(false);
                onOpenChange(false, { skipUnsavedCheck: true });
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Stale save confirmation */}
      <AlertDialog open={confirmStaleSave} onOpenChange={setConfirmStaleSave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save anyway?</AlertDialogTitle>
            <AlertDialogDescription>
              This listing was updated elsewhere since you opened it. Saving will overwrite that
              change with what you see here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmStaleSave(false);
                void doSave();
              }}
            >
              Save anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Publish / unpublish confirmation */}
      <AlertDialog open={!!publishAction} onOpenChange={(o) => !o && setPublishAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {publishAction === 'publish' ? 'Publish this listing?' : 'Unpublish this listing?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {publishAction === 'publish'
                ? 'This will make the listing visible to the public again.'
                : 'This will hide the listing from public view. It stays LIVE and can be re-published anytime.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmPublishToggle()}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive confirmation */}
      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this listing?</AlertDialogTitle>
            <AlertDialogDescription>
              The listing will be removed from active inventory and hidden from the public. You
              can restore it to draft later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="archive-reason">Reason (optional)</Label>
            <Textarea
              id="archive-reason"
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={archiveMutation.isPending}
              onClick={() =>
                listing && archiveMutation.mutate({ id: listing.id, reasonNote: archiveReason.trim() || undefined })
              }
            >
              {archiveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore (from archived) confirmation */}
      <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this listing?</AlertDialogTitle>
            <AlertDialogDescription>
              The listing will move back to Draft status. It will not be public until re-approved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={restoreMutation.isPending}
              onClick={() => listing && restoreMutation.mutate(listing.id)}
            >
              {restoreMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approve-scraped confirmation (legacy SCRAPED -> LIVE path, distinct from the
          PENDING_REVIEW approve/reject workflow owned by #2369) */}
      <AlertDialog open={approveScrapedConfirm} onOpenChange={setApproveScrapedConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this scraped listing as live?</AlertDialogTitle>
            <AlertDialogDescription>
              This publishes the listing directly, without going through the pending-approval
              queue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={approveScrapedMutation.isPending}
              onClick={() => listing && approveScrapedMutation.mutate(listing.id)}
            >
              {approveScrapedMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Approve as live
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore-rejected confirmation */}
      <AlertDialog open={confirmRestoreRejected} onOpenChange={setConfirmRestoreRejected}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this rejected listing to live?</AlertDialogTitle>
            <AlertDialogDescription>Provide a moderation note.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="restore-rejected-note">Moderation note</Label>
            <Textarea
              id="restore-rejected-note"
              value={restoreRejectedNote}
              onChange={(e) => setRestoreRejectedNote(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!restoreRejectedNote.trim() || restoreRejectedMutation.isPending}
              onClick={() =>
                listing &&
                restoreRejectedMutation.mutate({ id: listing.id, moderationNote: restoreRejectedNote.trim() })
              }
            >
              {restoreRejectedMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Restore to live
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
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

/** quality_breakdown may be a canonical shape or {status:"insufficient_data", missing:[...]}. Parse defensively. */
function QualityBreakdown({ breakdown }: { breakdown: unknown }) {
  if (breakdown == null) {
    return <p className="text-xs text-muted-foreground">Breakdown unavailable.</p>;
  }

  if (typeof breakdown === 'object' && breakdown !== null) {
    const obj = breakdown as Record<string, unknown>;
    if (obj.status === 'insufficient_data' && Array.isArray(obj.missing)) {
      return (
        <p className="text-xs text-muted-foreground">
          Insufficient data to score. Missing: {obj.missing.filter((m) => typeof m === 'string').join(', ') || '—'}
        </p>
      );
    }
    const entries = Object.entries(obj).filter(([, v]) => typeof v === 'number');
    if (entries.length > 0) {
      return (
        <ul className={cn('text-xs text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-0.5')}>
          {entries.map(([k, v]) => (
            <li key={k}>
              {k.replace(/_/g, ' ')}: {String(v)}
            </li>
          ))}
        </ul>
      );
    }
  }

  return <p className="text-xs text-muted-foreground">Breakdown unavailable.</p>;
}
