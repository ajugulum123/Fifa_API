/**
 * resolvers/auth.resolvers.ts
 * GraphQL resolvers for authentication and identity:
 *   Query.me
 *   Mutation.register / login / refreshToken / logout
 */

import { buildMeta, buildError } from '../utils/meta';
import { verifyRefreshToken }    from '../auth/jwt';
import {
  createUser, authenticateUser, findUserById,
  isRefreshJtiActive, revokeRefreshJti,
  type UserRole,
} from '../auth/userStore';
import { issueTokenPair } from './helpers';
import type { GqlContext } from '../types/context';

export const authQueries = {
  /** Returns the caller decoded from their access token, or UNAUTHORIZED. */
  me(_: unknown, __: unknown, { currentUser }: GqlContext) {
    if (!currentUser) {
      return {
        user:   null,
        errors: [buildError('UNAUTHORIZED', 'No valid access token provided.')],
        meta:   buildMeta('UNAUTHORIZED'),
      };
    }
    return { user: currentUser, errors: [], meta: buildMeta('OK') };
  },
};

export const authMutations = {
  /**
   * Self-service account creation.
   * Anyone may register as USER. Granting ADMIN requires an ADMIN token.
   */
  async register(
    _: unknown,
    { input }: { input: { username: string; password: string; role?: UserRole } },
    { currentUser }: GqlContext
  ) {
    const requestedRole: UserRole = input.role ?? 'USER';

    // Privilege escalation check — only an existing ADMIN can create another ADMIN
    if (requestedRole === 'ADMIN') {
      if (!currentUser) {
        return {
          tokenPair: null, user: null,
          errors: [buildError('UNAUTHORIZED', 'You must be logged in to create an ADMIN account.')],
          meta:   buildMeta('UNAUTHORIZED'),
        };
      }
      if (currentUser.role !== 'ADMIN') {
        return {
          tokenPair: null, user: null,
          errors: [buildError('FORBIDDEN', 'Only an ADMIN can grant the ADMIN role.')],
          meta:   buildMeta('FORBIDDEN'),
        };
      }
    }

    const result = await createUser(input.username, input.password, requestedRole);
    if ('error' in result) {
      const code = result.error.includes('already taken') ? 'CONFLICT' : 'UNPROCESSABLE_ENTITY';
      return {
        tokenPair: null, user: null,
        errors: [buildError(code, result.error)],
        meta:   buildMeta(code),
      };
    }

    const tokenPair = issueTokenPair(result.user);
    return { tokenPair, user: result.user, errors: [], meta: buildMeta('CREATED') };
  },

  /** Exchanges username + password for an access + refresh token pair. */
  async login(
    _: unknown,
    { input }: { input: { username: string; password: string } }
  ) {
    const user = await authenticateUser(input.username, input.password);
    if (!user) {
      return {
        tokenPair: null, user: null,
        // Intentionally vague — never reveal whether the username exists
        errors: [buildError('UNAUTHORIZED', 'Invalid username or password.')],
        meta:   buildMeta('UNAUTHORIZED'),
      };
    }
    const tokenPair = issueTokenPair(user);
    return { tokenPair, user, errors: [], meta: buildMeta('OK') };
  },

  /**
   * Single-use refresh: the supplied token is immediately revoked and a
   * fresh access + refresh token pair is issued. Replays return UNAUTHORIZED.
   */
  refreshToken(_: unknown, { token }: { token: string }) {
    const result = verifyRefreshToken(token);
    if (!result.ok) {
      const msg = result.reason === 'expired'
        ? 'Refresh token has expired. Please log in again.'
        : 'Invalid refresh token.';
      return {
        tokenPair: null, user: null,
        errors: [buildError('UNAUTHORIZED', msg)],
        meta:   buildMeta('UNAUTHORIZED'),
      };
    }

    const { jti, sub } = result.payload;

    if (!isRefreshJtiActive(jti)) {
      return {
        tokenPair: null, user: null,
        errors: [buildError('UNAUTHORIZED', 'Refresh token has already been used or revoked.')],
        meta:   buildMeta('UNAUTHORIZED'),
      };
    }

    const user = findUserById(sub);
    if (!user) {
      return {
        tokenPair: null, user: null,
        errors: [buildError('NOT_FOUND', 'User account no longer exists.')],
        meta:   buildMeta('NOT_FOUND'),
      };
    }

    revokeRefreshJti(jti);
    const tokenPair = issueTokenPair(user);
    return { tokenPair, user, errors: [], meta: buildMeta('OK') };
  },

  /** Revokes the refresh token, ending the session for that token. */
  logout(_: unknown, { refreshToken: token }: { refreshToken: string }) {
    const result = verifyRefreshToken(token);
    if (!result.ok) {
      return {
        success: false,
        errors:  [buildError('UNAUTHORIZED', 'Invalid or expired refresh token.')],
        meta:    buildMeta('UNAUTHORIZED'),
      };
    }

    const revoked = revokeRefreshJti(result.payload.jti);
    if (!revoked) {
      return {
        success: false,
        errors:  [buildError('NOT_FOUND', 'Refresh token not found or already revoked.')],
        meta:    buildMeta('NOT_FOUND'),
      };
    }

    return { success: true, errors: [], meta: buildMeta('NO_CONTENT') };
  },
};
