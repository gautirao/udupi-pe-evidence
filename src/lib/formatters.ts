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
 * Format area with unit
 */
export function formatArea(area: number, unit?: string | null): string {
  const areaUnit = unit || 'sq ft';
  
  if (areaUnit === 'cents') {
    return `${area.toFixed(2)} cents`;
  }
  
  if (areaUnit === 'acres') {
    return `${area.toFixed(2)} acres`;
  }
  
  // Accept both legacy 'guntha' spelling and new canonical 'gunta'/'guntas'
  if (areaUnit === 'guntha' || areaUnit === 'gunta' || areaUnit === 'guntas') {
    return `${area.toFixed(2)} guntha`;
  }
  
  // Default to sq ft
  if (area >= 43560) {
    // Convert to acres
    return `${(area / 43560).toFixed(2)} acres`;
  }
  
  return `${area.toLocaleString()} ${areaUnit}`;
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