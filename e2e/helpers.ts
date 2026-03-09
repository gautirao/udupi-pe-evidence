/**
 * Shared e2e test helpers.
 *
 * hasRealCredentials() — use instead of Boolean(email && password) to avoid
 * false positives when .env.e2e contains placeholder values from the example file.
 */

/**
 * Returns true only when ALL provided credential strings are non-empty.
 * Tests skip gracefully when credentials are absent rather than failing
 * with a timeout.
 *
 * @example
 * test.skip(!hasRealCredentials(userEmail, userPassword), 'Creds not configured');
 */
export function hasRealCredentials(...values: string[]): boolean {
  return values.length > 0 && values.every((v) => Boolean(v));
}
