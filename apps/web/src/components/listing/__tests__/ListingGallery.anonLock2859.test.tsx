/**
 * #2859 B4 (csv176, e2e/homepage-listing-journey.spec.ts H4-H7) — the anonymous gallery lock.
 *
 * SCOPE (R_injected): `isAnonymous` is INJECTED here, so these its prove the lock GIVEN an
 * anonymous caller. Deriving isAnonymous from the session and the server truncating images for
 * anonymous callers are separate boundaries (see the B4 map, rows H4-7.*).
 *
 * The overlay has TWO entry paths (ListingGallery.tsx overlay condition
 * `isAnonymous && (currentImageIndex >= 1 || galleryLocked)`):
 *   1. index path    — images.length >= 2: Next advances to index 1 and the overlay shows.
 *   2. locked path   — one real image + hasMoreLocked: Next at the last real image sets
 *                      galleryLocked WITHOUT advancing (useGalleryNavigation.nextImage).
 * Each path has its own it, so a mutation of either half cannot hide behind the other.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ListingGallery } from '../ListingGallery';

const LISTING_ID = '28590004-0000-4000-8000-000000000001';
const IMG = [
  { url: 'https://img.test/2859/a.jpg', alt: 'Front view' },
  { url: 'https://img.test/2859/b.jpg', alt: 'Hall' },
  { url: 'https://img.test/2859/c.jpg', alt: 'Kitchen' },
];
const LOCK_COPY = 'Sign in to view all photos';

function renderGallery(props: {
  images: { url: string; alt: string }[];
  effectiveImageCount: number;
  isAnonymous: boolean;
}) {
  return render(
    <MemoryRouter>
      <ListingGallery listingId={LISTING_ID} {...props} />
    </MemoryRouter>,
  );
}

describe('ListingGallery anonymous lock #2859 B4 (given isAnonymous)', () => {
  it('H4-H7 index path: image 0 unlocked with a src, Next/Previous visible, Next locks with the exact returnTo CTA; the signed-in control never locks', async () => {
    const user = userEvent.setup();
    const anon = renderGallery({ images: IMG, effectiveImageCount: 3, isAnonymous: true });

    // H4 — before: image 0 renders its src and there is no lock overlay.
    expect(screen.getByRole('img', { name: 'Front view' })).toHaveAttribute('src', IMG[0].url);
    expect(screen.queryByText(LOCK_COPY)).not.toBeInTheDocument();
    // H5 — both navigation buttons are rendered.
    expect(screen.getByRole('button', { name: 'Next image' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous image' })).toBeInTheDocument();

    // H6 — action: Next. After: the lock overlay heading is shown.
    await user.click(screen.getByRole('button', { name: 'Next image' }));
    expect(screen.getByRole('heading', { name: LOCK_COPY })).toBeInTheDocument();

    // H7 — the CTA points at /auth with returnTo=/listing/<id> (exact, decoded and raw).
    const cta = screen.getByRole('link', { name: LOCK_COPY });
    const href = cta.getAttribute('href') ?? '';
    expect(decodeURIComponent(href)).toBe(`/auth?returnTo=/listing/${LISTING_ID}`);
    expect(href).toBe(`/auth?returnTo=${encodeURIComponent(`/listing/${LISTING_ID}`)}`);
    anon.unmount();

    // Control in the same it: a signed-in caller with the same images never sees the lock.
    renderGallery({ images: IMG, effectiveImageCount: 3, isAnonymous: false });
    await user.click(screen.getByRole('button', { name: 'Next image' }));
    expect(screen.getByRole('img', { name: 'Hall' })).toHaveAttribute('src', IMG[1].url);
    expect(screen.queryByText(LOCK_COPY)).not.toBeInTheDocument();
  });

  it('H5-H7 locked path: one real image + hidden photos shows nav and counter, Next locks without advancing, Previous unlocks; the signed-in control has no nav at all', async () => {
    const user = userEvent.setup();
    const anon = renderGallery({ images: IMG.slice(0, 1), effectiveImageCount: 3, isAnonymous: true });

    // Before: the single real image, unlocked; nav exists only because photos are locked away.
    expect(screen.getByRole('img', { name: 'Front view' })).toHaveAttribute('src', IMG[0].url);
    expect(screen.queryByText(LOCK_COPY)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next image' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous image' })).toBeInTheDocument();
    expect(within(screen.getByTestId('gallery-counter')).getByText('1 / 3')).toBeInTheDocument();

    // Action: Next. After: locked, and the image did NOT advance (still image 0).
    await user.click(screen.getByRole('button', { name: 'Next image' }));
    expect(screen.getByRole('heading', { name: LOCK_COPY })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Front view' })).toHaveAttribute('src', IMG[0].url);
    expect(
      decodeURIComponent(screen.getByRole('link', { name: LOCK_COPY }).getAttribute('href') ?? ''),
    ).toBe(`/auth?returnTo=/listing/${LISTING_ID}`);

    // Previous clears the lock.
    await user.click(screen.getByRole('button', { name: 'Previous image' }));
    expect(screen.queryByText(LOCK_COPY)).not.toBeInTheDocument();
    anon.unmount();

    // Control: a signed-in caller with one image has nothing locked, so no nav buttons and no lock.
    renderGallery({ images: IMG.slice(0, 1), effectiveImageCount: 3, isAnonymous: false });
    expect(screen.getByRole('img', { name: 'Front view' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next image' })).not.toBeInTheDocument();
    expect(screen.queryByText(LOCK_COPY)).not.toBeInTheDocument();
  });
});
