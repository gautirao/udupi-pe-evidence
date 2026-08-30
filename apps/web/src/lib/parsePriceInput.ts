/**
 * Parse natural language Indian price input to rupees (integer).
 * Returns null for empty input, NaN-free invalid strings.
 *
 * Supported formats:
 *   "50 lakh", "50 L", "50l", "50 lakhs"  → 5_000_000
 *   "1.2 crore", "1.2 cr", "1.2C", "1.2Cr" → 12_000_000
 *   "75,000", "75000", "1,20,000"           → as-is (strip commas)
 *   "₹50 lakh", "Rs 50 lakh"               → strip symbol, then parse
 */
export function parsePriceInput(text: string): number | null {
  if (!text || !text.trim()) return null;

  // Strip currency symbols and whitespace noise
  let s = text.trim().replace(/^[₹Rs.]+\s*/i, '').trim();

  // Strip internal commas (Indian or Western thousands separator)
  s = s.replace(/,/g, '');

  // Crore variants: cr, crore, crores, C (case-insensitive)
  const crMatch = s.match(/^([\d.]+)\s*(?:crore?s?|cr|C)$/i);
  if (crMatch) {
    const val = parseFloat(crMatch[1]);
    return isNaN(val) ? null : Math.round(val * 10_000_000);
  }

  // Lakh variants: lakh, lakhs, L (case-insensitive)
  const lakhMatch = s.match(/^([\d.]+)\s*(?:lakhs?|L)$/i);
  if (lakhMatch) {
    const val = parseFloat(lakhMatch[1]);
    return isNaN(val) ? null : Math.round(val * 100_000);
  }

  // Plain number (after stripping commas)
  const num = parseFloat(s);
  if (!isNaN(num) && /^[\d.]+$/.test(s)) return Math.round(num);

  return null;
}
