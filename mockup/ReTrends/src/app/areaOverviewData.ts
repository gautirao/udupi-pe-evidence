export interface AreaOverviewData {
  area: string;
  district: string;
  city?: string;
  state: 'full' | 'limited' | 'fallback';
  dataBasis: string;
  priceOverview: {
    medianPrice: string;
    priceRange: string;
    trend?: string;
    propertyMix?: Array<{
      type: string;
      percentage: number;
    }>;
  };
  marketActivity?: {
    activeListings: number;
    newThisMonth: number;
  };
  comparison: Array<{
    locality: string;
    medianPrice: string;
    listings: number;
    trend: string;
    isCurrent?: boolean;
  }>;
  schools: Array<{
    name: string;
    board: string;
    metadata?: string;
    notable?: boolean;
  }>;
}

export const areaOverviewData: Record<string, AreaOverviewData> = {
  // Frame 1: Full Data
  koramangala: {
    area: 'Koramangala',
    district: 'Udupi district',
    city: 'Bangalore',
    state: 'full',
    dataBasis: 'Based on 42 listings in the last 90 days.',
    priceOverview: {
      medianPrice: '₹1.15 Cr/sqft',
      priceRange: '₹65L – ₹1.8 Cr',
      trend: 'Prices rising (~6.5%)',
      propertyMix: [
        { type: '2 BHK', percentage: 35 },
        { type: '3 BHK', percentage: 45 },
        { type: '4 BHK', percentage: 20 },
      ],
    },
    marketActivity: {
      activeListings: 42,
      newThisMonth: 8,
    },
    comparison: [
      {
        locality: 'Koramangala',
        medianPrice: '₹1.15 Cr',
        listings: 42,
        trend: '↑ 6.5%',
        isCurrent: true,
      },
      {
        locality: 'Indiranagar',
        medianPrice: '₹1.02 Cr',
        listings: 38,
        trend: '↑ 5.2%',
      },
      {
        locality: 'HSR Layout',
        medianPrice: '₹1.28 Cr',
        listings: 51,
        trend: '↑ 12.3%',
      },
      {
        locality: 'Whitefield',
        medianPrice: '₹89L',
        listings: 67,
        trend: '↑ 4.1%',
      },
    ],
    schools: [
      {
        name: 'National Public School',
        board: 'CBSE',
        metadata: '2.3 km away',
        notable: true,
      },
      {
        name: 'Delhi Public School',
        board: 'CBSE',
        metadata: '3.1 km away',
        notable: true,
      },
      {
        name: 'Greenwood High International School',
        board: 'IGCSE',
        metadata: '1.8 km away',
      },
      {
        name: 'Inventure Academy',
        board: 'IB',
        metadata: '2.7 km away',
      },
      {
        name: 'The Brigade School',
        board: 'ICSE',
        metadata: '1.5 km away',
      },
    ],
  },

  // Frame 2: Limited Data
  katapadi: {
    area: 'Katapadi',
    district: 'Udupi district',
    state: 'limited',
    dataBasis: 'Based on 9 listings in the last 90 days. Prices may vary as more data becomes available.',
    priceOverview: {
      medianPrice: '₹45K/sqft',
      priceRange: '₹28L – ₹65L',
      trend: 'Prices stable (~1.2%)',
      propertyMix: [
        { type: '2 BHK', percentage: 55 },
        { type: '3 BHK', percentage: 45 },
      ],
    },
    marketActivity: {
      activeListings: 7,
      newThisMonth: 2,
    },
    comparison: [
      {
        locality: 'Katapadi',
        medianPrice: '₹45K',
        listings: 9,
        trend: '↑ 1.2%',
        isCurrent: true,
      },
      {
        locality: 'Manipal',
        medianPrice: '₹52K',
        listings: 23,
        trend: '↑ 3.5%',
      },
      {
        locality: 'Udupi',
        medianPrice: '₹48K',
        listings: 18,
        trend: '— 0.8%',
      },
      {
        locality: 'Karkala',
        medianPrice: '₹38K',
        listings: 12,
        trend: '↑ 2.1%',
      },
    ],
    schools: [
      {
        name: 'Canara High School',
        board: 'State Board',
        metadata: '1.2 km away',
      },
      {
        name: 'Manipal Public School',
        board: 'CBSE',
        metadata: '4.5 km away',
        notable: true,
      },
      {
        name: 'Sri Bhuvanendra College',
        board: 'Pre-University',
        metadata: '2.8 km away',
      },
      {
        name: 'St. Mary English Medium School',
        board: 'ICSE',
        metadata: '3.2 km away',
      },
    ],
  },

  // Frame 3: Fallback Data
  'tiny-village': {
    area: 'Tiny Village',
    district: 'Udupi district',
    state: 'fallback',
    dataBasis: 'This area is new on our platform.',
    priceOverview: {
      medianPrice: '₹48K/sqft',
      priceRange: '₹28L – ₹68L',
      propertyMix: [
        { type: '2 BHK', percentage: 60 },
        { type: '3 BHK', percentage: 40 },
      ],
    },
    comparison: [
      {
        locality: 'Tiny Village',
        medianPrice: '₹48K',
        listings: 2,
        trend: '—',
        isCurrent: true,
      },
      {
        locality: 'Manipal',
        medianPrice: '₹52K',
        listings: 23,
        trend: '↑ 3.5%',
      },
      {
        locality: 'Udupi',
        medianPrice: '₹48K',
        listings: 18,
        trend: '— 0.8%',
      },
      {
        locality: 'Katapadi',
        medianPrice: '₹45K',
        listings: 9,
        trend: '↑ 1.2%',
      },
    ],
    schools: [
      {
        name: 'Canara High School',
        board: 'State Board',
        metadata: '5.2 km away',
      },
      {
        name: 'Manipal Public School',
        board: 'CBSE',
        metadata: '8.5 km away',
        notable: true,
      },
      {
        name: 'St. Mary English Medium School',
        board: 'ICSE',
        metadata: '6.8 km away',
      },
    ],
  },
};
