/**
 * resolvers/clubs.resolvers.ts
 * GraphQL resolvers for the ClubSummary type and country listing.
 *   Query.clubs
 *   Query.countries
 *
 * Clubs are aggregated on the fly from the player store — there is no
 * persistent Club entity, which keeps the schema flat and avoids
 * circular references.
 */

import { Player }                      from '../data/loadPlayers';
import { buildMeta }                   from '../utils/meta';
import { paginateWithCursors }         from './helpers';
import type { GqlContext }             from '../types/context';

export interface ClubFilter {
  nameContains?: string;
  country?:      string;
  playerCount?:  { min?: number; max?: number };
}

export interface ClubSort {
  field:     string;
  direction: string;
}

export interface ClubSummary {
  name:                 string;
  country:              string;
  playerCount:          number;
  averageAge:           number;
  averageOverallRating: number;
}

export const clubQueries = {
  /**
   * Aggregates the player store into ClubSummary rows, then applies
   * filtering, sorting, and pagination.
   */
  clubs(
    _: unknown,
    { filter, sort, pagination }: {
      filter?:     ClubFilter;
      sort?:       ClubSort;
      pagination?: { first?: number; after?: string };
    },
    { playerStore }: GqlContext
  ) {
    let clubs = aggregateClubs(playerStore);

    if (filter?.nameContains) {
      clubs = clubs.filter(c => c.name.toLowerCase().includes(filter.nameContains!.toLowerCase()));
    }
    if (filter?.country) {
      clubs = clubs.filter(c => c.country === filter.country);
    }
    if (filter?.playerCount?.min !== undefined) {
      clubs = clubs.filter(c => c.playerCount >= filter.playerCount!.min!);
    }
    if (filter?.playerCount?.max !== undefined) {
      clubs = clubs.filter(c => c.playerCount <= filter.playerCount!.max!);
    }

    if (sort) {
      const key = enumToCamel(sort.field);
      clubs.sort((a, b) => {
        const av = (a as unknown as Record<string, unknown>)[key] as number | string ?? 0;
        const bv = (b as unknown as Record<string, unknown>)[key] as number | string ?? 0;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sort.direction === 'DESC' ? -cmp : cmp;
      });
    }

    const { edges, pageInfo, totalCount } = paginateWithCursors(clubs, pagination);
    return { edges, pageInfo, totalCount, meta: buildMeta('OK') };
  },

  /** Distinct sorted list of countries; supports a substring filter. */
  countries(
    _: unknown,
    { nameContains }: { nameContains?: string },
    { playerStore }: GqlContext
  ): string[] {
    const all = [...new Set(Array.from(playerStore.values()).map(p => p.country))].sort();
    return nameContains
      ? all.filter(c => c.toLowerCase().includes(nameContains.toLowerCase()))
      : all;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Local helpers
// ─────────────────────────────────────────────────────────────────────────────

function aggregateClubs(store: Map<string, Player>): ClubSummary[] {
  const map = new Map<string, { country: string; players: Player[] }>();
  for (const p of store.values()) {
    if (!map.has(p.club)) map.set(p.club, { country: p.country, players: [] });
    map.get(p.club)!.players.push(p);
  }
  return Array.from(map.entries()).map(([name, { country, players }]) => ({
    name,
    country,
    playerCount:          players.length,
    averageAge:           players.reduce((s, p) => s + p.age, 0) / players.length,
    averageOverallRating: players.reduce((s, p) => s + p.overallRating, 0) / players.length,
  }));
}

/** Converts an SDL-style enum (FOO_BAR) to a camelCase JS key (fooBar). */
function enumToCamel(enumValue: string): string {
  return enumValue.toLowerCase().replace(/_([a-z])/g, (_, l) => l.toUpperCase());
}
