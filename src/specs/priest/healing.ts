// Priest healers for WoW Forever: Holy (Greater Heal and Flash Heal, Renew,
// Prayer of Mending, Binding Heal, Prayer of Healing, Spiritual Guidance)
// and Discipline (Power Word: Shield with Soul Warding and Renewed Hope,
// Penance, Divine Aegis, Power Infusion). Numbers in ./data.ts; sources in
// research/healing_forever.md.
import type { Combat } from '../../engine/combat';
import type { Ability, Spec, Unit } from '../../engine/types';
import { BOSS_RULES, CONTROLS } from '../common';
import {
  HEALER_SHEET, HEALER_START, HELP_HEALING, MANA_OPTIONS, addShield, between, directHeal, healCritChance, healingReview, healthPct,
  heal, hintParts, hot, nobodyHurt, note, partyHeal, partyOf, spendFocus, tankUptime, type HealHint, type Row,
} from '../healing';
import { D, SOURCES, T, regen } from './core';
import { HEALER_STATS } from './data';
import { buildLabel, buildsFor, summary, talentsFor, type PriestSpec } from './talents';

const pctOf = (n: number) => `${Math.round(n * 100)}%`;
const innerFocus = (c: Combat) => !!c.aura(c.player, 'innerFocus');
const weakenedSoul = (c: Combat, u: Unit) => c.aura(u, 'weakenedSoul');

// ------------------------------------------------------------------- mana
/** Mental Agility: instants cost 3/7/10 % less; Improved Healing: Greater Heal, Penance and Prayer of Mending 5 % per point less. */
const agility = (c: Combat) => 1 - [0, 0.03, 0.07, 0.1][T(c).mentalAgility];
const improvedHealing = (c: Combat) => 1 - 0.05 * T(c).improvedHealing;
const cost = (base: number, mult: (c: Combat) => number = () => 1) => (c: Combat) => (innerFocus(c) ? 0 : Math.round(base * mult(c)));
/** Litany of Light: a heal that differs from the last one gives back 5/10 % of its base cost. */
const litany = new WeakMap<Combat, string>();
function litanyOfLight(c: Combat, id: string, baseCost: number): void {
  const rank = T(c).litanyOfLight;
  const last = litany.get(c);
  litany.set(c, id);
  if (!rank || !last || last === id) return;
  const n = Math.round(baseCost * D.litanyOfLight[rank]);
  c.gainMana(n);
  c.count('litanyMana', n);
}

// ---------------------------------------------------------------- effects
/** Renewed Hope: +2 % crit per point on direct heals of a target under Weakened Soul, and each such heal shortens the Weakened Soul by 1 s per point. */
function renewedHope(c: Combat, u: Unit): number {
  const rank = T(c).renewedHope;
  const ws = weakenedSoul(c, u);
  if (!rank || !ws) return 0;
  c.setAuraEnd(u, 'weakenedSoul', Math.max(c.t, ws.end - rank));
  return 2 * rank;
}

/** A non-periodic crit: Divine Aegis shields 5/10/15 % of it (up to 20 x your level); Inspiration gives the target armor for 15 s. */
function onDirectHeal(c: Combat, u: Unit, amount: number, crit: boolean): void {
  if (!crit) return;
  const tl = T(c);
  if (tl.divineAegis) {
    addShield(c, u, 'divineAegis', 'Divine Aegis', 'divineAegis', amount * 0.05 * tl.divineAegis, D.divineAegis.duration, D.divineAegis.capPerLevel * 60);
    c.count('divineAegis');
  }
  if (tl.inspiration) c.applyAura(u, { id: 'inspiration', name: 'Inspiration', icon: 'inspiration', duration: D.inspiration.duration });
}

/** A direct heal with the priest's procs: Inner Focus's crit, Renewed Hope, Divine Aegis, Inspiration, Litany of Light. */
function priestHeal(c: Combat, u: Unit, id: string, base: number, variance: number, coeff: number, baseCost: number, opts: { focus?: boolean; mult?: number } = {}): void {
  const extra = (opts.focus === false ? 0 : spendFocus(c, 'innerFocus', D.innerFocus.crit)) + renewedHope(c, u);
  const h = directHeal(c, u, { id, school: 'holy', base, variance, coeff, extraCrit: extra, mult: opts.mult });
  onDirectHeal(c, u, h.amount, h.crit);
  litanyOfLight(c, id, baseCost);
}

const talent = (key: 'penance' | 'bindingHeal' | 'prayerOfMending' | 'holyNova' | 'innerFocus' | 'powerInfusion', name: string) => ({
  requirements: (c: Combat) => (T(c)[key] ? null : `Requires the ${name} talent`),
  usable: (c: Combat) => T(c)[key] > 0,
});

// -------------------------------------------------------------- abilities
const ABILITIES: Ability[] = [
  heal({
    id: 'flashHeal', name: 'Flash Heal', icon: 'flashHeal',
    cost: cost(D.flashHeal.mana),
    castTime: (c) => D.flashHeal.cast / c.castHaste(),
    description: () => `A ${D.flashHeal.cast} sec cast: heals for ${D.flashHeal.base}-${Math.round(D.flashHeal.base * (1 + D.flashHeal.variance))} plus ${Math.round(D.flashHeal.coeff * 100)}% of your healing power. The quick heal: more mana per point of healing than Greater Heal.`,
    use: (c, t) => priestHeal(c, t!, 'flashHeal', D.flashHeal.base, D.flashHeal.variance, D.flashHeal.coeff, D.flashHeal.mana),
  }),
  heal({
    id: 'greaterHeal', name: 'Greater Heal', icon: 'greaterHeal',
    cost: cost(D.greaterHeal.mana, improvedHealing),
    castTime: (c) => (D.greaterHeal.cast - 0.1 * T(c).divineFury) / c.castHaste(),
    description: (c) => `A ${(D.greaterHeal.cast - 0.1 * T(c).divineFury).toFixed(1)} sec cast: heals for ${D.greaterHeal.base}-${Math.round(D.greaterHeal.base * (1 + D.greaterHeal.variance))} plus ${Math.round(D.greaterHeal.coeff * 100)}% of your healing power. Your big, efficient heal: start it early on the tank.`,
    use: (c, t) => priestHeal(c, t!, 'greaterHeal', D.greaterHeal.base, D.greaterHeal.variance, D.greaterHeal.coeff, D.greaterHeal.mana),
  }),
  heal({
    id: 'renew', name: 'Renew', icon: 'renew',
    cost: cost(D.renew.mana, agility),
    description: (c) => `Instant: ${D.renew.ticks} ticks of ${D.renew.tick} plus ${Math.round(D.renew.coeff * 100)}% of your healing power every ${D.renew.period} sec (${D.renew.ticks * D.renew.period} sec).${T(c).improvedRenew ? ` Improved Renew: +${5 * T(c).improvedRenew}%.` : ''} Recasting restarts it: recast after the last tick.`,
    use: (c, t) => {
      spendFocus(c, 'innerFocus', 0);
      hot(c, t!, { id: 'renew', name: 'Renew', school: 'holy', ticks: D.renew.ticks, period: D.renew.period, canCrit: true, tick: (cc) => D.renew.tick + D.renew.coeff * (cc.spellPowerFor('holy') + cc.mod.healingPower) });
      litanyOfLight(c, 'renew', D.renew.mana);
    },
  }),
  heal({
    id: 'prayerOfHealing', name: 'Prayer of Healing', icon: 'prayerOfHealing',
    cost: cost(D.prayerOfHealing.mana),
    castTime: (c) => D.prayerOfHealing.cast / c.castHaste(),
    description: () => `A ${D.prayerOfHealing.cast} sec cast: heals every party member for ${D.prayerOfHealing.base}-${Math.round(D.prayerOfHealing.base * (1 + D.prayerOfHealing.variance))} plus ${Math.round(D.prayerOfHealing.coeff * 100)}% of your healing power. For damage on the whole party.`,
    use: (c, t) => {
      const extra = spendFocus(c, 'innerFocus', D.innerFocus.crit);
      for (const u of partyOf(c, t!)) {
        const h = directHeal(c, u, { id: 'prayerOfHealing', school: 'holy', base: D.prayerOfHealing.base, variance: D.prayerOfHealing.variance, coeff: D.prayerOfHealing.coeff, extraCrit: extra + renewedHope(c, u) });
        onDirectHeal(c, u, h.amount, h.crit);
      }
      litanyOfLight(c, 'prayerOfHealing', D.prayerOfHealing.mana);
    },
  }),
  heal({
    id: 'prayerOfMending', name: 'Prayer of Mending', icon: 'prayerOfMending',
    cost: cost(D.prayerOfMending.mana, (c) => improvedHealing(c) * agility(c)),
    cooldown: D.prayerOfMending.cooldown,
    ...talent('prayerOfMending', 'Prayer of Mending'),
    description: () => `Instant: the next time the target is hurt they heal for ${D.prayerOfMending.base} plus ${Math.round(D.prayerOfMending.coeff * 100)}% of your healing power, and the prayer jumps to another party member, up to ${D.prayerOfMending.jumps} times (${D.prayerOfMending.duration} sec each). Put it on the tank before the blows. ${D.prayerOfMending.cooldown} sec cooldown.`,
    use: (c, t) => {
      spendFocus(c, 'innerFocus', 0);
      for (const u of c.partyUnits()) c.removeAura(u, 'prayerOfMending');
      placeMending(c, t!, D.prayerOfMending.jumps);
      litanyOfLight(c, 'prayerOfMending', D.prayerOfMending.mana);
    },
  }),
  heal({
    id: 'bindingHeal', name: 'Binding Heal', icon: 'bindingHeal',
    cost: cost(D.bindingHeal.mana),
    castTime: (c) => D.bindingHeal.cast / c.castHaste(),
    ...talent('bindingHeal', 'Binding Heal'),
    description: () => `A ${D.bindingHeal.cast} sec cast: heals the target and you for ${D.bindingHeal.base}-${Math.round(D.bindingHeal.base * (1 + D.bindingHeal.variance))} plus ${Math.round(D.bindingHeal.coeff * 100)}% of your healing power each. Low threat. When you are hurt too.`,
    use: (c, t) => {
      const u = t!;
      const extra = spendFocus(c, 'innerFocus', D.innerFocus.crit);
      for (const x of u === c.self ? [u] : [u, c.self]) {
        const h = directHeal(c, x, { id: 'bindingHeal', school: 'holy', base: D.bindingHeal.base, variance: D.bindingHeal.variance, coeff: D.bindingHeal.coeff, extraCrit: extra + renewedHope(c, x) });
        onDirectHeal(c, x, h.amount, h.crit);
      }
      litanyOfLight(c, 'bindingHeal', D.bindingHeal.mana);
    },
  }),
  heal({
    id: 'powerWordShield', name: 'Power Word: Shield', icon: 'powerWordShield',
    cost: cost(D.powerWordShield.mana, (c) => agility(c) * (T(c).soulWarding ? 0.85 : 1)),
    cooldown: (c) => D.powerWordShield.cooldown - (T(c).soulWarding ? 4 : 0),
    requirements: (c) => (weakenedSoul(c, c.friendTarget()) ? 'The target has Weakened Soul' : null),
    highlight: (c) => !weakenedSoul(c, c.tank()) && c.partyDamage.on,
    description: (c) => `Instant: a shield that absorbs ${Math.round(D.powerWordShield.absorb * (1 + [0, 0.07, 0.14, 0.2][T(c).improvedPowerWordShield]))} plus ${Math.round(D.powerWordShield.coeff * 100)}% of your healing power for ${D.powerWordShield.duration} sec. The target cannot be shielded again for ${D.powerWordShield.weakenedSoul} sec (Weakened Soul). ${T(c).soulWarding ? 'Soul Warding: no cooldown and 15% cheaper. ' : `${D.powerWordShield.cooldown} sec cooldown. `}Never overheals.`,
    use: (c, t) => {
      const u = t!;
      spendFocus(c, 'innerFocus', 0);
      const amount = (D.powerWordShield.absorb + D.powerWordShield.coeff * (c.spellPowerFor('holy') + c.mod.healingPower)) * (1 + [0, 0.07, 0.14, 0.2][T(c).improvedPowerWordShield]) * (c.mod.healingFor.powerWordShield ?? 1);
      c.applyAura(u, { id: 'powerWordShield', name: 'Power Word: Shield', icon: 'powerWordShield', duration: D.powerWordShield.duration, absorb: Math.round(amount) });
      c.applyAura(u, { id: 'weakenedSoul', name: 'Weakened Soul', icon: 'weakenedSoul', duration: D.powerWordShield.weakenedSoul });
      c.heal({ target: u, source: 'powerWordShield', amount: Math.round(amount), crit: false, school: 'holy', shield: true });
    },
  }),
  {
    ...heal({
      id: 'penance', name: 'Penance', icon: 'penance', range: D.penanceHeal.range,
      cost: cost(D.penanceHeal.mana, improvedHealing),
      cooldown: D.penanceHeal.cooldown,
      description: () => `A ${D.penanceHeal.duration} sec channel: ${D.penanceHeal.bolts} bolts of ${D.penanceHeal.heal} plus ${Math.round(D.penanceHeal.coeff * 100)}% of your healing power at 0, 1 and 2 sec, each with its own crit roll. ${D.penanceHeal.cooldown} sec cooldown. Discipline's quick, cheap tank heal.`,
      use: () => {},
    }),
    ...talent('penance', 'Penance'),
    channel: {
      duration: D.penanceHeal.duration, ticks: D.penanceHeal.bolts, tickAtStart: true,
      onStart: (c) => {
        const crit = spendFocus(c, 'innerFocus', D.innerFocus.crit);
        if (crit) c.applyAura(c.player, { id: 'penanceFocus', name: 'Inner Focus', icon: 'innerFocus', duration: D.penanceHeal.duration + 0.1, hidden: true });
        litanyOfLight(c, 'penance', D.penanceHeal.mana);
        return true;
      },
      onTick: (c, t) => {
        const u = t!;
        const extra = (c.aura(c.player, 'penanceFocus') ? D.innerFocus.crit : 0) + renewedHope(c, u);
        const h = directHeal(c, u, { id: 'penance', school: 'holy', base: D.penanceHeal.heal, coeff: D.penanceHeal.coeff, extraCrit: extra });
        onDirectHeal(c, u, h.amount, h.crit);
      },
    },
  },
  {
    id: 'holyNova', name: 'Holy Nova', icon: 'holyNova', gcd: D.gcd, target: 'self', hastedGcd: true, animation: 'cast',
    cost: cost(D.holyNova.mana, agility),
    ...talent('holyNova', 'Holy Nova'),
    description: () => `Instant: heals every party member within 10 yards of you for ${D.holyNovaHeal.base}-${Math.round(D.holyNovaHeal.base * (1 + D.holyNovaHeal.variance))} plus ${Math.round(D.holyNovaHeal.coeff * 100)}% of your healing power, and burns nearby enemies. No threat. Expensive.`,
    use: (c) => {
      spendFocus(c, 'innerFocus', 0);
      partyHeal(c, partyOf(c), { id: 'holyNova', school: 'holy', base: D.holyNovaHeal.base, variance: D.holyNovaHeal.variance, coeff: D.holyNovaHeal.coeff });
      litanyOfLight(c, 'holyNova', D.holyNova.mana);
    },
  },
  {
    id: 'innerFocus', name: 'Inner Focus', icon: 'innerFocus', gcd: 0, target: 'self',
    cooldown: D.innerFocus.cooldown,
    ...talent('innerFocus', 'Inner Focus'),
    highlight: innerFocus,
    description: () => `Your next spell costs no mana and, if it is a direct heal, has ${D.innerFocus.crit}% more crit. Off the global cooldown: pair it with Greater Heal or Prayer of Healing.`,
    use: (c) => { c.applyAura(c.player, { id: 'innerFocus', name: 'Inner Focus', icon: 'innerFocus', duration: Infinity }); },
  },
  {
    id: 'powerInfusion', name: 'Power Infusion', icon: 'powerInfusion', gcd: 0, target: 'self',
    cost: () => D.powerInfusion.mana, cooldown: D.powerInfusion.cooldown,
    ...talent('powerInfusion', 'Power Infusion'),
    description: () => `+${Math.round((D.powerInfusion.damage - 1) * 100)}% healing for ${D.powerInfusion.duration} sec, on yourself. Off the global cooldown.`,
    use: (c) => { c.applyAura(c.player, { id: 'powerInfusion', name: 'Power Infusion', icon: 'powerInfusion', duration: D.powerInfusion.duration, healingDone: D.powerInfusion.damage }); },
  },
  {
    id: 'desperatePrayer', name: 'Desperate Prayer', icon: 'desperatePrayer', gcd: D.gcd, target: 'self', hastedGcd: true, animation: 'cast',
    cooldown: D.desperatePrayer.cooldown,
    description: () => `Instant: heals you for ${D.desperatePrayer.base}-${Math.round(D.desperatePrayer.base * (1 + D.desperatePrayer.variance))} plus ${Math.round(D.desperatePrayer.coeff * 100)}% of your healing power. Free. ${D.desperatePrayer.cooldown / 60} min cooldown.`,
    use: (c) => {
      const h = directHeal(c, c.self, { id: 'desperatePrayer', school: 'holy', base: D.desperatePrayer.base, variance: D.desperatePrayer.variance, coeff: D.desperatePrayer.coeff });
      onDirectHeal(c, c.self, h.amount, h.crit);
    },
  },
  {
    id: 'manaPotion', name: 'Major Mana Potion', icon: 'manaPotion', gcd: 0, target: 'self',
    cooldown: D.manaPotion.cooldown, cooldownGroup: 'potion',
    animation: 'drink',
    description: () => `Restores ${D.manaPotion.min} to ${D.manaPotion.max} mana.`,
    use: (c) => {
      const n = Math.round(between(c, D.manaPotion.min, D.manaPotion.max));
      c.gainMana(n);
      c.count('potionMana', n);
      note(c, `+${n} Mana`, 'resource');
    },
  },
];

/** Prayer of Mending: an aura that heals its bearer when they are hurt, then jumps to the most hurt other member. */
function placeMending(c: Combat, u: Unit, jumps: number): void {
  c.applyAura(u, {
    id: 'prayerOfMending', name: 'Prayer of Mending', icon: 'prayerOfMending', duration: D.prayerOfMending.duration, stacks: jumps,
    onDamageTaken: (cc, a) => {
      if (cc.aura(u, 'prayerOfMending') !== a) return;
      cc.removeAura(u, 'prayerOfMending');
      const h = directHeal(cc, u, { id: 'prayerOfMending', school: 'holy', base: D.prayerOfMending.base, coeff: D.prayerOfMending.coeff });
      onDirectHeal(cc, u, h.amount, h.crit);
      cc.count('mendingHeals');
      const left = (a.stacks ?? 1) - 1;
      const next = cc.lowestAlly({ not: u, minMissing: 0 }) ?? cc.partyAlive().find((x) => x !== u);
      if (left > 0 && next) placeMending(cc, next, left);
    },
  });
}

// ----------------------------------------------------------------- setup
function prepare(c: Combat): void {
  const t = T(c);
  const p = c.player;
  p.maxResource = Math.max(1, Number(c.options.mana ?? 4495));
  p.regenPerSecond = 0;
  c.manaLocked = !!c.options.lockMana;
  litany.delete(c);
  c.mod.healCrit = t.holySpecialization;
  c.mod.healingDone = 1 + D.spiritualHealing[t.spiritualHealing];
  c.mod.healingPower = Math.round(Number(c.options.spirit ?? D.spirit) * D.spiritualGuidance[t.spiritualGuidance]);
  // Twin Disciplines: +1 % per point to instant heals and shields; Improved Renew on top of it.
  const twin = 1 + 0.01 * t.twinDisciplines;
  c.mod.healingFor = {
    renew: twin * (1 + 0.05 * t.improvedRenew),
    powerWordShield: twin,
    prayerOfMending: twin,
    holyNova: twin,
  };
  c.trackedTankAuras.push('renew', 'powerWordShield', 'weakenedSoul', 'prayerOfMending');
}

function chances(c: Combat): { title: string; rows: [string, string][] }[] {
  const tl = T(c);
  const pct = (n: number) => `${Math.max(0, Math.min(100, n)).toFixed(1)}%`;
  const rows: [string, string][] = [
    ['Heal crit (Holy Specialization +' + tl.holySpecialization + '%)', pct(healCritChance(c, 'flashHeal'))],
    ['Crit heals', '1.5x'],
    ['Healing power', `${c.spellPowerFor('holy') + c.mod.healingPower}${tl.spiritualGuidance ? ` (Spiritual Guidance: +${c.mod.healingPower} from Spirit)` : ''}`],
  ];
  const procs: [string, string][] = [];
  if (tl.divineAegis) procs.push(['Divine Aegis per direct crit heal', `shield for ${5 * tl.divineAegis}% of it, up to ${D.divineAegis.capPerLevel * 60}, 12 s`]);
  if (tl.renewedHope) procs.push(['Renewed Hope on a target with Weakened Soul', `+${2 * tl.renewedHope}% crit; each heal shortens Weakened Soul by ${tl.renewedHope} s`]);
  if (tl.litanyOfLight) procs.push(['Litany of Light when your heal differs from the last', `${Math.round(D.litanyOfLight[tl.litanyOfLight] * 100)}% of its base cost back`]);
  if (c.raid.has('judgementOfWisdom')) procs.push(['Judgement of Wisdom', 'only your damage spells on the dummy: nothing for a healer']);
  return [
    { title: 'Your heals', rows },
    { title: 'Procs', rows: procs },
    {
      title: 'Rhythm',
      rows: [
        ['Global cooldown', '1.5 s, shorter with casting haste (1.0 s floor)'],
        ['Greater Heal cast', `${(D.greaterHeal.cast - 0.1 * tl.divineFury).toFixed(1)} s`],
        ['Mana regeneration now', `${regen(c).toFixed(1)} per second (Spirit stops 5 s after you spend mana${tl.meditation ? `; Meditation keeps ${[0, 17, 33, 50][tl.meditation]}%` : ''})`],
      ],
    },
  ];
}

// ------------------------------------------------------------------ hints
const hints = new WeakMap<Combat, { t: number; hint: HealHint | null }>();
function hint(c: Combat, spec: PriestSpec): HealHint | null {
  const cached = hints.get(c);
  if (cached && cached.t === c.t) return cached.hint;
  const h = computeHint(c, spec);
  hints.set(c, { t: c.t, hint: h });
  return h;
}

/** Whom to heal with what: the most hurt member first; the tank gets the big heals and the shield; group damage gets the prayer. */
function computeHint(c: Combat, spec: PriestSpec): HealHint | null {
  if (!c.partyDamage.on || c.channeling) return null;
  const tl = T(c);
  const p = c.player;
  const ready = (id: string) => c.cooldownLeft(id).left === 0 && (c.ability(id)?.usable?.(c) ?? true);
  const afford = (id: string) => c.cost(c.ability(id)!) <= p.resource;
  const tank = c.tank();
  const low = c.lowestAlly({ minMissing: 1 });
  const hurt = c.partyAlive().filter((u) => healthPct(u) < 0.8);
  const mana = c.manaLocked ? 1 : p.resource / p.maxResource;
  if (!c.manaLocked && p.inCombat && mana < 0.3 && ready('manaPotion')) return { id: 'manaPotion', target: c.self };
  // Discipline keeps the shield on the tank; Holy puts the prayer on them.
  if (spec === 'disc' && tank.health > 0 && !weakenedSoul(c, tank) && ready('powerWordShield') && afford('powerWordShield')) return { id: 'powerWordShield', target: tank };
  if (low && healthPct(low) < 0.35 && afford('flashHeal')) {
    if (spec === 'disc' && ready('penance') && afford('penance')) return { id: 'penance', target: low };
    return { id: 'flashHeal', target: low };
  }
  if (tl.prayerOfMending && tank.health > 0 && ready('prayerOfMending') && afford('prayerOfMending') && !c.partyUnits().some((u) => c.aura(u, 'prayerOfMending'))) return { id: 'prayerOfMending', target: tank };
  if (hurt.length >= 3 && afford('prayerOfHealing')) {
    if (tl.innerFocus && ready('innerFocus') && p.inCombat) return { id: 'innerFocus', target: c.self };
    return { id: 'prayerOfHealing', target: hurt[0] };
  }
  if (tank.health > 0 && healthPct(tank) < 0.7 && afford('greaterHeal')) {
    if (spec === 'disc' && ready('penance') && afford('penance')) return { id: 'penance', target: tank };
    return { id: 'greaterHeal', target: tank };
  }
  if (tank.health > 0 && !c.aura(tank, 'renew') && c.missing(tank) > 0 && afford('renew')) return { id: 'renew', target: tank };
  if (low && healthPct(low) < 0.75) {
    if (tl.bindingHeal && low !== c.self && healthPct(c.self) < 0.75 && afford('bindingHeal')) return { id: 'bindingHeal', target: low };
    if (afford('flashHeal')) return { id: 'flashHeal', target: low };
  }
  if (nobodyHurt(c)) return null;
  if (low && !c.aura(low, 'renew') && afford('renew')) return { id: 'renew', target: low };
  return null;
}

function review(c: Combat, spec: PriestSpec): Row[] {
  const time = c.counters.combatTime ?? 0;
  if (time < 1) return [];
  const rows: Row[] = [];
  if (spec === 'disc') rows.push({ label: 'Shield on the tank', value: pctOf(tankUptime(c, 'powerWordShield')), good: tankUptime(c, 'powerWordShield') >= 0.6 });
  rows.push({ label: 'Renew on the tank', value: pctOf(tankUptime(c, 'renew')), good: tankUptime(c, 'renew') >= 0.7 });
  if (T(c).prayerOfMending) rows.push({ label: 'Prayer of Mending heals', value: String(c.counters.mendingHeals ?? 0) });
  if (T(c).divineAegis) rows.push({ label: 'Divine Aegis shields', value: String(c.counters.divineAegis ?? 0) });
  return [...rows, ...healingReview(c, spec === 'disc' ? 'flashHeal' : 'greaterHeal')];
}

// ------------------------------------------------------------------ specs
function specFor(spec: PriestSpec, base: Pick<Spec, 'id' | 'specName' | 'welcome' | 'help' | 'look' | 'defaultOptions'>): Spec {
  return {
    className: 'Priest',
    resource: 'mana',
    healer: true,
    partyDamage: 600,
    showHealth: true,
    startDistance: HEALER_START,
    abilities: ABILITIES,
    stats: HEALER_STATS,
    rules: BOSS_RULES,
    builds: buildsFor(spec).map((b) => ({ id: b.id, label: buildLabel(b), name: b.name, source: b.source, talentString: b.talentString, stats: b.stats, bar: b.bar, trees: summary(talentsFor(b.id, spec)) })),
    bar: buildsFor(spec)[0].bar,
    sources: SOURCES,
    defaultRaid: ['blessingOfWisdom', 'manaSpring'],
    options: MANA_OPTIONS,
    sheet: HEALER_SHEET,
    lowMana: (c) => c.cost(c.ability(spec === 'disc' ? 'flashHeal' : 'greaterHeal')!),
    prepare,
    chances,
    regen,
    suggest: (c) => hintParts(hint(c, spec), c).suggest,
    cue: (c) => hintParts(hint(c, spec), c).cue,
    review: (c) => review(c, spec),
    ...base,
  };
}

const HELP = `${CONTROLS}
    ${HELP_HEALING}`;

export const priestHoly: Spec = specFor('holy', {
  id: 'priest-holy',
  specName: 'Holy',
  defaultOptions: { build: 'holy', mana: 4495, spirit: D.spirit, mp5: D.mp5, lockMana: false },
  welcome: 'Welcome to the Holy practice yard. Keep Renew and Prayer of Mending on the tank, Greater Heal when the blows add up, Flash Heal when someone drops fast, Binding Heal when you are hurt too, Prayer of Healing when the whole party is. Overhealing shows in the panel: let the heals land where they are needed.',
  help: `${HELP}
    Holy in WoW Forever: Spiritual Guidance turns 25% of your Spirit into healing power, Spiritual Healing adds 10%, Litany of Light gives mana back when you alternate heals, Prayer of Mending (31 points) heals the next five party members the dummy hurts, Binding Heal heals the target and you. Renew and Prayer of Mending are instant; Greater Heal is 2.5 sec with Divine Fury. Inner Focus makes a heal free and crit more often.
    The yellow glow and the cue above the bar are our priority list (no sim has a healer list yet): a party member under 35% gets Flash Heal, Prayer of Mending goes on the tank when it is free, three or more hurt get Prayer of Healing, the tank under 70% gets Greater Heal, then Renew on the tank and Flash Heal on whoever is lowest.
    This is a practice tool: crit chances follow WoW Forever; healing numbers are an approximation.`,
  look: { clothColor: 0xf0e8d8, leatherColor: 0xc8a850, hood: false, robe: true },
});

export const priestDisc: Spec = specFor('disc', {
  id: 'priest-disc',
  specName: 'Discipline',
  defaultOptions: { build: 'disc', mana: 4495, spirit: D.spirit, mp5: D.mp5, lockMana: false },
  welcome: 'Welcome to the Discipline practice yard. Keep Power Word: Shield on the tank (Soul Warding takes its cooldown away), Penance when the tank is hurt, Flash Heal on whoever drops, Renew on the tank, and Power Infusion when the damage comes in. Crit heals shield the target with Divine Aegis; Renewed Hope makes heals on a shielded target crit more.',
  help: `${HELP}
    Discipline in WoW Forever: Power Word: Shield absorbs about 1,100 and Weakened Soul lasts 15 sec; Soul Warding removes its cooldown and makes it cheaper; Renewed Hope gives your direct heals +10% crit on a target with Weakened Soul and shortens it. Penance (21 points) fires three healing bolts at 0, 1 and 2 sec. Divine Aegis shields the target for 15% of each direct crit heal (up to 1,200). Power Infusion is +20% healing for 15 sec.
    The yellow glow and the cue above the bar are our priority list (no sim has a healer list yet): shield the tank when they can be shielded, Penance or Flash Heal whoever is under 35%, Prayer of Healing when three or more are hurt, Penance or Greater Heal on the tank under 70%, then Renew and Flash Heal.
    This is a practice tool: crit chances follow WoW Forever; healing numbers are an approximation.`,
  look: { clothColor: 0xe8e0d0, leatherColor: 0x8060a0, hood: false, robe: true },
});
