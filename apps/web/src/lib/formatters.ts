// Valid ISO 4217 currency codes we support
const VALID_CURRENCIES = new Set(['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD']);

/**
 * Format price with Indian numbering system (lakhs, crores)
 */
export function formatPrice(price: number, unit?: string | null): string {
  // Normalize currency - default to INR for invalid/unknown units
  const rawCurrency = unit?.toUpperCase()?.trim() || 'INR';
  const currency = VALID_CURRENCIES.has(rawCurrency) ? rawCurrency : 'INR';
  
  if (currency === 'INR') {
    if (price >= 10000000) {
      // Crores
      const crores = price / 10000000;
      return `₹${crores.toFixed(crores % 1 === 0 ? 0 : 2)} Cr`;
    } else if (price >= 100000) {
      // Lakhs
      const lakhs = price / 100000;
      return `₹${lakhs.toFixed(lakhs % 1 === 0 ? 0 : 2)} L`;
    } else if (price >= 1000) {
      // Thousands
      const thousands = price / 1000;
      return `₹${thousands.toFixed(thousands % 1 === 0 ? 0 : 1)}K`;
    }
    return `₹${price.toLocaleString('en-IN')}`;
  }
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

/**
 * Format area with unit.
 * Handles both singular and plural unit forms (e.g. "cent" and "cents").
 * Returns empty string for null/undefined area.
 */
export function formatArea(area: number | null | undefined, unit?: string | null): string {
  if (area == null) return '';

  const areaUnit = (unit || 'sq ft').toLowerCase().trim();

  // Cents (singular or plural) — backend stores "cent"
  if (areaUnit === 'cent' || areaUnit === 'cents') {
    if (area >= 100) {
      const acres = area / 100;
      return `${acres.toFixed(2)} acres`;
    }
    return `${area.toFixed(2)} cents`;
  }

  // Acres (singular or plural)
  if (areaUnit === 'acre' || areaUnit === 'acres') {
    return `${area.toFixed(2)} acres`;
  }

  // Guntas — compound display for >= 40 guntas (1 acre = 40 guntas)
  if (areaUnit === 'guntha' || areaUnit === 'gunta' || areaUnit === 'guntas') {
    if (area >= 40) {
      const acres = Math.floor(area / 40);
      const remainder = Math.round((area % 40) * 100) / 100;
      if (remainder > 0) {
        return `${acres} acre${acres > 1 ? 's' : ''} ${remainder} guntas`;
      }
      return `${acres} acre${acres > 1 ? 's' : ''}`;
    }
    return `${area.toFixed(2)} guntas`;
  }

  // Sq M
  if (areaUnit === 'sqm' || areaUnit === 'sq m') {
    return `${area.toLocaleString('en-IN')} sq m`;
  }

  // Default to sq ft — convert to acres if very large
  if (area >= 43560) {
    return `${(area / 43560).toFixed(2)} acres`;
  }

  return `${area.toLocaleString('en-IN')} sq ft`;
}

/**
 * Format date relative to now
 */
export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  }
  
  const years = Math.floor(diffDays / 365);
  return `${years} year${years > 1 ? 's' : ''} ago`;
}

/**
 * Format phone number for display
 */
export function formatPhone(phone: string): string {
  // Clean the phone number
  const cleaned = phone.replace(/\D/g, '');
  
  // Indian format
  if (cleaned.length === 10) {
    return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+91 ${cleaned.slice(2, 7)} ${cleaned.slice(7)}`;
  }

  return phone;
}

/**
 * Humanize a backend enum-style value (snake_case or UPPER_SNAKE_CASE) into
 * Title Case for display, e.g. 'commercial_building' -> 'Commercial building',
 * 'INCOMPLETE_INFO' -> 'Incomplete info'.
 *
 * Generic/algorithmic rather than a curated lookup table so it never drifts
 * out of sync as new enum values are added on the backend (issue #2369).
 * Returns an empty string for null/undefined input.
 */
export function humanizeEnumValue(raw: string | null | undefined): string {
  if (!raw) return '';
  const words = raw.toLowerCase().split(/[_\s]+/).filter(Boolean);
  if (words.length === 0) return '';
  return words
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}