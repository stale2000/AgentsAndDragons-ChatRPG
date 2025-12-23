export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export type AbilityScores = Record<AbilityKey, number>;

export type SavingThrows = Partial<Record<AbilityKey, boolean>>; // proficient flags

export type SkillKey =
  | 'acrobatics' | 'animalHandling' | 'arcana' | 'athletics' | 'deception'
  | 'history' | 'insight' | 'intimidation' | 'investigation' | 'medicine'
  | 'nature' | 'perception' | 'performance' | 'persuasion' | 'religion'
  | 'sleightOfHand' | 'stealth' | 'survival';

export const SKILL_ABILITY: Record<SkillKey, AbilityKey> = {
  acrobatics: 'dex',
  animalHandling: 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  sleightOfHand: 'dex',
  stealth: 'dex',
  survival: 'wis',
};

export type SkillProficiency = {
  proficient?: boolean;
  expertise?: boolean;
  bonusOverride?: number; // if provided, overrides calculation
};

export type Skills = Partial<Record<SkillKey, SkillProficiency>>;

export type Attack = {
  name: string;
  ability?: AbilityKey; // for to-hit if toHit not provided
  proficient?: boolean;
  toHit?: number; // explicit bonus; otherwise computed
  damage: string; // e.g., "1d8+3"
  damageType?: string; // e.g., "slashing"
  range?: string; // e.g., "5 ft" or "80/320 ft"
  magical?: boolean;
  description?: string;
};

export type Proficiencies = {
  armor?: string[];
  weapons?: string[];
  tools?: string[];
  languages?: string[];
};

export type HitPoints = {
  current: number;
  max: number;
  temp?: number;
};

export type DnD5eCharacter = {
  id: string;
  name: string;
  level: number;
  className: string;
  ancestry?: string;
  alignment?: string;
  speed: number; // feet
  ac: number;
  hp: HitPoints;
  abilityScores: AbilityScores;
  savingThrows?: SavingThrows;
  skills?: Skills;
  attacks?: Attack[];
  features?: string[];
  traits?: string[];
  proficiencies?: Proficiencies;
  inventory?: {
    weapons?: EquippedWeapon[];
  };
};

export function calculateAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function calculateProficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(level, 1) - 1) / 4);
}

export function getSkillBonus(character: DnD5eCharacter, skill: SkillKey): number {
  const ability = SKILL_ABILITY[skill];
  const mod = calculateAbilityModifier(character.abilityScores[ability] ?? 10);
  const prof = character.skills?.[skill];
  if (!prof) return mod;
  if (typeof prof.bonusOverride === 'number') return prof.bonusOverride;
  const pb = calculateProficiencyBonus(character.level);
  const profBonus = prof.expertise ? pb * 2 : prof.proficient ? pb : 0;
  return mod + profBonus;
}

export function getAttackToHit(character: DnD5eCharacter, attack: Attack): number {
  if (typeof attack.toHit === 'number') return attack.toHit;
  const abilityKey: AbilityKey = attack.ability || 'str';
  const mod = calculateAbilityModifier(character.abilityScores[abilityKey] ?? 10);
  const pb = calculateProficiencyBonus(character.level);
  return mod + (attack.proficient ? pb : 0);
}

// Weapon integration
export type EquippedWeapon = {
  name: string; // should match entries in data list, but free text allowed
  ability?: AbilityKey; // override STR/DEX choice
  proficient?: boolean; // default true if trained
  bonusToHit?: number; // magic bonus to hit
  bonusDamage?: number; // magic bonus to damage
  versatileTwoHanded?: boolean; // if weapon has versatile property and is wielded two-handed
  notes?: string;
};

export type WeaponData = {
  name: string;
  damage: string; // e.g., 1d8
  damageType?: string;
  properties?: string[];
  range?: { normal: number; long?: number };
  versatileDamage?: string;
};

export function buildAttackFromWeapon(
  character: DnD5eCharacter,
  weapon: EquippedWeapon,
  lookup?: (name: string) => WeaponData | undefined
): Attack | null {
  const base = lookup?.(weapon.name);
  const ability: AbilityKey | undefined = weapon.ability ?? (base?.properties?.includes('finesse') ? 'dex' : undefined);
  const usingAbility: AbilityKey = ability || 'str';
  const mod = calculateAbilityModifier(character.abilityScores[usingAbility] ?? 10);
  const pb = calculateProficiencyBonus(character.level);
  const proficient = weapon.proficient ?? true;
  const toHit = mod + (proficient ? pb : 0) + (weapon.bonusToHit ?? 0);
  const baseDie = weapon.versatileTwoHanded && base?.versatileDamage ? base.versatileDamage : base?.damage || '1d4';
  const dmgMod = mod + (weapon.bonusDamage ?? 0);
  const rangeStr = base?.range ? `${base.range.normal}${base.range.long ? `/${base.range.long}` : ''} ft` : '5 ft';

  return {
    name: weapon.name,
    ability: usingAbility,
    proficient,
    toHit,
    damage: `${baseDie}${dmgMod >= 0 ? `+${dmgMod}` : dmgMod}`,
    damageType: base?.damageType,
    range: rangeStr,
    description: weapon.notes,
  };
}

export function getAllAttacks(character: DnD5eCharacter, weaponLookup?: (name: string) => WeaponData | undefined): Attack[] {
  const fromWeapons = (character.inventory?.weapons ?? [])
    .map(w => buildAttackFromWeapon(character, w, weaponLookup))
    .filter((a): a is Attack => !!a);
  const manual = character.attacks ?? [];
  // de-duplicate by name; prefer weapon-derived
  const byName = new Map<string, Attack>();
  for (const a of [...manual, ...fromWeapons]) byName.set(a.name, a);
  return Array.from(byName.values());
}

export type CharacterBlueprint = {
  name: string;
  role: 'pc' | 'npc' | 'monster';
  className?: string;
  level?: number;
  ac?: number;
  speed?: number;
  hp?: { max: number; current?: number; temp?: number };
  abilityScores?: Partial<AbilityScores>;
  savingThrows?: SavingThrows;
  skills?: Skills;
  attacks?: Attack[];
  features?: string[];
  traits?: string[];
  proficiencies?: Proficiencies;
};

export function buildCharacter(blueprint: CharacterBlueprint): DnD5eCharacter {
  const level = blueprint.level ?? 1;
  const abilityScores: AbilityScores = {
    str: blueprint.abilityScores?.str ?? 10,
    dex: blueprint.abilityScores?.dex ?? 10,
    con: blueprint.abilityScores?.con ?? 10,
    int: blueprint.abilityScores?.int ?? 10,
    wis: blueprint.abilityScores?.wis ?? 10,
    cha: blueprint.abilityScores?.cha ?? 10,
  };
  const id = `${blueprint.role}-${blueprint.name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`;
  const hpMax = blueprint.hp?.max ?? 8 + calculateAbilityModifier(abilityScores.con);
  const hpCurrent = Math.max(0, Math.min(blueprint.hp?.current ?? hpMax, hpMax));

  return {
    id,
    name: blueprint.name,
    level,
    className: blueprint.className ?? (blueprint.role === 'monster' ? 'Monster' : 'Adventurer'),
    speed: blueprint.speed ?? 30,
    ac: blueprint.ac ?? 10 + calculateAbilityModifier(abilityScores.dex),
    hp: { current: hpCurrent, max: hpMax, temp: blueprint.hp?.temp },
    abilityScores,
    savingThrows: blueprint.savingThrows,
    skills: blueprint.skills,
    attacks: blueprint.attacks ?? [],
    features: blueprint.features ?? [],
    traits: blueprint.traits ?? [],
    proficiencies: blueprint.proficiencies,
  };
}

export function createBlankCharacter(): DnD5eCharacter {
  return buildCharacter({
    name: 'New Hero',
    role: 'pc',
    className: 'Fighter',
    level: 1,
    abilityScores: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
    ac: 16,
    hp: { max: 12 },
    inventory: {
      weapons: [
        { name: 'Longsword', proficient: true },
        { name: 'Shortbow', proficient: true },
      ],
    },
    skills: {
      athletics: { proficient: true },
      perception: { proficient: true },
      intimidation: { proficient: true },
    },
    features: ['Second Wind (1/Short Rest)', 'Fighting Style: Defense'],
    traits: ['Darkvision 60 ft'],
    proficiencies: {
      armor: ['All armor', 'Shields'],
      weapons: ['Simple weapons', 'Martial weapons'],
      tools: [],
      languages: ['Common'],
    },
  });
}


