/**
 * resolvers/helpers.ts
 * Pure helpers shared by multiple resolver modules:
 * • Auth guards: requireAuth, requireRole
 * • Token issuance: issueTokenPair
 * • Player list utilities: allPlayers, applyFilter, applySort, paginateWithCursors
 *
 * Keeping these here lets each resolver module stay focused on its domain.
 */

import { v4 as uuidv4 } from 'uuid';
import { Player } from '../data/loadPlayers';
import { buildMeta, buildError } from '../utils/meta';
import {
  signAccessToken, signRefreshToken,
  expiresInToSeconds,
  ACCESS_EXPIRES_IN, REFRESH_EXPIRES_IN,
} from '../auth/jwt';
import {
  registerRefreshJti,
  type PublicUser, type UserRole,
} from '../auth/userStore';

//
// Auth guards
//

/** Returns an UNAUTHORIZED payload if currentUser is null, else null. */
export function requireAuth(currentUser: PublicUser | null) {
  if (!currentUser) {
    return {
      player: null,
      errors: [buildError('UNAUTHORIZED', 'You must be logged in to perform this action.')],
      meta: buildMeta('UNAUTHORIZED'),
    };
  }
  return null;
}

/** Returns a FORBIDDEN payload if the user's role is not in allowedRoles, else null. */
export function requireRole(currentUser: PublicUser, allowedRoles: UserRole[]) {
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

//
// Token issuance
//

/** Builds an access + refresh token pair and registers the refresh JTI. */
export function issueTokenPair(user: PublicUser) {
  const jti = uuidv4();
  const accessToken = signAccessToken({ sub: user.id, username: user.username, role: user.role });
  const refreshToken = signRefreshToken(user.id, jti);
  registerRefreshJti(jti);
  return {
    accessToken,
    refreshToken,
    accessTokenExpiresIn: expiresInToSeconds(ACCESS_EXPIRES_IN as string),
    refreshTokenExpiresIn: expiresInToSeconds(REFRESH_EXPIRES_IN as string),
  };
}

//
// Player list utilities
//

export function allPlayers(store: Map<string, Player>): Player[] {
  return Array.from(store.values());
}

/**
 * Applies the `PlayerFilterInput` filter object to a list of players.
 * Each clause is independent and short-circuits when a player fails.
 */
export function applyFilter(
  players: Player[],
  filter: Record<string, unknown> | null | undefined
): Player[] {
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
    if (filter.technical && !skillRangeMatch(p.technical, filter.technical)) return false;
    if (filter.defensive && !skillRangeMatch(p.defensive, filter.defensive)) return false;
    if (filter.physical && !skillRangeMatch(p.physical, filter.physical)) return false;
    if (filter.goalkeeper && !skillRangeMatch(p.goalkeeper, filter.goalkeeper)) return false;
    return true;
  });
}

function skillRangeMatch(group: object, ranges: unknown): boolean {
  const f = ranges as Record<string, { min?: number; max?: number }>;
  const obj = group as unknown as Record<string, number | null>;
  for (const [k, r] of Object.entries(f)) {
    const val = obj[k] ?? 0;
    if (r.min !== undefined && val < r.min) return false;
    if (r.max !== undefined && val > r.max) return false;
  }
  return true;
}

// Sort field map - single source of truth for player sortable fields
const PLAYER_SORT_FIELDS: Record<string, (p: Player) => number | string> = {
  NAME: (p) => p.name,
  AGE: (p) => p.age,
  HEIGHT_CM: (p) => p.heightCm,
  WEIGHT_KG: (p) => p.weightKg,
  MARKET_VALUE: (p) => p.marketValue ?? 0,
  OVERALL_RATING: (p) => p.overallRating,
  BALL_CONTROL: (p) => p.technical.ballControl,
  DRIBBLING: (p) => p.technical.dribbling,
  ATTACKING_POSITION: (p) => p.technical.attackingPosition,
  FINISHING: (p) => p.technical.finishing,
  SHOT_POWER: (p) => p.technical.shotPower,
  LONG_SHOTS: (p) => p.technical.longShots,
  VOLLEYS: (p) => p.technical.volleys,
  CURVE: (p) => p.technical.curve,
  FREE_KICK_ACCURACY: (p) => p.technical.freeKickAccuracy,
  PENALTIES: (p) => p.technical.penalties,
  CROSSING: (p) => p.technical.crossing,
  SHORT_PASSING: (p) => p.technical.shortPassing,
  LONG_PASSING: (p) => p.technical.longPassing,
  VISION: (p) => p.technical.vision,
  MARKING: (p) => p.defensive.marking ?? 0,
  SLIDE_TACKLE: (p) => p.defensive.slideTackle,
  STANDING_TACKLE: (p) => p.defensive.standingTackle,
  INTERCEPTIONS: (p) => p.defensive.interceptions,
  AGGRESSION: (p) => p.defensive.aggression,
  ACCELERATION: (p) => p.physical.acceleration,
  SPRINT_SPEED: (p) => p.physical.sprintSpeed,
  AGILITY: (p) => p.physical.agility,
  BALANCE: (p) => p.physical.balance,
  STAMINA: (p) => p.physical.stamina,
  STRENGTH: (p) => p.physical.strength,
  JUMPING: (p) => p.physical.jumping,
  HEADING: (p) => p.physical.heading,
  REACTIONS: (p) => p.physical.reactions,
  COMPOSURE: (p) => p.physical.composure,
  GK_POSITIONING: (p) => p.goalkeeper.positioning,
  GK_DIVING: (p) => p.goalkeeper.diving,
  GK_HANDLING: (p) => p.goalkeeper.handling,
  GK_KICKING: (p) => p.goalkeeper.kicking,
  GK_REFLEXES: (p) => p.goalkeeper.reflexes,
};

/** Stable multi-key sort. Falls through to the next key on tie. */
export function applySort(
  players: Player[],
  sort: Array<{ field: string; direction: string }> | null | undefined
): Player[] {
  if (!sort || sort.length === 0) return players;

  return [...players].sort((a, b) => {
    for (const { field, direction } of sort) {
      const getter = PLAYER_SORT_FIELDS[field];
      if (!getter) continue;
      const av = getter(a);
      const bv = getter(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      if (cmp !== 0) return direction === 'DESC' ? -cmp : cmp;
    }
    return 0;
  });
}

//
// Pagination - Relay-style cursor connection
//

interface PaginationArgs {
  first?: number;
  after?: string;
  last?: number;
  before?: string;
}

interface PaginatedResult<T> {
  edges: { cursor: string; node: T }[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
  totalCount: number;
}

/**
 * Cursor-based pagination over an in-memory array.
 * Cursors are simply base64-encoded indices - opaque to the client.
 * Caps `first` at 100 to bound response size.
 */
export function paginateWithCursors<T>(
  items: T[],
  pagination: PaginationArgs | null | undefined
): PaginatedResult<T> {
  const totalCount = items.length;
  const first = pagination?.first ?? 20;
  const maxFirst = Math.min(first, 100);

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
  const edges = sliced.map((node, i) => ({
    cursor: Buffer.from(String(startIdx + i)).toString('base64'),
    node,
  }));

  return {
    edges,
    pageInfo: {
      hasNextPage: startIdx + maxFirst < totalCount,
      hasPreviousPage: startIdx > 0,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
    totalCount,
  };
}
