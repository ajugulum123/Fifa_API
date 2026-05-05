/**
 * jwt.ts
 * Low-level JWT utilities for signing and verifying access + refresh tokens.
 *
 * Token architecture:
 * Access token - short-lived (15 min default), stateless, carries user
 * identity + role. Verified on every protected request.
 * Refresh token - long-lived (7 days default), single-use. Stored in the
 * server's revocation set so replayed tokens are rejected.
 * Rotated on every use (old one revoked, new one issued).
 */

import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';

//
// Config (all sourced from environment - never hard-coded)
//

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export const ACCESS_SECRET = requireEnv('JWT_ACCESS_SECRET');
export const REFRESH_SECRET = requireEnv('JWT_REFRESH_SECRET');

export const ACCESS_EXPIRES_IN = (process.env.JWT_ACCESS_EXPIRES_IN ?? '15m') as SignOptions['expiresIn'];
export const REFRESH_EXPIRES_IN = (process.env.JWT_REFRESH_EXPIRES_IN ?? '7d') as SignOptions['expiresIn'];

//
// Token payload shape
//

export interface AccessTokenPayload {
  sub: string; // user ID
  username: string;
  role: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string; // user ID
  jti: string; // unique token ID used for revocation
  type: 'refresh';
}

//
// Sign
//

/**
 * Signs a new access token for the given user.
 * Algorithm: HS256 (HMAC-SHA-256). For production consider RS256.
 */
export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign(
    { ...payload, type: 'access' },
    ACCESS_SECRET,
    { algorithm: 'HS256', expiresIn: ACCESS_EXPIRES_IN }
  );
}

/**
 * Signs a new refresh token with a unique `jti` (JWT ID).
 * The `jti` is stored in the revocation set so the token can be invalidated.
 */
export function signRefreshToken(userId: string, jti: string): string {
  return jwt.sign(
    { sub: userId, jti, type: 'refresh' },
    REFRESH_SECRET,
    { algorithm: 'HS256', expiresIn: REFRESH_EXPIRES_IN }
  );
}

//
// Verify
//

export type VerifyResult<T> =
  | { ok: true; payload: T }
  | { ok: false; reason: 'expired' | 'invalid' | 'wrong_type' };

/**
 * Verifies an access token.
 * Returns a typed result instead of throwing so callers can return clean
 * UNAUTHORIZED / FORBIDDEN payloads without try/catch at every resolver.
 */
export function verifyAccessToken(token: string): VerifyResult<AccessTokenPayload> {
  try {
    const decoded = jwt.verify(token, ACCESS_SECRET, { algorithms: ['HS256'] }) as JwtPayload;
    if (decoded.type !== 'access') return { ok: false, reason: 'wrong_type' };
    return { ok: true, payload: decoded as AccessTokenPayload };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) return { ok: false, reason: 'expired' };
    return { ok: false, reason: 'invalid' };
  }
}

/**
 * Verifies a refresh token.
 * The caller is responsible for checking the jti against the revocation set.
 */
export function verifyRefreshToken(token: string): VerifyResult<RefreshTokenPayload> {
  try {
    const decoded = jwt.verify(token, REFRESH_SECRET, { algorithms: ['HS256'] }) as JwtPayload;
    if (decoded.type !== 'refresh') return { ok: false, reason: 'wrong_type' };
    return { ok: true, payload: decoded as RefreshTokenPayload };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) return { ok: false, reason: 'expired' };
    return { ok: false, reason: 'invalid' };
  }
}

//
// Helpers
//

/** Converts an expiresIn string like "15m" or "7d" to seconds. */
export function expiresInToSeconds(expiresIn: string): number {
  const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return 900; // fallback: 15 min
  return parseInt(match[1], 10) * (units[match[2]] ?? 1);
}

/**
 * Extracts the raw Bearer token from an Authorization header value.
 * Returns null if the header is missing or malformed.
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
  return parts[1];
}
