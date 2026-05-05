/**
 * resolvers/index.ts
 * Composes domain-specific resolver modules into the single resolvers object
 * Apollo Server expects.
 *
 * Each module is responsible for one concern:
 *   • auth.resolvers     — me, register, login, refreshToken, logout
 *   • players.resolvers  — player, players, topPlayers, create/update/deletePlayer
 *   • clubs.resolvers    — clubs, countries
 *
 * The shared helpers (auth guards, token issuance, pagination, filter/sort)
 * live in ./helpers and the GqlContext type lives in ../types/context.
 */

import { authQueries,    authMutations    } from './auth.resolvers';
import { playerQueries,  playerMutations  } from './players.resolvers';
import { clubQueries }                       from './clubs.resolvers';

// Re-export the context type so existing imports (e.g. server.ts) keep working
export type { GqlContext } from '../types/context';

export const resolvers = {
  Query: {
    ...authQueries,
    ...playerQueries,
    ...clubQueries,
  },
  Mutation: {
    ...authMutations,
    ...playerMutations,
  },
};
