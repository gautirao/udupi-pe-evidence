/**
 * Tests for AgriculturalReviewPreview.tsx — issue #2044 AC9 (render parity).
 * Crops must render via derived labels (CROP_LABELS), never raw machine
 * values, and the "(as entered)" / "not saved" language must not appear next
 * to crops now that they persist.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgriculturalReviewPreview, type AgriculturalReviewFacts } from '../AgriculturalReviewPreview';
import type { ListingStrengthResult } from '@/lib/listingStrength';

vi.mock('@/hooks/useListingImages', () => ({
  useListingImages: () => ({ images: [], imageCount: 0 }),
}));

vi.mock('@/components/broker/residential/InlineNearby', () => ({
  InlineNearby: () => <div data-testid="mock-inline-nearby" />,
}));

const BASE_FACTS: AgriculturalReviewFacts = {
  propertyType: 'agricultural_land',
  listingPurpose: 'sale',
  title: 'Test listing',
  description: '',
  locality: 'Manipal',
  landArea: 2,
  landAreaUnit: 'acre',
  facing: '',
  waterSource: '',
  soilType: '',
  roadAccess: '',
  cultivationStatus: '',
  landCategory: '',
  agriConversionStatus: '',
  ownershipType: '',
  surveyNumber: '',
  farmhouseAvailable: '',
  fencingDone: '',
  rtc: '',
  crops: ['ARECA_SUPARI', 'MIXED_PLANTATION'],
  features: ['Borewell'],
  priceRupees: 1_000_000,
};

const STRENGTH: ListingStrengthResult = {
  isSubmittable: false,
  percent: 50,
  gates: [],
  missingItems: [],
};

function renderPreview(facts: AgriculturalReviewFacts) {
  render(
    <AgriculturalReviewPreview
      listingId="listing-1"
      facts={facts}
      addressConfirmed={false}
      strengthResult={STRENGTH}
      onEditSection={() => {}}
    />,
  );
}

describe('AgriculturalReviewPreview — crop render parity (AC9, issue #2044)', () => {
  it('renders derived crop labels, never raw machine values', () => {
    renderPreview(BASE_FACTS);
    expect(screen.getByText('Areca / supari, Mixed plantation')).toBeInTheDocument();
    expect(screen.queryByText(/ARECA_SUPARI/)).not.toBeInTheDocument();
    expect(screen.queryByText(/MIXED_PLANTATION/)).not.toBeInTheDocument();
  });

  it('no longer labels the crops row "(as entered)" — crops are now saved, not just entered', () => {
    renderPreview(BASE_FACTS);
    expect(screen.queryByText(/crops \(as entered\)/i)).not.toBeInTheDocument();
    expect(screen.getByText(/crops \(declared by seller\/broker\)/i)).toBeInTheDocument();
  });

  it('features keep their "(as entered)" caveat unchanged — features are still FE-only', () => {
    renderPreview(BASE_FACTS);
    expect(screen.getByText(/features \(as entered\)/i)).toBeInTheDocument();
  });

  it('the land-record disclaimer no longer claims crops are merely "as entered" alongside unverified survey/RTC/ownership', () => {
    renderPreview(BASE_FACTS);
    expect(
      screen.getByText(/survey number, rtc, and ownership are shown exactly as entered/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/crops are saved with your listing/i)).toBeInTheDocument();
  });

  it('hides the crops row entirely when no crops are selected (no fake defaults)', () => {
    renderPreview({ ...BASE_FACTS, crops: [] });
    expect(screen.queryByText(/crops \(declared by seller\/broker\)/i)).not.toBeInTheDocument();
  });
});
