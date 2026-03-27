/**
 * Parses a string as an integer. Returns the value only when it is a finite
 * integer greater than zero; returns undefined otherwise.
 */
export function intOrUndef(v: string): number | undefined {
  const n = parseInt(v, 10);
  return !isNaN(n) && n > 0 ? n : undefined;
}

/**
 * Parses a string as a float. Returns the value only when it is a finite
 * number greater than zero; returns undefined otherwise.
 */
export function floatOrUndef(v: string): number | undefined {
  const n = parseFloat(v);
  return !isNaN(n) && n > 0 ? n : undefined;
}
