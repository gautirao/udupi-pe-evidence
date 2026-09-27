import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import type { PropertyType } from '@/lib/listing-constants';
import { fromGeoJsonString } from '@/lib/geoJsonUtils';

// Issue #1838 PR B — pure state-ownership extraction of the 14 base/scalar
// fields from EditListingForm, mirroring useAgriFields/useCommercialFields/
// useRentFields/useResidentialFields/useSharedFields. No behaviour change:
// same useState defaults, same prefill assignments (verbatim from the
// removed prefill effect lines).
//
// EXCLUDED (component-owned or moved elsewhere): the 6 never-hydrated UI
// fields (landAreaUnitError, builtAreaUnitError, canSubmitImages,
// videoUrlError, titleManuallyEdited, confirmedLocality — see
// useEditListingUiState.ts), all domain-specific fields owned by the other
// slice hooks, and wizard/nav state (useEditListingNavigation.ts).

export interface BaseFieldValues {
  title: string;
  description: string;
  priceRupees: number | null;
  propertyType: PropertyType | '';
  locality: string;
  landArea: number | null;
  landAreaUnit: string;
  bedrooms: string;
  builtArea: number | null;
  builtAreaUnit: string;
  reraNumber: string;
  videoUrl: string;
  listingPurpose: 'sale' | 'rent';
  boundaryCoords: [number, number][];
}

export interface BaseFieldSetters {
  setTitle: Dispatch<SetStateAction<string>>;
  setDescription: Dispatch<SetStateAction<string>>;
  setPriceRupees: Dispatch<SetStateAction<number | null>>;
  setPropertyType: Dispatch<SetStateAction<PropertyType | ''>>;
  setLocality: Dispatch<SetStateAction<string>>;
  setLandArea: Dispatch<SetStateAction<number | null>>;
  setLandAreaUnit: Dispatch<SetStateAction<string>>;
  setBedrooms: Dispatch<SetStateAction<string>>;
  setBuiltArea: Dispatch<SetStateAction<number | null>>;
  setBuiltAreaUnit: Dispatch<SetStateAction<string>>;
  setReraNumber: Dispatch<SetStateAction<string>>;
  setVideoUrl: Dispatch<SetStateAction<string>>;
  setListingPurpose: Dispatch<SetStateAction<'sale' | 'rent'>>;
  setBoundaryCoords: Dispatch<SetStateAction<[number, number][]>>;
}

export interface UseBaseFieldsResult {
  values: BaseFieldValues;
  setters: BaseFieldSetters;
  hydrate: (listing: ListingResponse) => void;
}

export function useBaseFields(): UseBaseFieldsResult {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceRupees, setPriceRupees] = useState<number | null>(null);
  const [propertyType, setPropertyType] = useState<PropertyType | ''>('');
  const [locality, setLocality] = useState('');
  const [landArea, setLandArea] = useState<number | null>(null);
  // Unit for land area; default 'cent' (dominant Udupi/Karnataka unit).
  const [landAreaUnit, setLandAreaUnit] = useState('cent');
  const [bedrooms, setBedrooms] = useState('');
  const [builtArea, setBuiltArea] = useState<number | null>(null);
  // Unit for built area; default 'sqft'.
  const [builtAreaUnit, setBuiltAreaUnit] = useState('sqft');
  const [reraNumber, setReraNumber] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  // Listing purpose
  const [listingPurpose, setListingPurpose] = useState<'sale' | 'rent'>('sale');
  // Agricultural plot boundary — [lat, lng][] coords from DrawControl
  const [boundaryCoords, setBoundaryCoords] = useState<[number, number][]>([]);

  // Stable across renders — setState setters are stable, deps array is empty.
  const hydrate = useCallback((listing: ListingResponse) => {
    setTitle(listing.title ?? '');
    setDescription(listing.description ?? '');
    setPriceRupees(listing.price ?? null);
    setPropertyType((listing.propertyType as PropertyType) ?? '');
    setLocality(listing.locality ?? '');
    setLandArea(listing.landArea);
    // Existing listings saved before unit support have null unit — fall back to 'cent'
    // (dominant Udupi/Karnataka unit, matches NewListing default).
    // For agricultural_land, fall back to 'acre' (dominant unit for that type).
    setLandAreaUnit(listing.landAreaUnit ?? (listing.propertyType === 'agricultural_land' ? 'acre' : 'cent'));
    setBedrooms(listing.bedrooms != null ? String(listing.bedrooms) : '');
    setBuiltArea(listing.builtArea);
    setBuiltAreaUnit(listing.builtAreaUnit ?? 'sqft');
    setVideoUrl(listing.videoUrl ?? '');
    setReraNumber(listing.reraNumber ?? '');
    setListingPurpose((listing.listingPurpose as 'sale' | 'rent') ?? 'sale');
    // Pre-populate boundary coords from existing agri listing
    if (listing.boundary) {
      setBoundaryCoords(fromGeoJsonString(listing.boundary));
    }
  }, []);

  return {
    values: {
      title,
      description,
      priceRupees,
      propertyType,
      locality,
      landArea,
      landAreaUnit,
      bedrooms,
      builtArea,
      builtAreaUnit,
      reraNumber,
      videoUrl,
      listingPurpose,
      boundaryCoords,
    },
    setters: {
      setTitle,
      setDescription,
      setPriceRupees,
      setPropertyType,
      setLocality,
      setLandArea,
      setLandAreaUnit,
      setBedrooms,
      setBuiltArea,
      setBuiltAreaUnit,
      setReraNumber,
      setVideoUrl,
      setListingPurpose,
      setBoundaryCoords,
    },
    hydrate,
  };
}
