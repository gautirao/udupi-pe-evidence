export function formatListingId(listingNumber: number): string {
  return `PROP-${String(listingNumber).padStart(5, '0')}`;
}
