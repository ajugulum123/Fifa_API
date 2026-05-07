import { describe, it, expect } from 'vitest';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  extractBearerToken,
  expiresInToSeconds,
} from '../src/auth/jwt';

describe('jwt access tokens', () => {
  it('signs then verifies a valid access token round-trip', () => {
    const token = signAccessToken({ sub: 'user-1', username: 'alice', role: 'USER' });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const result = verifyAccessToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sub).toBe('user-1');
      expect(result.payload.username).toBe('alice');
      expect(result.payload.role).toBe('USER');
      expect(result.payload.type).toBe('access');
    }
  });

  it('rejects a tampered access token', () => {
    const token = signAccessToken({ sub: 'user-1', username: 'alice', role: 'USER' });
    const tampered = token.slice(0, -4) + 'aaaa';

    const result = verifyAccessToken(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(['invalid', 'wrong_type']).toContain(result.reason);
    }
  });

  it('rejects a refresh token presented as an access token', () => {
    const refresh = signRefreshToken('user-1', 'jti-abc');
    const result = verifyAccessToken(refresh);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid');
    }
  });
});

describe('jwt refresh tokens', () => {
  it('round-trips a refresh token with a jti', () => {
    const token = signRefreshToken('user-1', 'jti-xyz');
    const result = verifyRefreshToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sub).toBe('user-1');
      expect(result.payload.jti).toBe('jti-xyz');
      expect(result.payload.type).toBe('refresh');
    }
  });
});

describe('Bearer header extraction', () => {
  it.each([
    ['Bearer abc.def.ghi', 'abc.def.ghi'],
    ['bearer abc.def.ghi', 'abc.def.ghi'],
    ['BEARER abc.def.ghi', 'abc.def.ghi'],
  ])('parses %s', (input, expected) => {
    expect(extractBearerToken(input)).toBe(expected);
  });

  it.each([undefined, '', 'NotBearer abc', 'Bearer'])('rejects %s', (input) => {
    expect(extractBearerToken(input as string | undefined)).toBeNull();
  });
});

describe('expiresInToSeconds', () => {
  it.each([
    ['30s', 30],
    ['15m', 900],
    ['1h', 3600],
    ['7d', 604800],
    ['bogus', 900],
  ])('parses %s -> %i', (input, expected) => {
    expect(expiresInToSeconds(input)).toBe(expected);
  });
});
