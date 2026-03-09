/**
 * Shared e2e test helpers.
 *
 * hasRealCredentials() — use instead of Boolean(email && password) to avoid
 * false positives when .env.e2e contains placeholder values from the example file.
 */

/**
 * Returns true if the value looks like a placeholder credential.
 * Placeholder patterns: empty string, @example.com addresses, literal "password".
 */
function isPlaceholderCredential(value: string): boolean {
  return !value || value.includes('@example.com') || value === 'password';
}

/**
 * Returns true only when ALL provided credential strings are non-empty
 * AND not placeholder values.
 *
 * Use this in test.skip() guards so that tests skip gracefully when .env.e2e
 * still holds example values, rather than attempting login with invalid
 * credentials and timing out after 30 s.
 *
 * @example
 * test.skip(!hasRealCredentials(userEmail, userPassword), 'Creds not configured');
 */
export function hasRealCredentials(...values: string[]): boolean {
  return values.length > 0 && values.every((v) => !isPlaceholderCredential(v));
}
