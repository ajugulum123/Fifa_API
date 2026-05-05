/**
 * userStore.ts
 * In-memory user registry and refresh token revocation set.
 *
 * Production note:
 * Replace this module with a persistent database (PostgreSQL, Redis, etc.)
 * when moving to production. The interfaces are designed so the swap is
 * localised to this file only - all callers use the exported functions.
 *
 * Security properties maintained here:
 * 1. Passwords are stored as bcrypt hashes - never plaintext.
 * 2. Refresh token JTIs are stored in a revocation Set; a used or logged-out
 * token can never be replayed.
 * 3. The seed admin account is created from environment variables at startup.
 */

import bcrypt from 'bcryptjs';
import { v4 as uuid} from 'uuid';

//
// Types
//

export type UserRole = 'ADMIN' | 'USER';

export interface StoredUser {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
}

export type PublicUser = Omit<StoredUser, 'passwordHash'>;

//
// In-memory stores
//

/** Primary user store keyed by user ID */
const users = new Map<string, StoredUser>();

/** Username -> ID index for O(1) login lookups */
const usernameIndex = new Map<string, string>();

/**
 * Active refresh token JTIs.
 * A JTI present here is valid. Revoke by deleting from this set.
 * On refresh: remove old JTI, insert new JTI.
 */
const activeRefreshJtis = new Set<string>();

//
// Password policy
//

const BCRYPT_ROUNDS = 12;

/** Minimum password requirements: 8+ chars, at least one digit. */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/\d/.test(password)) return 'Password must contain at least one number.';
  if (!/[a-zA-Z]/.test(password)) return 'Password must contain at least one letter.';
  return null;
}

//
// User CRUD
//

/** Creates a new user. Returns the public user or an error string. */
export async function createUser(
  username: string,
  password: string,
  role: UserRole = 'USER'
): Promise<{ user: PublicUser } | { error: string }> {
  if (usernameIndex.has(username.toLowerCase())) {
    return { error: `Username '${username}' is already taken.` };
  }

  const strengthError = validatePasswordStrength(password);
  if (strengthError) return { error: strengthError };

  const id = uuid();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const stored: StoredUser = {
    id,
    username,
    passwordHash,
    role,
    createdAt: new Date(),
  };

  users.set(id, stored);
  usernameIndex.set(username.toLowerCase(), id);

  return { user: toPublic(stored) };
}

/**
 * Validates credentials and returns the public user on success.
 * Deliberate use of bcrypt.compare (constant-time) to prevent timing attacks.
 */
export async function authenticateUser(
  username: string,
  password: string
): Promise<PublicUser | null> {
  const userId = usernameIndex.get(username.toLowerCase());
  if (!userId) {
    // Run a dummy compare to prevent timing-based username enumeration
    await bcrypt.compare(password, '$2a$12$dummyhashtopreventtimingattacks00000000000');
    return null;
  }
  const stored = users.get(userId)!;
  const valid = await bcrypt.compare(password, stored.passwordHash);
  return valid ? toPublic(stored) : null;
}

export function findUserById(id: string): PublicUser | null {
  const stored = users.get(id);
  return stored ? toPublic(stored) : null;
}

//
// Refresh token JTI management
//

/** Registers a new refresh token JTI as active. */
export function registerRefreshJti(jti: string): void {
  activeRefreshJtis.add(jti);
}

/** Returns true if the JTI is currently valid (not revoked). */
export function isRefreshJtiActive(jti: string): boolean {
  return activeRefreshJtis.has(jti);
}

/** Revokes a refresh token JTI (logout or rotation). */
export function revokeRefreshJti(jti: string): boolean {
  return activeRefreshJtis.delete(jti);
}

//
// Seed admin user
//

/**
 * Creates the seed admin account from ADMIN_USERNAME / ADMIN_PASSWORD env vars.
 * Called once at server startup. Safe to call multiple times (idempotent).
 */
export async function seedAdminUser(): Promise<void> {
  const username = process.env.ADMIN_USERNAME ?? 'admin';
  const password = process.env.ADMIN_PASSWORD ?? 'Admin123!';

  if (usernameIndex.has(username.toLowerCase())) return; // already seeded

  const result = await createUser(username, password, 'ADMIN');
  if ('error' in result) {
    throw new Error(`Failed to seed admin user: ${result.error}`);
  }
  console.log(` Seeded admin user: "${username}" (role: ADMIN)`);
}

//
// Helpers
//

function toPublic(u: StoredUser): PublicUser {
  const { passwordHash: _ph, ...pub } = u;
  return pub;
}
