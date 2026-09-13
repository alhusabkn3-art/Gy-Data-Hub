/**
 * GY DATA
 * Authentication helpers
 *
 * Uses bcryptjs for hashing and verifying:
 * - Customer login PIN
 * - Customer purchase PIN
 * - PIN reset OTP
 * - Admin PIN
 *
 * IMPORTANT:
 * - Never store plain-text PINs.
 * - Never return PIN hashes to the frontend.
 * - bcryptjs is used instead of native bcrypt so the API server
 *   can be bundled reliably with esbuild.
 */

import bcrypt from 'bcryptjs';

/**
 * Number of bcrypt salt rounds.
 *
 * 12 is a strong default for PIN/password-style credentials
 * while remaining practical for a mobile-oriented application.
 */
const SALT_ROUNDS = 12;

/**
 * Hash a PIN securely.
 *
 * @param pin Plain-text PIN/OTP.
 * @returns bcrypt hash.
 */
export async function hashPin(
  pin: string,
): Promise<string> {
  if (
    typeof pin !== 'string' ||
    pin.length === 0
  ) {
    throw new Error(
      'PIN must be a non-empty string.',
    );
  }

  return bcrypt.hash(
    pin,
    SALT_ROUNDS,
  );
}

/**
 * Verify a plain-text PIN against a bcrypt hash.
 *
 * Returns false instead of throwing for an invalid
 * or malformed hash.
 */
export async function verifyPin(
  plain: string,
  hash: string,
): Promise<boolean> {
  if (
    typeof plain !== 'string' ||
    typeof hash !== 'string' ||
    plain.length === 0 ||
    hash.length === 0
  ) {
    return false;
  }

  try {
    return await bcrypt.compare(
      plain,
      hash,
    );
  } catch {
    return false;
  }
}
