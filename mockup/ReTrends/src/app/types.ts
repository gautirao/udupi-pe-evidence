export type TrustTier = 'verified' | 'trusted' | 'standard';

export interface Property {
  id: string;
  title: string;
  locality: string;
  city: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  area: number;
  type: 'apartment' | 'villa' | 'plot';
  trustTier: TrustTier;
  images: string[];
  coordinates: { lat: number; lng: number };
  broker?: {
    name: string;
    verified: boolean;
    propertiesListed: number;
    yearsActive: number;
  };
  highlights: string[];
  description?: string;
  amenities?: string[];
  postedDays: number;
}

export interface Locality {
  name: string;
  city: string;
  coordinates: { lat: number; lng: number };
  propertyCount: number;
  avgPrice?: number;
  trending?: boolean;
}

export interface TrendData {
  locality: string;
  city: string;
  priceChange: number; // percentage
  demandScore: number; // 0-100
  supplyTrend: 'increasing' | 'stable' | 'decreasing';
  avgPrice: number;
  listingQuality: number; // 0-100
  popularTypes: { type: string; percentage: number }[];
  priceHistory: { month: string; avgPrice: number }[];
  insights: string[];
}

export interface SavedSearch {
  id: string;
  localities: string[];
  city: string;
  filters: {
    priceRange?: { min: number; max: number };
    bedrooms?: number[];
    propertyTypes?: string[];
  };
  createdAt: string;
  matchCount: number;
}
