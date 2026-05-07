import { describe, it, expect } from 'vitest';
import path from 'path';
import { loadPlayers } from '../src/data/loadPlayers';

const CSV = path.resolve(__dirname, '../dataset/player_stats.csv');

describe('loadPlayers', () => {
  it('parses the bundled CSV into a Map keyed by id', () => {
    const store = loadPlayers(CSV);
    expect(store.size).toBeGreaterThan(5000);
  });

  it('every player has the required top-level fields', () => {
    const store = loadPlayers(CSV);
    let i = 0;
    for (const player of store.values()) {
      expect(player.id).toBeTruthy();
      expect(typeof player.name).toBe('string');
      expect(typeof player.country).toBe('string');
      expect(typeof player.age).toBe('number');
      expect(typeof player.overallRating).toBe('number');
      expect(player.overallRating).toBeGreaterThan(0);
      expect(player.overallRating).toBeLessThanOrEqual(100);
      // Sample only the first 50 rows to keep this fast
      if (++i >= 50) break;
    }
  });

  it('throws a clear error when the CSV path is missing', () => {
    expect(() => loadPlayers('/nonexistent/path.csv')).toThrowError(/CSV not found/);
  });
});
