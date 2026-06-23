import { PropertyListing, PropertyImage, PropertyType } from '@/hooks/usePropertyListings';
import { DiscoverMarker } from '@/hooks/useDiscoverMarkers';
import { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import { DiscoverListingItem } from '@/hooks/useDiscoverListings';
import { DiscoverFilteredMarker } from '@/hooks/useDiscoverFilteredMarkers';

/**
 * Map a skinny DiscoverMarker (city-level cluster pin) into the full
 * PropertyListing shape required by PropertyMap / MarkerClusterLayer.
 * All fields not present in the skinny marker are set to null/defaults.
 */
export function markerToPropertyListing(
  m: DiscoverMarker,
  now: string,
): PropertyListing & { images?: PropertyImage[] } {
  return {
    id: m.id,
    latitude: m.lat,
    longitude: m.lon,
    property_type: 'other' as PropertyType,
    price: m.pricePaise != null ? Math.round(m.pricePaise / 100) : null,
    price_unit: null,
    title: null,
    locality: null,
    land_area: null,
    land_area_unit: null,
    built_area: null,
    built_area_unit: null,
    bedrooms: null,
    bathrooms: null,
    contact_info: null,
    contact_phone: null,
    description: null,
    confidence_score: null,
    language_detected: null,
    price_per_cent_paise: null,
    is_valid: true,
    is_duplicate: false,
    status: 'LIVE',
    created_at: now,
    updated_at: now,
    listing_purpose: '',
    carpet_area: null,
    carpet_area_unit: null,
    floor_number: null,
    total_floors: null,
    furnishing_status: null,
    washrooms: null,
    parking_count: null,
    road_frontage_ft: null,
    commercial_usage: null,
    number_of_units: null,
    monthly_rent: null,
    security_deposit_months: null,
    lock_in_months: null,
    seller_type: null,
    raw_post_id: null,
  };
}

/**
 * Map a DiscoverFilteredMarker (auth-filtered map pin) into the full PropertyListing shape.
 */
export function filteredMarkerToPropertyListing(
  m: DiscoverFilteredMarker,
  now: string,
): PropertyListing & { images?: PropertyImage[]; boundary_geojson?: string | null } {
  return {
    id: m.id,
    latitude: m.lat,
    longitude: m.lon,
    property_type: (m.propertyType ?? 'other') as PropertyType,
    price: m.pricePaise != null ? Math.round(m.pricePaise / 100) : null,
    price_unit: null,
    title: null,
    locality: m.locality ?? null,
    land_area: null,
    land_area_unit: null,
    built_area: null,
    built_area_unit: null,
    bedrooms: null,
    bathrooms: null,
    contact_info: null,
    contact_phone: null,
    description: null,
    confidence_score: null,
    language_detected: null,
    price_per_cent_paise: null,
    is_valid: true,
    is_duplicate: false,
    status: 'LIVE',
    created_at: now,
    updated_at: now,
    listing_purpose: '',
    carpet_area: null,
    carpet_area_unit: null,
    floor_number: null,
    total_floors: null,
    furnishing_status: null,
    washrooms: null,
    parking_count: null,
    road_frontage_ft: null,
    commercial_usage: null,
    number_of_units: null,
    monthly_rent: null,
    security_deposit_months: null,
    lock_in_months: null,
    seller_type: null,
    raw_post_id: null,
    boundary_geojson: m.boundary ?? null,
  };
}

/**
 * Map a DiscoverListingItem (paginated card) into the full PropertyListing shape.
 */
export function discoverListingToPropertyListing(
  l: DiscoverListingItem,
  now: string,
): PropertyListing & { images?: PropertyImage[] } {
  return {
    id: l.id,
    latitude: l.latitude ?? null,
    longitude: l.longitude ?? null,
    property_type: (l.propertyType ?? 'other') as PropertyType,
    price: l.pricePaise != null ? Math.round(l.pricePaise / 100) : null,
    price_unit: null,
    title: l.title ?? null,
    locality: l.locality ?? null,
    land_area: l.landArea ?? null,
    land_area_unit: l.landAreaUnit ?? null,
    built_area: l.builtArea ?? null,
    built_area_unit: l.builtAreaUnit ?? null,
    bedrooms: l.bedrooms ?? null,
    bathrooms: null,
    contact_info: null,
    contact_phone: null,
    description: null,
    confidence_score: null,
    language_detected: null,
    price_per_cent_paise: null,
    is_valid: true,
    is_duplicate: false,
    status: l.status ?? 'LIVE',
    created_at: l.createdAt ?? now,
    updated_at: l.updatedAt ?? now,
    listing_purpose: l.listingPurpose ?? '',
    carpet_area: null,
    carpet_area_unit: null,
    floor_number: null,
    total_floors: null,
    furnishing_status: null,
    washrooms: null,
    parking_count: null,
    road_frontage_ft: null,
    commercial_usage: null,
    number_of_units: null,
    monthly_rent: null,
    security_deposit_months: null,
    lock_in_months: null,
    seller_type: l.sellerType ?? null,
    raw_post_id: null,
    images: l.heroImageUrl ? [{ url: l.heroImageUrl }] : undefined,
  };
}

/**
 * Map a DiscoverCityListingItem (area-level listing) into the full
 * PropertyListing shape required by PropertyMap / MarkerClusterLayer.
 * The caller must pre-filter to items where lat/lon are non-null.
 */
export function cityListingToPropertyListing(
  l: DiscoverCityListingItem & { lat: number; lon: number },
  now: string,
): PropertyListing & { images?: PropertyImage[] } {
  return {
    id: l.id,
    latitude: l.lat,
    longitude: l.lon,
    property_type: (l.propertyType ?? 'other') as PropertyType,
    price: l.pricePaise != null ? Math.round(l.pricePaise / 100) : null,
    price_unit: null,
    title: l.title ?? null,
    locality: l.locality ?? null,
    land_area: l.landArea ?? null,
    land_area_unit: l.landAreaUnit ?? null,
    built_area: l.builtArea ?? null,
    built_area_unit: l.builtAreaUnit ?? null,
    bedrooms: l.bedrooms ?? null,
    bathrooms: l.bathrooms ?? null,
    contact_info: null,
    contact_phone: null,
    description: null,
    confidence_score: null,
    language_detected: null,
    price_per_cent_paise: null,
    is_valid: true,
    is_duplicate: false,
    status: 'LIVE',
    created_at: now,
    updated_at: now,
    listing_purpose: l.listingPurpose ?? '',
    carpet_area: null,
    carpet_area_unit: null,
    floor_number: null,
    total_floors: l.totalFloors ?? null,
    furnishing_status: l.furnishingStatus ?? null,
    washrooms: null,
    parking_count: l.parkingCount ?? null,
    road_frontage_ft: null,
    commercial_usage: null,
    number_of_units: null,
    monthly_rent: null,
    security_deposit_months: null,
    lock_in_months: null,
    seller_type: null,
    raw_post_id: null,
    // a3 mapper dependency — thread primaryImageUrl into images so MarkerPopoverCard
    // can display the listing image. Mirrors discoverListingToPropertyListing (~L163).
    images: l.primaryImageUrl ? [{ url: l.primaryImageUrl }] : undefined,
  };
}
