/**
 * Auth helpers — bcrypt wrappers used by auth routes.
 * Uses bcryptjs (pure JS) so it bundles cleanly with esbuild.
 */
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, SALT_ROUNDS);
}

export async function verifyPin(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
