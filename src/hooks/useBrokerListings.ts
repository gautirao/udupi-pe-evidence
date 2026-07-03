import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type PageResponse } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

// Mirrors backend CreateRequest DTO
interface CreateListingRequest {
  propertyType: string;
  title?: string;
  locality?: string;
  price?: number;
  description?: string;
  landArea?: number;
  landAreaUnit?: string;
  bedrooms?: number;
  builtArea?: number;
  builtAreaUnit?: string;
  // Commercial & rent fields
  listingPurpose?: string;
  carpetArea?: number;
  carpetAreaUnit?: string;
  floorNumber?: number;
  totalFloors?: number;
  furnishingStatus?: string;
  washrooms?: number;
  parkingCount?: number;
  roadFrontageFt?: number;
  commercialUsage?: string;
  numberOfUnits?: number;
  monthlyRent?: number;
  securityDepositMonths?: number;
  lockInMonths?: number;
  // Agricultural land fields
  waterSource?: string;
  soilType?: string;
  roadAccess?: string;
  cultivationStatus?: string;
  ownershipType?: string;
  surveyNumber?: string;
  // Issue #1458 — new structured agri fields
  landCategory?: string;
  farmhouseAvailable?: boolean | null;
  fencingDone?: boolean | null;
  // M38-13A (#1626) — residential typed-listing fields (additive, all nullable).
  bathrooms?: number;
  balconies?: number;
  facing?: string;
  availabilityTimeline?: string;
  superBuiltArea?: number;
  superBuiltAreaUnit?: string;
  propertyAge?: string;
  residentialWaterSource?: string;
  parking2wCount?: number;
  parking4wCount?: number;
  roadWidthFt?: number;
  plotDimensions?: string;
  conversionStatus?: string;
  khataNumber?: string;
  propertyTaxPid?: string;
  approvingAuthority?: string;
  projectName?: string;
  builderName?: string;
  maintenancePaise?: number;
  possessionStatus?: string;
  hasLift?: boolean | null;
  hasPowerBackup?: boolean | null;
  isGated?: boolean | null;
  hasGarden?: boolean | null;
  hasTerrace?: boolean | null;
  hasCompound?: boolean | null;
  hasServantRoom?: boolean | null;
  isCornerPlot?: boolean | null;
  hasBoundaryWall?: boolean | null;
  isGatedLayout?: boolean | null;
  hasWaterConnection?: boolean | null;
  hasElectricityConnection?: boolean | null;
  hasDrainage?: boolean | null;
  priceNegotiable?: boolean | null;
  rentNegotiable?: boolean | null;
  petsAllowed?: boolean | null;
  maintenanceIncluded?: boolean | null;
  amenities?: string[];
  specialLocationViews?: string[];
  preferredTenants?: string[];
  // #1684 [M38-13B] — commercial typed-listing fields (additive, all
  // optional/nullable). Mirrors the #1730 frozen write contract exactly —
  // see ListingController.validateCommercialFields for per-subtype/purpose
  // gating (enforced server-side; FE visibility in listingFieldConfig.ts
  // mirrors it to avoid a 400 on submit).
  commercialSubtype?: string;
  floorChoice?: string;
  floorMode?: string;
  hubType?: string;
  washroomsPublic?: number;
  washroomsPrivate?: number;
  parkingPublicCount?: number;
  parkingPrivateCount?: number;
  officeSeats?: number;
  officeCabins?: number;
  officeMeetingRooms?: number;
  occupancyStatus?: string;
  powerLoadKva?: number;
  warehouseClearHeightFt?: number;
  warehouseLoadingBays?: number;
  warehouseTruckAccess?: boolean | null;
  warehouseFlooring?: string;
  commercialZoning?: string;
  commercialOwnership?: string;
  commercialApprovals?: string;
  expectedRentalYieldPct?: number;
  currentMonthlyIncomePaise?: number;
  leaseTermMonths?: number;
  leaseEscalationPct?: number;
  commercialFurnishingStatus?: string;
  commercialAvailability?: string;
  commercialAreaUnit?: string;
  utilities?: string[];
  suitableUses?: string[];
}

// Mirrors backend UpdateRequest DTO
export interface UpdateListingRequest {
  title?: string;
  description?: string;
  price?: number;
  propertyType?: string;
  locality?: string;
  landArea?: number;
  landAreaUnit?: string;
  bedrooms?: number;
  builtArea?: number;
  builtAreaUnit?: string;
  latitude?: number;
  longitude?: number;
  addressConfirmed?: boolean;
  videoUrl?: string | null;
  applyVideoUrl?: boolean;
  reraNumber?: string | null;
  // Commercial & rent fields
  listingPurpose?: string;
  carpetArea?: number;
  carpetAreaUnit?: string;
  floorNumber?: number;
  totalFloors?: number;
  furnishingStatus?: string;
  washrooms?: number;
  parkingCount?: number;
  roadFrontageFt?: number;
  commercialUsage?: string;
  numberOfUnits?: number;
  monthlyRent?: number;
  securityDepositMonths?: number;
  lockInMonths?: number;
  // Agricultural land fields
  waterSource?: string;
  soilType?: string;
  roadAccess?: string;
  cultivationStatus?: string;
  ownershipType?: string;
  surveyNumber?: string;
  /** Stringified GeoJSON Polygon for agricultural plot boundary; null clears; omit = no change */
  boundary?: string | null;
  // Issue #1458 — new structured agri fields
  landCategory?: string;
  farmhouseAvailable?: boolean | null;
  fencingDone?: boolean | null;
  // M38-13A (#1626) — residential typed-listing fields (additive, all nullable).
  bathrooms?: number;
  balconies?: number;
  facing?: string;
  availabilityTimeline?: string;
  superBuiltArea?: number;
  superBuiltAreaUnit?: string;
  propertyAge?: string;
  residentialWaterSource?: string;
  parking2wCount?: number;
  parking4wCount?: number;
  roadWidthFt?: number;
  plotDimensions?: string;
  conversionStatus?: string;
  khataNumber?: string;
  propertyTaxPid?: string;
  approvingAuthority?: string;
  projectName?: string;
  builderName?: string;
  maintenancePaise?: number;
  possessionStatus?: string;
  hasLift?: boolean | null;
  hasPowerBackup?: boolean | null;
  isGated?: boolean | null;
  hasGarden?: boolean | null;
  hasTerrace?: boolean | null;
  hasCompound?: boolean | null;
  hasServantRoom?: boolean | null;
  isCornerPlot?: boolean | null;
  hasBoundaryWall?: boolean | null;
  isGatedLayout?: boolean | null;
  hasWaterConnection?: boolean | null;
  hasElectricityConnection?: boolean | null;
  hasDrainage?: boolean | null;
  priceNegotiable?: boolean | null;
  rentNegotiable?: boolean | null;
  petsAllowed?: boolean | null;
  maintenanceIncluded?: boolean | null;
  amenities?: string[];
  specialLocationViews?: string[];
  preferredTenants?: string[];
  // #1684 [M38-13B] — commercial typed-listing fields (additive; see
  // CreateListingRequest above for the field-by-field contract note).
  commercialSubtype?: string;
  floorChoice?: string;
  floorMode?: string;
  hubType?: string;
  washroomsPublic?: number;
  washroomsPrivate?: number;
  parkingPublicCount?: number;
  parkingPrivateCount?: number;
  officeSeats?: number;
  officeCabins?: number;
  officeMeetingRooms?: number;
  occupancyStatus?: string;
  powerLoadKva?: number;
  warehouseClearHeightFt?: number;
  warehouseLoadingBays?: number;
  warehouseTruckAccess?: boolean | null;
  warehouseFlooring?: string;
  commercialZoning?: string;
  commercialOwnership?: string;
  commercialApprovals?: string;
  expectedRentalYieldPct?: number;
  currentMonthlyIncomePaise?: number;
  leaseTermMonths?: number;
  leaseEscalationPct?: number;
  commercialFurnishingStatus?: string;
  commercialAvailability?: string;
  commercialAreaUnit?: string;
  utilities?: string[];
  suitableUses?: string[];
}

// Mirrors backend ListingResponse DTO
export interface ListingResponse {
  id: string;
  status: string;
  propertyType: string;
  title: string | null;
  locality: string | null;
  price: number | null;
  description: string | null;
  landArea: number | null;
  landAreaUnit: string | null;
  bedrooms: number | null;
  builtArea: number | null;
  builtAreaUnit: string | null;
  latitude: number | null;
  longitude: number | null;
  addressConfirmed: boolean;
  imageCount: number;
  firstImageUrl: string | null;
  rejectionReason: string | null;
  videoUrl: string | null;
  reraNumber: string | null;
  listingNumber?: number;
  displayId?: string;
  createdAt: string;
  updatedAt: string;
  // Commercial & rent fields
  listingPurpose: string | null;
  carpetArea: number | null;
  carpetAreaUnit: string | null;
  floorNumber: number | null;
  totalFloors: number | null;
  furnishingStatus: string | null;
  washrooms: number | null;
  parkingCount: number | null;
  roadFrontageFt: number | null;
  commercialUsage: string | null;
  numberOfUnits: number | null;
  monthlyRent: number | null;
  securityDepositMonths: number | null;
  lockInMonths: number | null;
  sellerType: string | null;
  earnedBadgeCount: number;
  /** Area key used for locality insights — e.g. "KA|UDUPI|MANIPAL" */
  areaKey: string | null;
  // Agricultural land fields (null for non-agri listings)
  waterSource: string | null;
  soilType: string | null;
  roadAccess: string | null;
  cultivationStatus: string | null;
  ownershipType: string | null;
  surveyNumber: string | null;
  /** Stringified GeoJSON Polygon from backend; absent/null for non-agri listings */
  boundary?: string | null;
  // Issue #1458 — new structured agri fields (null for non-agri or not-set)
  landCategory?: string | null;
  farmhouseAvailable?: boolean | null;
  fencingDone?: boolean | null;
  /**
   * Boundary-derived area in acres (ST_Area, 2dp) for agri listings with a saved
   * boundary; absent/null when no boundary or non-agri. Distinct from broker-declared
   * landArea/landAreaUnit — never auto-synced.
   */
  computedAreaAcres?: number | null;
  // M38-13A (#1626) — residential typed-listing fields (additive, all nullable;
  // null for legacy pre-V103 rows and non-residential property types — honest-null,
  // never fabricated/defaulted).
  bathrooms?: number | null;
  balconies?: number | null;
  facing?: string | null;
  availabilityTimeline?: string | null;
  superBuiltArea?: number | null;
  superBuiltAreaUnit?: string | null;
  propertyAge?: string | null;
  residentialWaterSource?: string | null;
  parking2wCount?: number | null;
  parking4wCount?: number | null;
  roadWidthFt?: number | null;
  plotDimensions?: string | null;
  conversionStatus?: string | null;
  khataNumber?: string | null;
  propertyTaxPid?: string | null;
  approvingAuthority?: string | null;
  projectName?: string | null;
  builderName?: string | null;
  maintenancePaise?: number | null;
  possessionStatus?: string | null;
  hasLift?: boolean | null;
  hasPowerBackup?: boolean | null;
  isGated?: boolean | null;
  hasGarden?: boolean | null;
  hasTerrace?: boolean | null;
  hasCompound?: boolean | null;
  hasServantRoom?: boolean | null;
  isCornerPlot?: boolean | null;
  hasBoundaryWall?: boolean | null;
  isGatedLayout?: boolean | null;
  hasWaterConnection?: boolean | null;
  hasElectricityConnection?: boolean | null;
  hasDrainage?: boolean | null;
  priceNegotiable?: boolean | null;
  rentNegotiable?: boolean | null;
  petsAllowed?: boolean | null;
  maintenanceIncluded?: boolean | null;
  amenities?: string[];
  specialLocationViews?: string[];
  preferredTenants?: string[];
  // #1684 [M38-13B] — commercial typed-listing fields (additive, all
  // nullable; null for non-commercial property types and legacy pre-#1730
  // commercial rows with no typed detail saved yet — honest-null, never
  // fabricated/defaulted). See CreateListingRequest above for field notes.
  commercialSubtype?: string | null;
  floorChoice?: string | null;
  floorMode?: string | null;
  hubType?: string | null;
  washroomsPublic?: number | null;
  washroomsPrivate?: number | null;
  parkingPublicCount?: number | null;
  parkingPrivateCount?: number | null;
  officeSeats?: number | null;
  officeCabins?: number | null;
  officeMeetingRooms?: number | null;
  occupancyStatus?: string | null;
  powerLoadKva?: number | null;
  warehouseClearHeightFt?: number | null;
  warehouseLoadingBays?: number | null;
  warehouseTruckAccess?: boolean | null;
  warehouseFlooring?: string | null;
  commercialZoning?: string | null;
  commercialOwnership?: string | null;
  commercialApprovals?: string | null;
  expectedRentalYieldPct?: number | null;
  currentMonthlyIncomePaise?: number | null;
  leaseTermMonths?: number | null;
  leaseEscalationPct?: number | null;
  commercialFurnishingStatus?: string | null;
  commercialAvailability?: string | null;
  commercialAreaUnit?: string | null;
  utilities?: string[];
  suitableUses?: string[];
}

/**
 * Fetches the current broker's own listings from the paginated endpoint
 * GET /api/listings/mine — returns Page<ListingResponse>.
 *
 * @param page  - zero-based page number (default 0)
 * @param size  - page size (default 20, matches backend default)
 */
export function useBrokerMyListings(page = 0, size = 20) {
  return useQuery({
    queryKey: ['dealer-listings', page, size],
    queryFn: async () => {
      const response = await api.get<PageResponse<ListingResponse>>(
        `/api/listings/mine?page=${page}&size=${size}`,
      );
      return {
        listings: response.content,
        totalPages: response.page.totalPages,
        totalElements: response.page.totalElements,
        currentPage: response.page.number,
        pageSize: response.page.size,
        isFirst: response.page.number === 0,
        isLast: response.page.number + 1 >= response.page.totalPages,
      };
    },
  });
}

interface BrokerListingsParams {
  status?: string;
  sort?: string;
  size?: number;
}

/**
 * Infinite-query variant of useBrokerMyListings.
 * Pages are appended on each "load more" call.
 * Use `data.pages.flatMap(p => p.listings)` to get all loaded listings.
 *
 * Accepts optional filter/sort params that are forwarded to the backend.
 */
export function useBrokerMyListingsInfinite(params: BrokerListingsParams = {}) {
  const { status, sort = 'createdAt,desc', size = 20 } = params;

  return useInfiniteQuery({
    queryKey: ['dealer-listings-infinite', size, status, sort],
    staleTime: 60_000,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const searchParams = new URLSearchParams();
      searchParams.set('page', String(pageParam));
      searchParams.set('size', String(size));
      searchParams.set('sort', sort);
      if (status) {
        searchParams.set('status', status);
      }
      const response = await api.get<PageResponse<ListingResponse>>(
        `/api/listings/mine?${searchParams.toString()}`,
      );
      return {
        listings: response.content,
        totalElements: response.page.totalElements,
        isLast: response.page.number + 1 >= response.page.totalPages,
        nextPage: response.page.number + 1,
      };
    },
    getNextPageParam: (lastPage) => (lastPage.isLast ? undefined : lastPage.nextPage),
  });
}

/** Response shape for GET /api/listings/mine/stats */
export interface BrokerListingStats {
  draftCount: number;
  pendingReviewCount: number;
  liveCount: number;
  rejectedCount: number;
  totalCount: number;
}

/**
 * Fetches listing count stats by status for the current broker.
 * Used by filter chips and dashboard cards.
 */
export function useBrokerListingStats() {
  return useQuery({
    queryKey: ['dealer-listing-stats'],
    queryFn: () => api.get<BrokerListingStats>('/api/listings/mine/stats'),
  });
}

// ── Quality Summary (GET /api/listings/mine/quality-summary) ─────────────────

export type QualityState = 'PENDING' | 'PARTIAL' | 'COMPLETE';
export type EngagementState = 'UNAVAILABLE';
export type DemandGapState = 'LIMITED_DATA';

export interface ActionSignalItem {
  count: number;
  state: QualityState;
}

/** Response shape for GET /api/listings/mine/quality-summary */
export interface BrokerQualitySummaryResponse {
  portfolio: {
    activeListings: number;
    totalListings: number;
  };
  quality: {
    state: QualityState;
    averageQualityScore: number | null;
    countComputed: number;
    countTotal: number;
    percentageComputed: number | null;
  };
  actionSignals: {
    needsFixes: ActionSignalItem;
    missingLocation: ActionSignalItem;
    incomplete: ActionSignalItem;
    buyerReady: ActionSignalItem;
  };
  engagement: {
    state: EngagementState;
    views: null;
    enquiries: null;
    reason: string;
  };
  demandGap: {
    state: DemandGapState;
    signal: null;
    reason: string;
  };
}

const QUALITY_SUMMARY_KEY = ['broker-quality-summary'] as const;

/**
 * Fetches the quality summary for the current broker's portfolio.
 * GET /api/listings/mine/quality-summary — auth via existing Supabase Bearer JWT.
 */
export function useBrokerQualitySummary() {
  return useQuery({
    queryKey: QUALITY_SUMMARY_KEY,
    queryFn: () =>
      api.get<BrokerQualitySummaryResponse>('/api/listings/mine/quality-summary'),
    staleTime: 60_000,
  });
}

export function useCreateListing() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: CreateListingRequest) =>
      api.post<ListingResponse>('/api/listings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-listings'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listings-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listing-stats'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create listing',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Fetches a single listing by ID from GET /api/listings/{id}.
 */
export function useGetListing(id: string) {
  return useQuery({
    queryKey: ['listing-broker', id],
    queryFn: () => api.get<ListingResponse>(`/api/listings/${id}`),
    enabled: !!id,
  });
}

/**
 * Updates a listing via PUT /api/listings/{id}.
 * Invalidates the broker-listings and single listing query on success.
 */
export function useUpdateListing(id: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: UpdateListingRequest) =>
      api.put<ListingResponse>(`/api/listings/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-listings'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listings-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listing-stats'] });
      queryClient.invalidateQueries({ queryKey: ['listing-broker', id] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update listing',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Deletes a DRAFT listing via DELETE /api/listings/{id}.
 * Invalidates the broker-listings query on success.
 */
export function useDeleteListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (listingId: string) =>
      api.delete<void>(`/api/listings/${listingId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-listings'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listings-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listing-stats'] });
    },
  });
}

/**
 * Duplicates an existing listing by fetching it and creating a new DRAFT
 * with the same core fields (type, title, locality, price, description, areas).
 * Images, address, and video are NOT copied — the broker adds those fresh.
 */
export function useDuplicateListing() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (sourceId: string) => {
      const source = await api.get<ListingResponse>(`/api/listings/${sourceId}`);
      return api.post<ListingResponse>('/api/listings', {
        propertyType: source.propertyType,
        title: source.title ? `Copy of ${source.title}` : undefined,
        locality: source.locality ?? undefined,
        price: source.price ?? undefined,
        description: source.description ?? undefined,
        landArea: source.landArea ?? undefined,
        landAreaUnit: source.landAreaUnit ?? undefined,
        bedrooms: source.bedrooms ?? undefined,
        builtArea: source.builtArea ?? undefined,
        builtAreaUnit: source.builtAreaUnit ?? undefined,
        listingPurpose: source.listingPurpose ?? undefined,
        carpetArea: source.carpetArea ?? undefined,
        carpetAreaUnit: source.carpetAreaUnit ?? undefined,
        floorNumber: source.floorNumber ?? undefined,
        totalFloors: source.totalFloors ?? undefined,
        furnishingStatus: source.furnishingStatus ?? undefined,
        washrooms: source.washrooms ?? undefined,
        parkingCount: source.parkingCount ?? undefined,
        roadFrontageFt: source.roadFrontageFt ?? undefined,
        commercialUsage: source.commercialUsage ?? undefined,
        numberOfUnits: source.numberOfUnits ?? undefined,
        monthlyRent: source.monthlyRent ?? undefined,
        securityDepositMonths: source.securityDepositMonths ?? undefined,
        lockInMonths: source.lockInMonths ?? undefined,
        // Agricultural land fields — copy when duplicating an agri listing
        waterSource: source.waterSource ?? undefined,
        soilType: source.soilType ?? undefined,
        roadAccess: source.roadAccess ?? undefined,
        cultivationStatus: source.cultivationStatus ?? undefined,
        ownershipType: source.ownershipType ?? undefined,
        surveyNumber: source.surveyNumber ?? undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-listings'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listings-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listing-stats'] });
      toast({ title: 'Listing duplicated', description: 'Edit your new draft to customize it.' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to duplicate listing',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Bulk-deletes listings via POST /api/listings/bulk-delete.
 * Only DRAFT and REJECTED listings can be deleted.
 */
export function useBulkDeleteListings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) =>
      api.post<{ deleted: number; skipped: number; errors: string[] }>(
        '/api/listings/bulk-delete',
        { ids },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-listings'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listings-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listing-stats'] });
    },
  });
}

/**
 * Submits a listing for review via POST /api/listings/{id}/submit.
 * Backend validates address_confirmed=true, imageCount>=3, and required fields.
 * Throws an error with `.status` and `.body` attached for 422 responses.
 */
export function useSubmitListing(listingId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!listingId) throw new Error('No listing ID');
      return api.post<ListingResponse>(`/api/listings/${listingId}/submit`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-listings'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listings-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listing-stats'] });
      if (listingId) {
        queryClient.invalidateQueries({ queryKey: ['listing-broker', listingId] });
      }
    },
  });
}

/** Parses an ApiError body for a user-readable message, falling back to error.message. */
function parseErrorMessage(error: Error): string {
  if ('body' in error) {
    const body = (error as { body: unknown }).body;
    if (body !== null && typeof body === 'object' && 'error' in body && typeof (body as Record<string, unknown>).error === 'string') {
      return (body as Record<string, string>).error;
    }
  }
  return error.message;
}

/**
 * Archives a LIVE or REJECTED listing via POST /api/listings/{id}/archive.
 * On success transitions status to ARCHIVED.
 */
export function useArchiveListing(listingId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      if (!listingId) throw new Error('No listing ID');
      return api.post<ListingResponse>(`/api/listings/${listingId}/archive`);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dealer-listings'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listings-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listing-stats'] });
      if (listingId) {
        queryClient.invalidateQueries({ queryKey: ['listing-broker', listingId] });
        // Directly patch cached listing status from the mutation response so the
        // UI reflects the new status immediately, even if a subsequent GET returns
        // stale data (backend transaction commit timing).
        for (const key of [['listing-public', listingId], ['listing-detail', listingId]] as const) {
          queryClient.setQueryData(key, (old: Record<string, unknown> | undefined) =>
            old ? { ...old, status: data.status } : undefined,
          );
        }
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to archive listing',
        description: parseErrorMessage(error),
        variant: 'destructive',
      });
    },
  });
}

/**
 * Withdraws a PENDING_REVIEW listing back to DRAFT via PUT /api/listings/{id}/withdraw.
 * Returns 204 No Content — response body is never read.
 */
export function useWithdrawListing(listingId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      if (!listingId) throw new Error('No listing ID');
      await api.put<void>(`/api/listings/${listingId}/withdraw`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-listings'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listings-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listing-stats'] });
      if (listingId) {
        queryClient.invalidateQueries({ queryKey: ['listing-broker', listingId] });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to withdraw listing',
        description: parseErrorMessage(error),
        variant: 'destructive',
      });
    },
  });
}

/**
 * Reopens a REJECTED listing back to DRAFT via POST /api/listings/{id}/reopen.
 */
export function useReopenListing(listingId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      if (!listingId) throw new Error('No listing ID');
      return api.post<ListingResponse>(`/api/listings/${listingId}/reopen`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-listings'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listings-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listing-stats'] });
      if (listingId) {
        queryClient.invalidateQueries({ queryKey: ['listing-broker', listingId] });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to reopen listing',
        description: parseErrorMessage(error),
        variant: 'destructive',
      });
    },
  });
}

/**
 * Reopens an ARCHIVED listing back to DRAFT via POST /api/listings/{id}/reopen-as-draft.
 */
export function useReopenAsDraftListing(listingId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      if (!listingId) throw new Error('No listing ID');
      return api.post<ListingResponse>(`/api/listings/${listingId}/reopen-as-draft`);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dealer-listings'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listings-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listing-stats'] });
      if (listingId) {
        queryClient.invalidateQueries({ queryKey: ['listing-broker', listingId] });
        // Directly patch cached listing status from the mutation response so the
        // UI reflects the new status immediately, even if a subsequent GET returns
        // stale data (backend transaction commit timing).
        for (const key of [['listing-public', listingId], ['listing-detail', listingId]] as const) {
          queryClient.setQueryData(key, (old: Record<string, unknown> | undefined) =>
            old ? { ...old, status: data.status } : undefined,
          );
        }
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to reopen listing as draft',
        description: parseErrorMessage(error),
        variant: 'destructive',
      });
    },
  });
}

/**
 * Resubmits an ARCHIVED listing for review via POST /api/listings/{id}/submit.
 * Uses the same /submit endpoint as the DRAFT → PENDING_REVIEW path.
 */
export function useResubmitArchivedListing(listingId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      if (!listingId) throw new Error('No listing ID');
      return api.post<ListingResponse>(`/api/listings/${listingId}/submit`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-listings'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listings-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listing-stats'] });
      if (listingId) {
        queryClient.invalidateQueries({ queryKey: ['listing-broker', listingId] });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to resubmit listing',
        description: parseErrorMessage(error),
        variant: 'destructive',
      });
    },
  });
}

/**
 * Restores an ARCHIVED listing to LIVE via PUT /api/listings/{id}/restore.
 * Always shown regardless of eligibility — backend returns 422 if ineligible.
 */
export function useRestoreListing(listingId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      if (!listingId) throw new Error('No listing ID');
      return api.put<ListingResponse>(`/api/listings/${listingId}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-listings'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listings-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-listing-stats'] });
      if (listingId) {
        queryClient.invalidateQueries({ queryKey: ['listing-broker', listingId] });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to restore listing',
        description: parseErrorMessage(error),
        variant: 'destructive',
      });
    },
  });
}

// Legacy aliases — kept for backward compatibility with old useDealerListings imports
/** @deprecated Use useBrokerMyListings */
export { useBrokerMyListings as useDealerMyListings };
/** @deprecated Use useBrokerMyListingsInfinite */
export { useBrokerMyListingsInfinite as useDealerMyListingsInfinite };
/** @deprecated Use useBrokerListingStats */
export { useBrokerListingStats as useDealerListingStats };
