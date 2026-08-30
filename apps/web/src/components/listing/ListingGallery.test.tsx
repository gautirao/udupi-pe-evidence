/**
 * ListingGallery — Issue #2359
 *
 * Backend fix: the public listing-detail read path (GET /api/public/listings/:id via
 * ListingResponseMapper) now resolves a broker-uploaded local-dev-storage image's stored
 * client-supplied placeholder URL into a real, loadable local-storage URL — see
 * LocalDevStorageService#resolveDisplayUrl. Nothing on the frontend was changed by that fix,
 * but ListingGallery had no dedicated test, and every existing test that renders a page
 * containing it explicitly `vi.mock`s it out — so there was zero automated coverage of the one
 * thing this bug actually broke: ListingGallery binding an `images[].url` to the rendered
 * `<img>`'s `src`.
 *
 * This is a permanent regression guard for that binding, independent of where the URL came
 * from: it renders with a `url` shaped exactly like what the backend now returns for a
 * previously-broken local-dev-storage-backed photo, and asserts the `<img>` element's `src`
 * equals that resolved URL — not the unresolved placeholder that used to be served, and not the
 * "Image unavailable" fallback (which only renders after a real `onError` fires, so simply
 * finding the `<img>` at all already proves the fallback did not take over on mount).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListingGallery } from './ListingGallery';

describe('ListingGallery', () => {
  it('binds the resolved local-storage image url to the rendered <img> src, not the raw placeholder', () => {
    const resolvedUrl =
      'http://localhost:8430/api/dev/local-storage/public/listing-images/listings/owner-1/listing-1/photo-0.jpg';

    render(
      <ListingGallery
        images={[{ url: resolvedUrl, alt: 'Living room' }]}
        effectiveImageCount={1}
        isAnonymous={false}
        listingId="listing-1"
      />,
    );

    const img = screen.getByRole('img', { name: 'Living room' });
    expect(img).toHaveAttribute('src', resolvedUrl);

    // The "Image unavailable" fallback must not be showing — it only renders after onError
    // fires, so its absence on mount confirms the <img> path (not the broken-image path) is
    // what's active with this url.
    expect(screen.queryByText('Image unavailable')).not.toBeInTheDocument();
  });

  it('does NOT bind the raw client-supplied placeholder url once the backend has resolved it (regression guard for #2359)', () => {
    // Shape of the url a broker's local-dev-storage upload was persisted with BEFORE
    // resolution — the exact value ListingResponseMapper used to serve as-is (the bug).
    const unresolvedPlaceholderUrl =
      'https://placeholder.local.supabase.co/storage/v1/object/public/listing-images/photo-0.jpg';
    const resolvedUrl =
      'http://localhost:8430/api/dev/local-storage/public/listing-images/listings/owner-1/listing-1/photo-0.jpg';

    render(
      <ListingGallery
        images={[{ url: resolvedUrl, alt: 'Living room' }]}
        effectiveImageCount={1}
        isAnonymous={false}
        listingId="listing-1"
      />,
    );

    const img = screen.getByRole('img', { name: 'Living room' });
    expect(img).not.toHaveAttribute('src', unresolvedPlaceholderUrl);
  });
});
