/**
 * loadPlayers.ts
 * Reads the CSV synchronously at startup and returns a Map<id, Player>
 * used as the in-memory data store for all resolvers.
 */

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

//
// Types that mirror the GraphQL schema exactly
//

export interface TechnicalSkills {
  ballControl: number;
  dribbling: number;
  attackingPosition: number;
  finishing: number;
  shotPower: number;
  longShots: number;
  volleys: number;
  curve: number;
  freeKickAccuracy: number;
  penalties: number;
  crossing: number;
  shortPassing: number;
  longPassing: number;
  vision: number;
}

export interface DefensiveSkills {
  marking: number | null;
  slideTackle: number;
  standingTackle: number;
  interceptions: number;
  aggression: number;
}

export interface PhysicalAttributes {
  acceleration: number;
  sprintSpeed: number;
  agility: number;
  balance: number;
  stamina: number;
  strength: number;
  jumping: number;
  heading: number;
  reactions: number;
  composure: number;
}

export interface GoalkeeperSkills {
  positioning: number;
  diving: number;
  handling: number;
  kicking: number;
  reflexes: number;
}

export interface Player {
  id: string;
  name: string;
  country: string;
  club: string;
  age: number;
  heightCm: number;
  weightKg: number;
  marketValue: number | null;
  overallRating: number;
  technical: TechnicalSkills;
  defensive: DefensiveSkills;
  physical: PhysicalAttributes;
  goalkeeper: GoalkeeperSkills;
}

//
// Helpers
//

function int(raw: string): number {
  const n = parseInt(raw.trim(), 10);
  return isNaN(n) ? 0 : n;
}

function nullableInt(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = parseInt(raw.trim(), 10);
  return isNaN(n) ? null : n;
}

/** Parses "$1.400.000" or "$975.00" -> number (USD float). */
function parseCurrency(raw: string): number | null {
  if (!raw.trim()) return null;
  // Remove $, thousands dots, then parse
  const cleaned = raw.trim().replace(/^\$/, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/**
 * Compute a weighted overall rating from the three outfield skill groups.
 * Goalkeepers get a GK-weighted formula instead.
 * This mirrors the logic FIFA uses (simplified).
 */
function computeOverall(
  t: TechnicalSkills,
  d: DefensiveSkills,
  p: PhysicalAttributes,
  g: GoalkeeperSkills
): number {
  const isGK = g.positioning + g.diving + g.handling + g.kicking + g.reflexes > 300;

  if (isGK) {
    const gkAvg = (g.positioning + g.diving + g.handling + g.kicking + g.reflexes) / 5;
    return Math.round(gkAvg * 0.7 + p.reactions * 0.15 + p.composure * 0.15);
  }

  const techAvg = (
    t.ballControl + t.dribbling + t.finishing + t.shortPassing +
    t.longPassing + t.vision + t.crossing + t.shotPower
  ) / 8;

  const defAvg = (
    (d.marking ?? 0) + d.slideTackle + d.standingTackle + d.interceptions
  ) / 4;

  const physAvg = (
    p.acceleration + p.sprintSpeed + p.stamina + p.strength +
    p.reactions + p.composure
  ) / 6;

  return Math.round(techAvg * 0.45 + defAvg * 0.25 + physAvg * 0.30);
}

//
// Parser
//

/**
 * Parses the CSV synchronously and returns a Map<id, Player>.
 * Synchronous parsing is acceptable here because this runs once at startup
 * before the server begins accepting requests.
 */
export function loadPlayers(csvPath: string): Map<string, Player> {
  const absolutePath = path.resolve(csvPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`CSV not found at ${absolutePath}`);
  }

  const raw = fs.readFileSync(absolutePath, { encoding: 'latin1' });
  const lines = raw.split('\n').filter(Boolean);
  const store = new Map<string, Player>();

  // Skip header row (index 0)
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 41) continue; // skip malformed rows

    const [
      player, country, height, weight, age, club,
      ball_control, dribbling, marking, slide_tackle, stand_tackle,
      aggression, reactions, att_position, interceptions, vision, composure,
      crossing, short_pass, long_pass, acceleration, stamina, strength,
      balance, sprint_speed, agility, jumping, heading, shot_power,
      finishing, long_shots, curve, fk_acc, penalties, volleys,
      gk_positioning, gk_diving, gk_handling, gk_kicking, gk_reflexes,
      value,
    ] = cols;

    const technical: TechnicalSkills = {
      ballControl: int(ball_control),
      dribbling: int(dribbling),
      attackingPosition: int(att_position),
      finishing: int(finishing),
      shotPower: int(shot_power),
      longShots: int(long_shots),
      volleys: int(volleys),
      curve: int(curve),
      freeKickAccuracy: int(fk_acc),
      penalties: int(penalties),
      crossing: int(crossing),
      shortPassing: int(short_pass),
      longPassing: int(long_pass),
      vision: int(vision),
    };

    const defensive: DefensiveSkills = {
      marking: nullableInt(marking),
      slideTackle: int(slide_tackle),
      standingTackle: int(stand_tackle),
      interceptions: int(interceptions),
      aggression: int(aggression),
    };

    const physical: PhysicalAttributes = {
      acceleration: int(acceleration),
      sprintSpeed: int(sprint_speed),
      agility: int(agility),
      balance: int(balance),
      stamina: int(stamina),
      strength: int(strength),
      jumping: int(jumping),
      heading: int(heading),
      reactions: int(reactions),
      composure: int(composure),
    };

    const goalkeeper: GoalkeeperSkills = {
      positioning: int(gk_positioning),
      diving: int(gk_diving),
      handling: int(gk_handling),
      kicking: int(gk_kicking),
      reflexes: int(gk_reflexes),
    };

    const p: Player = {
      id: uuidv4(),
      name: player.trim(),
      country: country.trim(),
      club: club.trim(),
      age: int(age),
      heightCm: int(height),
      weightKg: int(weight),
      marketValue: parseCurrency(value ?? ''),
      overallRating: computeOverall(technical, defensive, physical, goalkeeper),
      technical,
      defensive,
      physical,
      goalkeeper,
    };

    store.set(p.id, p);
  }

  return store;
}
