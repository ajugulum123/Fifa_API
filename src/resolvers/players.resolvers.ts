/**
 * resolvers/players.resolvers.ts
 * GraphQL resolvers for the Player type:
 *   Query.player / players / topPlayers
 *   Mutation.createPlayer / updatePlayer / deletePlayer
 */

import { v4 as uuidv4 } from 'uuid';
import { Player }       from '../data/loadPlayers';
import { buildMeta, buildError, validateSkillRange, validateAge, validateHeight }
  from '../utils/meta';
import {
  requireAuth, requireRole,
  allPlayers, applyFilter, applySort, paginateWithCursors,
} from './helpers';
import type { GqlContext } from '../types/context';

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

export const playerQueries = {
  /** Single player lookup by ID. */
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

  /** Filter + sort + paginate the full player set. */
  players(
    _: unknown,
    { filter, sort, pagination }: {
      filter?:     unknown;
      sort?:       Array<{ field: string; direction: string }>;
      pagination?: { first?: number; after?: string };
    },
    { playerStore }: GqlContext
  ) {
    try {
      let list = allPlayers(playerStore);
      list = applyFilter(list, filter as Record<string, unknown>);
      list = applySort(list, sort);
      const { edges, pageInfo, totalCount } = paginateWithCursors(list, pagination);
      return { edges, pageInfo, totalCount, meta: buildMeta('OK') };
    } catch {
      return {
        edges: [],
        pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
        totalCount: 0,
        meta: buildMeta('INTERNAL_SERVER_ERROR'),
      };
    }
  },

  /** Leaderboard: top N within a skill category. Hard-capped at 50. */
  topPlayers(
    _: unknown,
    { category, filter, limit }: { category: string; filter?: unknown; limit?: number },
    { playerStore }: GqlContext
  ) {
    const cap = Math.min(limit ?? 10, 50);
    let list  = allPlayers(playerStore);
    list = applyFilter(list, filter as Record<string, unknown>);

    const sortField: Record<string, string> = {
      TECHNICAL:  'OVERALL_RATING',
      DEFENSIVE:  'STANDING_TACKLE',
      PHYSICAL:   'STRENGTH',
      GOALKEEPER: 'GK_REFLEXES',
    };

    list = applySort(list, [{
      field: sortField[category] ?? 'OVERALL_RATING',
      direction: 'DESC',
    }]);
    return list.slice(0, cap);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Mutations (all require ADMIN)
// ─────────────────────────────────────────────────────────────────────────────

export const playerMutations = {
  createPlayer(
    _: unknown,
    { input }: { input: Record<string, unknown> },
    { playerStore, currentUser }: GqlContext
  ) {
    const authCheck = requireAuth(currentUser);  if (authCheck) return authCheck;
    const roleCheck = requireRole(currentUser!, ['ADMIN']); if (roleCheck) return roleCheck;

    const errors = [
      validateAge(input.age as number),
      validateHeight(input.heightCm as number),
      validateSkillRange(input.finishing as number,   'input.finishing'),
      validateSkillRange(input.sprintSpeed as number, 'input.sprintSpeed'),
    ].filter(Boolean);

    if (errors.length > 0) {
      return { player: null, errors, meta: buildMeta('UNPROCESSABLE_ENTITY') };
    }

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

    const player: Player = buildPlayerFromInput(input);
    playerStore.set(player.id, player);
    return { player, errors: [], meta: buildMeta('CREATED') };
  },

  updatePlayer(
    _: unknown,
    { id, input }: { id: string; input: Record<string, unknown> },
    { playerStore, currentUser }: GqlContext
  ) {
    const authCheck = requireAuth(currentUser);  if (authCheck) return authCheck;
    const roleCheck = requireRole(currentUser!, ['ADMIN']); if (roleCheck) return roleCheck;

    const existing = playerStore.get(id);
    if (!existing) {
      return {
        player: null,
        errors: [buildError('NOT_FOUND', `Player '${id}' not found.`)],
        meta:   buildMeta('NOT_FOUND'),
      };
    }

    const validationErrors = [
      input.age      !== undefined ? validateAge(input.age as number)       : null,
      input.heightCm !== undefined ? validateHeight(input.heightCm as number) : null,
    ].filter(Boolean);

    if (validationErrors.length > 0) {
      return { player: null, errors: validationErrors, meta: buildMeta('UNPROCESSABLE_ENTITY') };
    }

    const updated: Player = {
      ...existing,
      ...(input.name     ? { name:     input.name as string  } : {}),
      ...(input.country  ? { country:  input.country as string } : {}),
      ...(input.club     ? { club:     input.club as string  } : {}),
      ...(input.age      ? { age:      input.age as number   } : {}),
      ...(input.heightCm ? { heightCm: input.heightCm as number } : {}),
      ...(input.weightKg ? { weightKg: input.weightKg as number } : {}),
      marketValue: (input.marketValueUsd as number | undefined) ?? existing.marketValue,
    };

    playerStore.set(id, updated);
    return { player: updated, errors: [], meta: buildMeta('OK') };
  },

  deletePlayer(
    _: unknown,
    { id }: { id: string },
    { playerStore, currentUser }: GqlContext
  ) {
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
};

// ─────────────────────────────────────────────────────────────────────────────
// Local helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildPlayerFromInput(input: Record<string, unknown>): Player {
  return {
    id:            uuidv4(),
    name:          input.name as string,
    country:       input.country as string,
    club:          input.club as string,
    age:           input.age as number,
    heightCm:      input.heightCm as number,
    weightKg:      input.weightKg as number,
    marketValue:   (input.marketValueUsd as number | undefined) ?? null,
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
}
