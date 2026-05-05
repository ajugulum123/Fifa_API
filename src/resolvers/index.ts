/**
 * resolvers/index.ts
 * Assembles all query and mutation resolvers into the object
 * Apollo Server expects.
 */

import { Player }           from '../data/loadPlayers';
import { buildMeta, buildError, validateSkillRange, validateAge, validateHeight }
  from '../utils/meta';
import {
  signAccessToken, signRefreshToken, verifyRefreshToken,
  extractBearerToken, verifyAccessToken, expiresInToSeconds,
  ACCESS_EXPIRES_IN, REFRESH_EXPIRES_IN,
} from '../auth/jwt';
import {
  createUser, authenticateUser, findUserById,
  registerRefreshJti, isRefreshJtiActive, revokeRefreshJti,
  type PublicUser, type UserRole,
} from '../auth/userStore';
import { v4 as uuidv4 }     from 'uuid';

// ─────────────────────────────────────────────────────────────────────────────
// Context shape injected by server.ts
// ─────────────────────────────────────────────────────────────────────────────

export interface GqlContext {
  playerStore:  Map<string, Player>;
  requestId:    string;
  /**
   * Non-null when a valid `Authorization: Bearer <token>` header was present.
   * Null = unauthenticated. Protected resolvers return UNAUTHORIZED when null.
   */
  currentUser:  PublicUser | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth guard helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns an UNAUTHORIZED payload if currentUser is null. */
function requireAuth(currentUser: PublicUser | null) {
  if (!currentUser) {
    return {
      player: null,
      errors: [buildError('UNAUTHORIZED', 'You must be logged in to perform this action.')],
      meta:   buildMeta('UNAUTHORIZED'),
    };
  }
  return null;
}

/** Returns a FORBIDDEN payload if the user's role is not in allowedRoles. */
function requireRole(currentUser: PublicUser, allowedRoles: UserRole[]) {
  if (!allowedRoles.includes(currentUser.role as UserRole)) {
    return {
      player: null,
      errors: [buildError(
        'FORBIDDEN',
        `Your role (${currentUser.role}) does not have permission for this action. Required: ${allowedRoles.join(' or ')}.`
      )],
      meta: buildMeta('FORBIDDEN'),
    };
  }
  return null;
}

/** Builds a token pair and registers the refresh JTI. */
function issueTokenPair(user: PublicUser) {
  const jti          = uuidv4();
  const accessToken  = signAccessToken({ sub: user.id, username: user.username, role: user.role });
  const refreshToken = signRefreshToken(user.id, jti);
  registerRefreshJti(jti);
  return {
    accessToken,
    refreshToken,
    accessTokenExpiresIn:  expiresInToSeconds(ACCESS_EXPIRES_IN  as string),
    refreshTokenExpiresIn: expiresInToSeconds(REFRESH_EXPIRES_IN as string),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function allPlayers(store: Map<string, Player>): Player[] {
  return Array.from(store.values());
}

function applyFilter(players: Player[], filter: Record<string, unknown> | null | undefined): Player[] {
  if (!filter) return players;

  return players.filter((p) => {
    if (filter.nameContains && typeof filter.nameContains === 'string') {
      if (!p.name.toLowerCase().includes(filter.nameContains.toLowerCase())) return false;
    }
    if (Array.isArray(filter.countries) && filter.countries.length > 0) {
      if (!filter.countries.includes(p.country)) return false;
    }
    if (Array.isArray(filter.clubs) && filter.clubs.length > 0) {
      if (!filter.clubs.includes(p.club)) return false;
    }
    if (filter.age) {
      const r = filter.age as { min?: number; max?: number };
      if (r.min !== undefined && p.age < r.min) return false;
      if (r.max !== undefined && p.age > r.max) return false;
    }
    if (filter.heightCm) {
      const r = filter.heightCm as { min?: number; max?: number };
      if (r.min !== undefined && p.heightCm < r.min) return false;
      if (r.max !== undefined && p.heightCm > r.max) return false;
    }
    if (filter.overallRating) {
      const r = filter.overallRating as { min?: number; max?: number };
      if (r.min !== undefined && p.overallRating < r.min) return false;
      if (r.max !== undefined && p.overallRating > r.max) return false;
    }
    if (filter.marketValue) {
      const r = filter.marketValue as { min?: number; max?: number };
      const mv = p.marketValue ?? 0;
      if (r.min !== undefined && mv < r.min) return false;
      if (r.max !== undefined && mv > r.max) return false;
    }
    // Skill-group sub-filters
    if (filter.technical) {
      const f = filter.technical as Record<string, { min?: number; max?: number }>;
      for (const [k, r] of Object.entries(f)) {
        const val = (p.technical as unknown as Record<string, number>)[k] ?? 0;
        if (r.min !== undefined && val < r.min) return false;
        if (r.max !== undefined && val > r.max) return false;
      }
    }
    if (filter.defensive) {
      const f = filter.defensive as Record<string, { min?: number; max?: number }>;
      for (const [k, r] of Object.entries(f)) {
        const val = (p.defensive as unknown as Record<string, number | null>)[k] ?? 0;
        if (r.min !== undefined && (val ?? 0) < r.min) return false;
        if (r.max !== undefined && (val ?? 0) > r.max) return false;
      }
    }
    if (filter.physical) {
      const f = filter.physical as Record<string, { min?: number; max?: number }>;
      for (const [k, r] of Object.entries(f)) {
        const val = (p.physical as unknown as Record<string, number>)[k] ?? 0;
        if (r.min !== undefined && val < r.min) return false;
        if (r.max !== undefined && val > r.max) return false;
      }
    }
    if (filter.goalkeeper) {
      const f = filter.goalkeeper as Record<string, { min?: number; max?: number }>;
      for (const [k, r] of Object.entries(f)) {
        const val = (p.goalkeeper as unknown as Record<string, number>)[k] ?? 0;
        if (r.min !== undefined && val < r.min) return false;
        if (r.max !== undefined && val > r.max) return false;
      }
    }
    return true;
  });
}

function applySort(players: Player[], sort: Array<{ field: string; direction: string }> | null | undefined): Player[] {
  if (!sort || sort.length === 0) return players;

  const fieldMap: Record<string, (p: Player) => number | string> = {
    NAME:          (p) => p.name,
    AGE:           (p) => p.age,
    HEIGHT_CM:     (p) => p.heightCm,
    WEIGHT_KG:     (p) => p.weightKg,
    MARKET_VALUE:  (p) => p.marketValue ?? 0,
    OVERALL_RATING:(p) => p.overallRating,
    BALL_CONTROL:  (p) => p.technical.ballControl,
    DRIBBLING:     (p) => p.technical.dribbling,
    ATTACKING_POSITION: (p) => p.technical.attackingPosition,
    FINISHING:     (p) => p.technical.finishing,
    SHOT_POWER:    (p) => p.technical.shotPower,
    LONG_SHOTS:    (p) => p.technical.longShots,
    VOLLEYS:       (p) => p.technical.volleys,
    CURVE:         (p) => p.technical.curve,
    FREE_KICK_ACCURACY: (p) => p.technical.freeKickAccuracy,
    PENALTIES:     (p) => p.technical.penalties,
    CROSSING:      (p) => p.technical.crossing,
    SHORT_PASSING: (p) => p.technical.shortPassing,
    LONG_PASSING:  (p) => p.technical.longPassing,
    VISION:        (p) => p.technical.vision,
    MARKING:       (p) => p.defensive.marking ?? 0,
    SLIDE_TACKLE:  (p) => p.defensive.slideTackle,
    STANDING_TACKLE:(p) => p.defensive.standingTackle,
    INTERCEPTIONS: (p) => p.defensive.interceptions,
    AGGRESSION:    (p) => p.defensive.aggression,
    ACCELERATION:  (p) => p.physical.acceleration,
    SPRINT_SPEED:  (p) => p.physical.sprintSpeed,
    AGILITY:       (p) => p.physical.agility,
    BALANCE:       (p) => p.physical.balance,
    STAMINA:       (p) => p.physical.stamina,
    STRENGTH:      (p) => p.physical.strength,
    JUMPING:       (p) => p.physical.jumping,
    HEADING:       (p) => p.physical.heading,
    REACTIONS:     (p) => p.physical.reactions,
    COMPOSURE:     (p) => p.physical.composure,
    GK_POSITIONING:(p) => p.goalkeeper.positioning,
    GK_DIVING:     (p) => p.goalkeeper.diving,
    GK_HANDLING:   (p) => p.goalkeeper.handling,
    GK_KICKING:    (p) => p.goalkeeper.kicking,
    GK_REFLEXES:   (p) => p.goalkeeper.reflexes,
  };

  return [...players].sort((a, b) => {
    for (const { field, direction } of sort) {
      const getter = fieldMap[field];
      if (!getter) continue;
      const av = getter(a);
      const bv = getter(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      if (cmp !== 0) return direction === 'DESC' ? -cmp : cmp;
    }
    return 0;
  });
}

function paginateWithCursors<T>(
  items: T[],
  pagination: { first?: number; after?: string; last?: number; before?: string } | null | undefined
): { edges: { cursor: string; node: T }[]; pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean; startCursor: string | null; endCursor: string | null }; totalCount: number } {
  const totalCount = items.length;
  const first  = pagination?.first  ?? 20;
  const maxFirst = Math.min(first, 100);  // enforce server cap

  let startIdx = 0;
  if (pagination?.after) {
    const afterIdx = parseInt(Buffer.from(pagination.after, 'base64').toString('utf8'), 10);
    startIdx = isNaN(afterIdx) ? 0 : afterIdx + 1;
  }
  if (pagination?.before) {
    const beforeIdx = parseInt(Buffer.from(pagination.before, 'base64').toString('utf8'), 10);
    const end = isNaN(beforeIdx) ? items.length : beforeIdx;
    startIdx = Math.max(0, end - (pagination.last ?? 20));
  }

  const sliced = items.slice(startIdx, startIdx + maxFirst);
  const edges  = sliced.map((node, i) => ({
    cursor: Buffer.from(String(startIdx + i)).toString('base64'),
    node,
  }));

  return {
    edges,
    pageInfo: {
      hasNextPage:     startIdx + maxFirst < totalCount,
      hasPreviousPage: startIdx > 0,
      startCursor:     edges[0]?.cursor ?? null,
      endCursor:       edges[edges.length - 1]?.cursor ?? null,
    },
    totalCount,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolvers
// ─────────────────────────────────────────────────────────────────────────────

export const resolvers = {
  Query: {
    // ── me ────────────────────────────────────────────────────────────────────
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

    // ── player(id) ────────────────────────────────────────────────────────────
    player(_: unknown, { id }: { id: string }, { playerStore }: GqlContext) {
      const found = playerStore.get(id);
      if (!found) {
        return {
          player: null,
          errors: [buildError('NOT_FOUND', `Player with id '${id}' does not exist.`)],
          meta:   buildMeta('NOT_FOUND'),
        };
      }
      return { player: found, errors: [], meta: buildMeta('OK') };
    },

    // ── players(...) ──────────────────────────────────────────────────────────
    players(
      _: unknown,
      { filter, sort, pagination }: { filter?: unknown; sort?: Array<{ field: string; direction: string }>; pagination?: { first?: number; after?: string } },
      { playerStore }: GqlContext
    ) {
      try {
        let list = allPlayers(playerStore);
        list = applyFilter(list, filter as Record<string, unknown>);
        list = applySort(list, sort);
        const { edges, pageInfo, totalCount } = paginateWithCursors(list, pagination);
        return { edges, pageInfo, totalCount, meta: buildMeta('OK') };
      } catch (err) {
        return { edges: [], pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null }, totalCount: 0, meta: buildMeta('INTERNAL_SERVER_ERROR') };
      }
    },

    // ── topPlayers(...) ───────────────────────────────────────────────────────
    topPlayers(
      _: unknown,
      { category, filter, limit }: { category: string; filter?: unknown; limit?: number },
      { playerStore }: GqlContext
    ) {
      const cap = Math.min(limit ?? 10, 50);
      let list  = allPlayers(playerStore);
      list = applyFilter(list, filter as Record<string, unknown>);

      const sortField: Record<string, string> = {
        TECHNICAL:   'OVERALL_RATING',
        DEFENSIVE:   'STANDING_TACKLE',
        PHYSICAL:    'STRENGTH',
        GOALKEEPER:  'GK_REFLEXES',
      };

      list = applySort(list, [{ field: sortField[category] ?? 'OVERALL_RATING', direction: 'DESC' }]);
      return list.slice(0, cap);
    },

    // ── clubs(...) ────────────────────────────────────────────────────────────
    clubs(
      _: unknown,
      { filter, sort, pagination }: { filter?: { nameContains?: string; country?: string; playerCount?: { min?: number; max?: number } }; sort?: { field: string; direction: string }; pagination?: { first?: number; after?: string } },
      { playerStore }: GqlContext
    ) {
      const clubMap = new Map<string, { country: string; players: Player[] }>();
      for (const p of playerStore.values()) {
        if (!clubMap.has(p.club)) clubMap.set(p.club, { country: p.country, players: [] });
        clubMap.get(p.club)!.players.push(p);
      }

      let clubs = Array.from(clubMap.entries()).map(([name, { country, players }]) => ({
        name,
        country,
        playerCount: players.length,
        averageAge:  players.reduce((s, p) => s + p.age, 0) / players.length,
        averageOverallRating: players.reduce((s, p) => s + p.overallRating, 0) / players.length,
      }));

      if (filter?.nameContains) clubs = clubs.filter(c => c.name.toLowerCase().includes(filter.nameContains!.toLowerCase()));
      if (filter?.country)      clubs = clubs.filter(c => c.country === filter.country);
      if (filter?.playerCount?.min !== undefined) clubs = clubs.filter(c => c.playerCount >= filter.playerCount!.min!);
      if (filter?.playerCount?.max !== undefined) clubs = clubs.filter(c => c.playerCount <= filter.playerCount!.max!);

      if (sort) {
        clubs.sort((a, b) => {
          const av = (a as Record<string, unknown>)[sort.field.toLowerCase().replace(/_([a-z])/g, (_, l) => l.toUpperCase())] as number | string ?? 0;
          const bv = (b as Record<string, unknown>)[sort.field.toLowerCase().replace(/_([a-z])/g, (_, l) => l.toUpperCase())] as number | string ?? 0;
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return sort.direction === 'DESC' ? -cmp : cmp;
        });
      }

      const { edges, pageInfo, totalCount } = paginateWithCursors(clubs, pagination);
      return { edges, pageInfo, totalCount, meta: buildMeta('OK') };
    },

    // ── countries ────────────────────────────────────────────────────────────
    countries(
      _: unknown,
      { nameContains }: { nameContains?: string },
      { playerStore }: GqlContext
    ) {
      const all = [...new Set(Array.from(playerStore.values()).map(p => p.country))].sort();
      return nameContains
        ? all.filter(c => c.toLowerCase().includes(nameContains.toLowerCase()))
        : all;
    },
  },

  Mutation: {
    // ── register ──────────────────────────────────────────────────────────────
    async register(
      _: unknown,
      { input }: { input: { username: string; password: string; role?: UserRole } },
      { currentUser }: GqlContext
    ) {
      // Only ADMIN can create other ADMIN accounts
      const requestedRole: UserRole = input.role ?? 'USER';
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

    // ── login ─────────────────────────────────────────────────────────────────
    async login(_: unknown, { input }: { input: { username: string; password: string } }) {
      const user = await authenticateUser(input.username, input.password);
      if (!user) {
        return {
          tokenPair: null, user: null,
          // Intentionally vague — do not reveal whether username exists
          errors: [buildError('UNAUTHORIZED', 'Invalid username or password.')],
          meta:   buildMeta('UNAUTHORIZED'),
        };
      }
      const tokenPair = issueTokenPair(user);
      return { tokenPair, user, errors: [], meta: buildMeta('OK') };
    },

    // ── refreshToken ──────────────────────────────────────────────────────────
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

      // Reject replayed tokens (single-use enforcement)
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

      // Rotate: revoke old JTI, issue new token pair
      revokeRefreshJti(jti);
      const tokenPair = issueTokenPair(user);
      return { tokenPair, user, errors: [], meta: buildMeta('OK') };
    },

    // ── logout ────────────────────────────────────────────────────────────────
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

    // ── createPlayer ─────────────────────────────────────────────────────────
    createPlayer(_: unknown, { input }: { input: Record<string, unknown> }, { playerStore, currentUser }: GqlContext) {
      const authCheck = requireAuth(currentUser);
      if (authCheck) return authCheck;
      const roleCheck = requireRole(currentUser!, ['ADMIN']);
      if (roleCheck) return roleCheck;

      const errors = [
        validateAge(input.age as number),
        validateHeight(input.heightCm as number),
        validateSkillRange(input.finishing as number, 'input.finishing'),
        validateSkillRange(input.sprintSpeed as number, 'input.sprintSpeed'),
      ].filter(Boolean);

      if (errors.length > 0) {
        return { player: null, errors, meta: buildMeta('UNPROCESSABLE_ENTITY') };
      }

      // Check for duplicate name + club
      const duplicate = Array.from(playerStore.values()).find(
        p => p.name === input.name && p.club === input.club
      );
      if (duplicate) {
        return {
          player: null,
          errors: [buildError('CONFLICT', `A player named '${input.name}' already exists at ${input.club}.`, 'input.name')],
          meta:   buildMeta('CONFLICT'),
        };
      }

      const player: Player = {
        id:          uuidv4(),
        name:        input.name as string,
        country:     input.country as string,
        club:        input.club as string,
        age:         input.age as number,
        heightCm:    input.heightCm as number,
        weightKg:    input.weightKg as number,
        marketValue: (input.marketValueUsd as number | undefined) ?? null,
        overallRating: 0,
        technical: {
          ballControl:       input.ballControl as number,
          dribbling:         input.dribbling as number,
          attackingPosition: input.attackingPosition as number,
          finishing:         input.finishing as number,
          shotPower:         input.shotPower as number,
          longShots:         input.longShots as number,
          volleys:           input.volleys as number,
          curve:             input.curve as number,
          freeKickAccuracy:  input.freeKickAccuracy as number,
          penalties:         input.penalties as number,
          crossing:          input.crossing as number,
          shortPassing:      input.shortPassing as number,
          longPassing:       input.longPassing as number,
          vision:            input.vision as number,
        },
        defensive: {
          marking:        (input.marking as number | undefined) ?? null,
          slideTackle:    input.slideTackle as number,
          standingTackle: input.standingTackle as number,
          interceptions:  input.interceptions as number,
          aggression:     input.aggression as number,
        },
        physical: {
          acceleration: input.acceleration as number,
          sprintSpeed:  input.sprintSpeed as number,
          agility:      input.agility as number,
          balance:      input.balance as number,
          stamina:      input.stamina as number,
          strength:     input.strength as number,
          jumping:      input.jumping as number,
          heading:      input.heading as number,
          reactions:    input.reactions as number,
          composure:    input.composure as number,
        },
        goalkeeper: {
          positioning: input.gkPositioning as number,
          diving:      input.gkDiving as number,
          handling:    input.gkHandling as number,
          kicking:     input.gkKicking as number,
          reflexes:    input.gkReflexes as number,
        },
      };

      playerStore.set(player.id, player);
      return { player, errors: [], meta: buildMeta('CREATED') };
    },

    // ── updatePlayer ─────────────────────────────────────────────────────────
    updatePlayer(_: unknown, { id, input }: { id: string; input: Record<string, unknown> }, { playerStore, currentUser }: GqlContext) {
      const authCheck = requireAuth(currentUser);
      if (authCheck) return authCheck;
      const roleCheck = requireRole(currentUser!, ['ADMIN']);
      if (roleCheck) return roleCheck;
      const existing = playerStore.get(id);
      if (!existing) {
        return {
          player: null,
          errors: [buildError('NOT_FOUND', `Player '${id}' not found.`)],
          meta:   buildMeta('NOT_FOUND'),
        };
      }

      const validationErrors = [
        input.age !== undefined      ? validateAge(input.age as number) : null,
        input.heightCm !== undefined ? validateHeight(input.heightCm as number) : null,
      ].filter(Boolean);

      if (validationErrors.length > 0) {
        return { player: null, errors: validationErrors, meta: buildMeta('UNPROCESSABLE_ENTITY') };
      }

      const updated: Player = {
        ...existing,
        ...(input.name        ? { name:        input.name as string  } : {}),
        ...(input.country     ? { country:     input.country as string } : {}),
        ...(input.club        ? { club:        input.club as string  } : {}),
        ...(input.age         ? { age:         input.age as number   } : {}),
        ...(input.heightCm    ? { heightCm:    input.heightCm as number } : {}),
        ...(input.weightKg    ? { weightKg:    input.weightKg as number } : {}),
        marketValue: (input.marketValueUsd as number | undefined) ?? existing.marketValue,
      };

      playerStore.set(id, updated);
      return { player: updated, errors: [], meta: buildMeta('OK') };
    },

    // ── deletePlayer ─────────────────────────────────────────────────────────
    deletePlayer(_: unknown, { id }: { id: string }, { playerStore, currentUser }: GqlContext) {
      const authCheck = requireAuth(currentUser);
      if (authCheck) return { deletedPlayerId: null, errors: authCheck.errors, meta: authCheck.meta };
      const roleCheck = requireRole(currentUser!, ['ADMIN']);
      if (roleCheck) return { deletedPlayerId: null, errors: roleCheck.errors, meta: roleCheck.meta };
      if (!playerStore.has(id)) {
        return {
          deletedPlayerId: null,
          errors: [buildError('NOT_FOUND', `Player '${id}' not found.`)],
          meta:   buildMeta('NOT_FOUND'),
        };
      }
      playerStore.delete(id);
      return { deletedPlayerId: id, errors: [], meta: buildMeta('NO_CONTENT') };
    },
  },
};
