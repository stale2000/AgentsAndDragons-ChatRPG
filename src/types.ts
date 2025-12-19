/**
 * Core Types - Shared Enums & Interfaces
 * Menu-Driven Design: Use enums for dropdowns
 */

import { z } from 'zod';

// ============================================================
// D&D 5e ENUMS (Menu-Driven)
// ============================================================

export const ConditionSchema = z.enum([
  'blinded',
  'charmed',
  'deafened',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
  'exhaustion',
]);
export type Condition = z.infer<typeof ConditionSchema>;

export const DamageTypeSchema = z.enum([
  'slashing',
  'piercing',
  'bludgeoning',
  'fire',
  'cold',
  'lightning',
  'thunder',
  'acid',
  'poison',
  'necrotic',
  'radiant',
  'force',
  'psychic',
]);
export type DamageType = z.infer<typeof DamageTypeSchema>;

export const AbilitySchema = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']);
export type Ability = z.infer<typeof AbilitySchema>;

export const SkillSchema = z.enum([
  'acrobatics',
  'animal_handling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleight_of_hand',
  'stealth',
  'survival',
]);
export type Skill = z.infer<typeof SkillSchema>;

export const ActionTypeSchema = z.enum([
  'attack',
  'cast_spell',
  'dash',
  'disengage',
  'dodge',
  'help',
  'hide',
  'ready',
  'search',
  'use_object',
  'use_magic_item',
  'use_special_ability',
  'shove',
  'grapple',
]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

// Action Economy (ADR-001)
export const ActionCostSchema = z.enum([
  'action',
  'bonus_action',
  'reaction',
  'free',
  'movement',
]);
export type ActionCost = z.infer<typeof ActionCostSchema>;

// Weapon Categories (ADR-001)
export const WeaponTypeSchema = z.enum([
  'melee',
  'ranged',
  'melee_finesse',
  'ranged_thrown',
]);
export type WeaponType = z.infer<typeof WeaponTypeSchema>;

// Attack Result (ADR-001)
export const AttackResultSchema = z.enum([
  'hit',
  'miss',
  'critical_hit',
  'critical_miss',
]);
export type AttackResult = z.infer<typeof AttackResultSchema>;

export const SizeSchema = z.enum([
  'tiny',
  'small',
  'medium',
  'large',
  'huge',
  'gargantuan',
]);
export type Size = z.infer<typeof SizeSchema>;

export const CoverSchema = z.enum(['none', 'half', 'three_quarters', 'full']);
export type Cover = z.infer<typeof CoverSchema>;

export const LightSchema = z.enum(['bright', 'dim', 'darkness', 'magical_darkness']);
export type Light = z.infer<typeof LightSchema>;

// ============================================================
// SPATIAL TYPES
// ============================================================

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number().default(0),
});
export type Position = z.infer<typeof PositionSchema>;

export const AoeShapeSchema = z.enum(['line', 'cone', 'cube', 'sphere', 'cylinder']);
export type AoeShape = z.infer<typeof AoeShapeSchema>;

// ============================================================
// ROOM / NODE TYPES
// ============================================================

export const ConnectionTypeSchema = z.enum([
  'door',
  'passage',
  'stairs',
  'ladder',
  'portal',
  'hidden',
]);
export type ConnectionType = z.infer<typeof ConnectionTypeSchema>;

export interface Room {
  id: string;
  name: string;
  description: string;
  lighting: Light;
  tags: string[];
  npcsPresent: string[];
  itemsPresent: string[];
}

export interface Connection {
  from: string;
  to: string;
  type: ConnectionType;
  locked?: boolean;
  hidden?: boolean;
  oneWay?: boolean;
  travelTime?: number;
}
