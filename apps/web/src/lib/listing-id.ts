export function formatListingId(listingNumber: number | null | undefined): string | null {
  if (listingNumber == null) return null;
  return `PROP-${String(listingNumber).padStart(5, '0')}`;
}
