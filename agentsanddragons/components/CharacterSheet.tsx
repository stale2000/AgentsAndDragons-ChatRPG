'use client';

import * as React from 'react';
import { DnD5eCharacter, AbilityKey, calculateAbilityModifier, calculateProficiencyBonus, getAttackToHit, getSkillBonus, SKILL_ABILITY, getAllAttacks } from '@/utils/dnd5e';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WEAPONS } from '@/data/dnd5e/items';
import { makeRoll } from '@/app/actions/rolls_action';

type Props = {
  character: DnD5eCharacter;
  onUpdate?: (updated: DnD5eCharacter) => void;
  clientId?: string;
  speakerUuid?: string;
};

export default function CharacterSheet({ character, onUpdate, clientId, speakerUuid }: Props) {
  const pb = calculateProficiencyBonus(character.level);

  const weaponLookup = React.useMemo(() => {
    const map = new Map<string, { name: string; damage: string; damageType?: string; properties?: string[]; range?: { normal: number; long?: number }; versatileDamage?: string }>();
    for (const w of WEAPONS) {
      map.set(w.name, { name: w.name, damage: w.damage, damageType: w.damageType, properties: w.properties, range: w.range, versatileDamage: w.versatileDamage });
    }
    return (name: string) => map.get(name);
  }, []);

  const updateHp = (delta: number) => {
    const next = { ...character, hp: { ...character.hp, current: Math.max(0, Math.min(character.hp.current + delta, character.hp.max)) } };
    onUpdate?.(next);
  };

  const abilityBlock = (label: string, key: AbilityKey) => {
    const score = character.abilityScores[key] ?? 10;
    const mod = calculateAbilityModifier(score);
    return (
      <div className="text-center rounded border p-3 bg-background">
        <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{score}</div>
        <div className="text-xs text-muted-foreground">{mod >= 0 ? `+${mod}` : mod}</div>
      </div>
    );
  };

  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{character.name}</span>
          <span className="text-sm font-normal text-muted-foreground">Level {character.level} {character.className}</span>
        </CardTitle>
        <CardDescription>
          AC {character.ac} • Speed {character.speed} ft • Prof +{pb}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* HP */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Hit Points</span>
            <span>{character.hp.current}{character.hp.temp ? ` (+${character.hp.temp})` : ''} / {character.hp.max}</span>
          </div>
          <div className="relative h-5 rounded bg-muted overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-green-500" style={{ width: `${(character.hp.current / character.hp.max) * 100}%` }} />
            {character.hp.temp ? (
              <div className="absolute inset-y-0 left-0 bg-cyan-500/70" style={{ width: `${(Math.min(character.hp.current + character.hp.temp, character.hp.max) / character.hp.max) * 100}%` }} />
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => updateHp(-5)}>-5</Button>
            <Button size="sm" variant="outline" onClick={() => updateHp(-1)}>-1</Button>
            <Button size="sm" variant="outline" onClick={() => updateHp(+1)}>+1</Button>
            <Button size="sm" variant="outline" onClick={() => updateHp(+5)}>+5</Button>
          </div>
        </div>

        {/* Abilities */}
        <div className="grid grid-cols-6 gap-2">
          {abilityBlock('STR', 'str')}
          {abilityBlock('DEX', 'dex')}
          {abilityBlock('CON', 'con')}
          {abilityBlock('INT', 'int')}
          {abilityBlock('WIS', 'wis')}
          {abilityBlock('CHA', 'cha')}
        </div>

        {/* Attacks (manual + equipped weapons) */}
        {(() => {
          const attacks = getAllAttacks(character, weaponLookup);
          return attacks && attacks.length > 0 ? (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Attacks</div>
            <div className="space-y-2">
              {attacks.map((atk, idx) => (
                <div key={idx} className="rounded border p-2 text-sm bg-background">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{atk.name}</div>
                    <div className="font-mono">+{getAttackToHit(character, atk)} to hit</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {atk.damage}{atk.damageType ? ` ${atk.damageType}` : ''}{atk.range ? ` • ${atk.range}` : ''}
                  </div>
                  {clientId ? (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" onClick={async () => {
                        const toHit = getAttackToHit(character, atk);
                        await makeRoll({ clientId, formula: `1d20${toHit >= 0 ? '+' : ''}${toHit}`, flavor: `${character.name} - ${atk.name} (Attack Roll)`, speaker: speakerUuid });
                      }}>Roll Attack</Button>
                      <Button size="sm" variant="outline" onClick={async () => {
                        await makeRoll({ clientId, formula: atk.damage, flavor: `${character.name} - ${atk.name} (Damage)`, speaker: speakerUuid });
                      }}>Roll Damage</Button>
                    </div>
                  ) : null}
                  {atk.description && (
                    <div className="mt-1 text-xs text-muted-foreground">{atk.description}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
          ) : null;
        })()}

        {/* Skills */}
        <div className="space-y-2">
          <div className="text-sm font-semibold">Skills</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            {Object.entries(SKILL_ABILITY).map(([skill, ability]) => (
              <div key={skill} className="rounded border p-2 bg-background flex items-center justify-between">
                <span className="capitalize">{skill.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                <span className="font-mono">{(() => {
                  // @ts-ignore skill is SkillKey
                  const n = getSkillBonus(character, skill);
                  return n >= 0 ? `+${n}` : `${n}`;
                })()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Features & Traits */}
        {(character.features?.length || character.traits?.length) ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {!!character.features?.length && (
              <div className="space-y-1">
                <div className="text-sm font-semibold">Features</div>
                <ul className="list-disc list-inside text-sm text-muted-foreground">
                  {character.features.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
            )}
            {!!character.traits?.length && (
              <div className="space-y-1">
                <div className="text-sm font-semibold">Traits</div>
                <ul className="list-disc list-inside text-sm text-muted-foreground">
                  {character.traits.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}


