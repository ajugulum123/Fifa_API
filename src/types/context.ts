/**
 * Shared GraphQL context type injected by server.ts on every request.
 * Imported by all resolver modules so they stay agnostic of how
 * the context is constructed.
 */

import type { Player }      from '../data/loadPlayers';
import type { PublicUser }  from '../auth/userStore';

export interface GqlContext {
  /** In-memory player store, populated at server startup from the CSV. */
  playerStore:  Map<string, Player>;

  /** Per-request correlation ID for logging and tracing. */
  requestId:    string;

  /**
   * Non-null when a valid `Authorization: Bearer <token>` header was present
   * and decoded to a known user. Null = unauthenticated.
   * Protected resolvers return UNAUTHORIZED when null.
   */
  currentUser:  PublicUser | null;
}
