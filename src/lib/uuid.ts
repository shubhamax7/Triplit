import * as Crypto from 'expo-crypto';

/**
 * Generates a cryptographically secure UUIDv4 string.
 *
 * Uses expo-crypto which provides a native implementation backed by the
 * platform's secure random source (SecRandomCopyBytes on iOS,
 * SecureRandom on Android). This is required because Hermes does not
 * implement the Web Crypto API (`crypto.randomUUID()`).
 */
export function generateUUID(): string {
  return Crypto.randomUUID();
}
