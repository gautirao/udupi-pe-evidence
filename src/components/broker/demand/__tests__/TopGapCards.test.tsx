/**
 * TopGapCards — add_listing CTA prefill URL regression (Issue #1748).
 *
 * Locks the canonical prefill URL the add_listing CTA navigates to, so the
 * journey selector / typed create pages can rely on it (areaKey / propertyType /
 * listingPurpose query params).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { GapItem } from '@/hooks/useBrokerDemandGaps';

const mockNavigate = vi.hoisted(() => vi.fn());
const mockMutate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// Mock the whole hook module (no importOriginal) so the real @/lib/api →
// Supabase client is never loaded. GapItem is a type-only import (erased),
// so the runtime surface only needs the two mutation hooks.
vi.mock('@/hooks/useBrokerDemandGaps', () => ({
  useMarkGapRead: () => ({ mutate: mockMutate, isPending: false }),
  useDismissGap: () => ({ mutate: mockMutate, isPending: false }),
}));

import { TopGapCards } from '../TopGapCards';

function makeGap(overrides: Partial<GapItem> = {}): GapItem {
  return {
    id: null,
    areaKey: 'brahmavar',
    propertyType: 'apartment',
    listingPurpose: 'sale',
    budgetBand: '20L_50L',
    week: '2026-07-13',
    gapScore: { value: 1.8, confidenceLabel: 'enough_data' },
    signalType: 'supply_gap',
    actionType: 'add_listing',
    confidence: { value: 'enough_data', confidenceLabel: 'enough_data' },
    buyerEnquiries: { value: 12, confidenceLabel: 'enough_data' },
    brokerLiveCount: 0,
    readAt: null,
    dismissedAt: null,
    ...overrides,
  };
}

function renderCards(gaps: GapItem[]) {
  return render(
    <MemoryRouter>
      <TopGapCards gaps={gaps} isLoading={false} />
    </MemoryRouter>,
  );
}

describe('TopGapCards add_listing prefill URL (Issue #1748)', () => {
  it('navigates to /broker/listings/new with the canonical areaKey/propertyType/listingPurpose params', async () => {
    renderCards([makeGap()]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add Listing' }));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(
      '/broker/listings/new?areaKey=brahmavar&propertyType=apartment&listingPurpose=sale',
    );
  });

  it('URL-encodes the forwarded values', async () => {
    renderCards([makeGap({ areaKey: 'kaup east', propertyType: 'commercial_land', listingPurpose: 'rent' })]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add Listing' }));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/broker/listings/new?areaKey=kaup+east&propertyType=commercial_land&listingPurpose=rent',
    );
  });
});
