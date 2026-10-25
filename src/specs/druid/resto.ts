// Restoration for WoW Forever: Rejuvenation and Regrowth kept on the tank,
// Swiftmend to spend them, Healing Touch for the big hits, Wild Growth (31
// points) for the party, Tranquility, Nature's Swiftness and Innervate.
// Numbers in ./data.ts, builds in ./talents.ts; sources in
// research/healing_forever.md.
import type { Combat } from '../../engine/combat';
import type { Ability, Spec, Unit } from '../../engine/types';
import { BOSS_RULES } from '../common';
import {
  HEALER_SHEET, HEALER_START, HELP_HEALING, MANA_OPTIONS, directHeal, healCritChance, healingPower, healingReview, healthPct, heal, hintParts,
  hot, manaRegen, needs, nobodyHurt, partyHeal, partyOf, tankUptime, type HealHint, type Row,
} from '../healing';
import { RESTO_STATS } from './data';
import { CONTROLS, D, SOURCES, barkskin, manaPotion } from './shared';
import { buildById, buildLabel, buildsFor, summary, talentsFor, type Talents } from './talents';

const T = (c: Combat): Talents => talentsFor(c.options.build, 'resto', c.options.talents);
const pctOf = (n: number) => `${Math.round(n * 100)}%`;
const swift = (c: Combat) => !!c.aura(c.player, 'naturesSwiftness');
const spendSwift = (c: Combat) => { if (swift(c)) { c.removeAura(c.player, 'naturesSwiftness'); c.count('naturesSwiftnessUsed'); } };

// ------------------------------------------------------------------- mana
/** Living Spirit +5 % Spirit per point; Reflection keeps 17/33/50 % of the regeneration while casting; Innervate x5 and all of it. */
function regen(c: Combat): number {
  const t = T(c);
  return manaRegen(c, {
    spirit: Number(c.options.spirit ?? D.restoSpirit) * (1 + 0.05 * t.livingSpirit),
    mp5: Number(c.options.mp5 ?? D.restoMp5),
    casting: [0, 0.17, 0.33, 0.5][t.reflection],
    innervate: true,
  });
}
/** Tranquil Spirit: Healing Touch and Tranquility 2 % cheaper per point. */
const tranquil = (c: Combat) => 1 - 0.02 * T(c).tranquilSpirit;
/** Gift of the Earthmother: a 1.0 s global cooldown on Rejuvenation, Swiftmend and Wild Growth. */
const quickGcd = (c: Combat) => D.spellGcd - (T(c).giftOfTheEarthmother ? D.giftOfTheEarthmother : 0);
/** Nature's Splendor: Rejuvenation one tick longer, Regrowth two. */
const rejuvTicks = (c: Combat) => D.rejuvenation.ticks + T(c).naturesSplendor;
const regrowthTicks = (c: Combat) => D.regrowth.ticks + 2 * T(c).naturesSplendor;
const genesis = (c: Combat) => 1 + 0.01 * T(c).genesis;

// -------------------------------------------------------------- abilities
const rejuvTick = (c: Combat) => D.rejuvenation.tick + D.rejuvenation.coeff * healingPower(c, 'nature');
const regrowthTick = (c: Combat) => D.regrowth.tick + D.regrowth.tickCoeff * healingPower(c, 'nature');

function castRejuvenation(c: Combat, u: Unit): void {
  hot(c, u, { id: 'rejuvenation', name: 'Rejuvenation', school: 'nature', ticks: rejuvTicks(c), period: D.rejuvenation.period, tick: rejuvTick, periodicMult: genesis, canCrit: true });
}

const ABILITIES: Ability[] = [
  heal({
    id: 'healingTouch', name: 'Healing Touch', icon: 'healingTouch',
    cost: (c) => Math.round(D.healingTouch.mana * tranquil(c)),
    castTime: (c) => (swift(c) ? 0 : (D.healingTouch.cast - 0.1 * T(c).naturalist) / c.castHaste()),
    description: (c) => `A ${(D.healingTouch.cast - 0.1 * T(c).naturalist).toFixed(1)} sec cast: heals for ${D.healingTouch.base}-${Math.round(D.healingTouch.base * (1 + D.healingTouch.variance))} plus ${Math.round(D.healingTouch.coeff * 100)}% of your healing power. The big heal: with Nature's Swiftness it is instant.`,
    use: (c, t) => { spendSwift(c); directHeal(c, t!, { id: 'healingTouch', school: 'nature', base: D.healingTouch.base, variance: D.healingTouch.variance, coeff: D.healingTouch.coeff }); },
  }),
  heal({
    id: 'rejuvenation', name: 'Rejuvenation', icon: 'rejuvenation',
    gcdFor: quickGcd,
    cost: () => D.rejuvenation.mana,
    description: (c) => `Instant: ${rejuvTicks(c)} ticks of ${D.rejuvenation.tick} plus ${Math.round(D.rejuvenation.coeff * 100)}% of your healing power every ${D.rejuvenation.period} sec.${T(c).improvedRejuvenation ? ` Improved Rejuvenation: +${5 * T(c).improvedRejuvenation}%.` : ''} Keep it on the tank; Swiftmend can spend it. Recasting restarts it.`,
    use: (c, t) => castRejuvenation(c, t!),
  }),
  heal({
    id: 'regrowth', name: 'Regrowth', icon: 'regrowth',
    cost: () => D.regrowth.mana,
    castTime: (c) => (swift(c) ? 0 : D.regrowth.cast / c.castHaste()),
    description: (c) => `A ${D.regrowth.cast} sec cast: heals for ${D.regrowth.base}-${Math.round(D.regrowth.base * (1 + D.regrowth.variance))} plus ${Math.round(D.regrowth.coeff * 100)}% of your healing power, then ${regrowthTicks(c)} ticks of ${D.regrowth.tick} plus ${Math.round(D.regrowth.tickCoeff * 100)}% every ${D.regrowth.period} sec.${T(c).improvedRegrowth ? ` Improved Regrowth: +${10 * T(c).improvedRegrowth}% crit.` : ''} Swiftmend can spend its heal over time.`,
    use: (c, t) => {
      const u = t!;
      spendSwift(c);
      directHeal(c, u, { id: 'regrowth', school: 'nature', base: D.regrowth.base, variance: D.regrowth.variance, coeff: D.regrowth.coeff });
      hot(c, u, { id: 'regrowthHot', name: 'Regrowth', icon: 'regrowth', school: 'nature', ticks: regrowthTicks(c), period: D.regrowth.period, tick: regrowthTick, periodicMult: genesis, canCrit: true });
    },
  }),
  heal({
    id: 'swiftmend', name: 'Swiftmend', icon: 'swiftmend',
    gcdFor: quickGcd,
    cost: () => Math.round(1244 * D.swiftmend.manaPct),
    cooldown: D.swiftmend.cooldown,
    ...needs((c) => T(c).swiftmend > 0, 'Swiftmend'),
    requirements: (c) => (!T(c).swiftmend ? 'Requires the Swiftmend talent' : c.aura(c.friendTarget(), 'rejuvenation') || c.aura(c.friendTarget(), 'regrowthHot') ? null : 'The target needs your Rejuvenation or Regrowth'),
    highlight: (c) => c.cooldownLeft('swiftmend').left === 0 && !!(c.aura(c.friendTarget(), 'rejuvenation') || c.aura(c.friendTarget(), 'regrowthHot')) && c.missing(c.friendTarget()) > 800,
    description: (c) => `Instant: spends your Regrowth (first) or Rejuvenation on the target and heals at once for the full duration of its ticks (Regrowth ${regrowthTicks(c)} ticks, Rejuvenation ${rejuvTicks(c)}). ${D.swiftmend.cooldown} sec cooldown. Your emergency heal.`,
    use: (c, t) => {
      const u = t!;
      const regrowth = c.aura(u, 'regrowthHot');
      const id = regrowth ? 'regrowthHot' : 'rejuvenation';
      const ticks = regrowth ? regrowthTicks(c) : rejuvTicks(c);
      const tick = (regrowth ? regrowthTick(c) : rejuvTick(c)) * (c.mod.healingFor[id] ?? 1) * genesis(c);
      c.removeAura(u, id);
      directHeal(c, u, { id: 'swiftmend', school: 'nature', base: tick * ticks, coeff: 0 });
      c.count('swiftmends');
    },
  }),
  heal({
    id: 'wildGrowth', name: 'Wild Growth', icon: 'wildGrowth',
    gcdFor: quickGcd,
    cost: () => D.wildGrowth.mana,
    cooldown: D.wildGrowth.cooldown,
    ...needs((c) => T(c).wildGrowth > 0, 'Wild Growth'),
    description: () => `Instant: heals the target's party for ${D.wildGrowth.tick * D.wildGrowth.ticks} plus ${Math.round(D.wildGrowth.coeff * D.wildGrowth.ticks * 100)}% of your healing power over ${D.wildGrowth.ticks} sec, more at first and less at the end. ${D.wildGrowth.cooldown} sec cooldown. For damage on the whole party.`,
    use: (c, t) => {
      for (const u of partyOf(c, t!)) {
        hot(c, u, {
          id: 'wildGrowth', name: 'Wild Growth', school: 'nature', ticks: D.wildGrowth.ticks, period: D.wildGrowth.period, periodicMult: genesis, canCrit: true,
          tick: (cc) => D.wildGrowth.tick + D.wildGrowth.coeff * healingPower(cc, 'nature'),
          // Front-loaded: the first tick 1.4x, the last 0.6x, the same total.
          shape: (n, ticks) => 1.4 - 0.8 * ((n - 1) / (ticks - 1)),
        });
      }
    },
  }),
  {
    id: 'tranquility', name: 'Tranquility', icon: 'tranquility', gcd: D.spellGcd, target: 'self', hastedGcd: true, animation: 'cast',
    cost: (c) => Math.round(D.tranquility.mana * tranquil(c)),
    cooldown: (c) => Math.round(D.tranquility.cooldown * (1 - [0, 0.3, 0.6][T(c).improvedTranquility])),
    description: (c) => `A ${D.tranquility.duration} sec channel: ${D.tranquility.ticks} ticks of ${D.tranquility.tick} plus ${Math.round(D.tranquility.coeff * 100)}% of your healing power on every party member, every 2 sec. ${Math.round(D.tranquility.cooldown * (1 - [0, 0.3, 0.6][T(c).improvedTranquility]) / 60 * 10) / 10} min cooldown. With Nature's Swiftness it still channels.`,
    use: () => {},
    channel: {
      duration: D.tranquility.duration, ticks: D.tranquility.ticks,
      onTick: (c) => partyHeal(c, partyOf(c), { id: 'tranquility', school: 'nature', base: D.tranquility.tick, coeff: D.tranquility.coeff, mult: genesis(c) }),
    },
  },
  {
    id: 'naturesSwiftness', name: "Nature's Swiftness", icon: 'naturesSwiftness', gcd: 0, target: 'self',
    cooldown: D.naturesSwiftness.cooldown,
    ...needs((c) => T(c).naturesSwiftness > 0, "Nature's Swiftness"),
    highlight: swift,
    description: () => `Your next Healing Touch or Regrowth is instant. Off the global cooldown: press it and the heal in the same breath. ${D.naturesSwiftness.cooldown / 60} min cooldown.`,
    use: (c) => { c.applyAura(c.player, { id: 'naturesSwiftness', name: "Nature's Swiftness", icon: 'naturesSwiftness', duration: Infinity }); },
  },
  {
    id: 'innervate', name: 'Innervate', icon: 'innervate', gcd: D.spellGcd, target: 'self', hastedGcd: true, animation: 'cast',
    cost: () => D.innervate.mana, cooldown: D.innervate.cooldown,
    description: () => `For ${D.innervate.duration} sec your Spirit regeneration is 5 times faster and continues fully while casting. ${D.innervate.cooldown / 60} min cooldown.`,
    use: (c) => { c.applyAura(c.player, { id: 'innervate', name: 'Innervate', icon: 'innervate', duration: D.innervate.duration }); },
  },
  barkskin(D.spellGcd),
  manaPotion,
];

// ----------------------------------------------------------------- setup
function prepare(c: Combat): void {
  const t = T(c);
  const p = c.player;
  p.maxResource = Math.max(1, Number(c.options.mana ?? 4024));
  p.regenPerSecond = 0;
  c.manaLocked = !!c.options.lockMana;
  c.mod.spellCrit = 2 * t.naturesMajesty;
  c.mod.healingDone = 1 + 0.02 * t.giftOfNature;
  c.mod.healingFor = { rejuvenation: 1 + 0.05 * t.improvedRejuvenation };
  c.mod.healCritFor = { regrowth: 10 * t.improvedRegrowth };
  c.trackedTankAuras.push('rejuvenation', 'regrowthHot');
  c.trackedAuras.push('innervate');
}

// ------------------------------------------------------------------ hints
const hints = new WeakMap<Combat, { t: number; hint: HealHint | null }>();
function hint(c: Combat): HealHint | null {
  const cached = hints.get(c);
  if (cached && cached.t === c.t) return cached.hint;
  const h = computeHint(c);
  hints.set(c, { t: c.t, hint: h });
  return h;
}

/** Our priority list (no sim has one): Swiftmend or an instant Healing Touch for whoever is about to die, Rejuvenation and Regrowth on the tank, Wild Growth for the party, Healing Touch for the big hits. */
function computeHint(c: Combat): HealHint | null {
  if (!c.partyDamage.on || c.channeling) return null;
  const tl = T(c);
  const p = c.player;
  const ready = (id: string) => c.cooldownLeft(id).left === 0 && (c.ability(id)?.usable?.(c) ?? true);
  const afford = (id: string) => c.cost(c.ability(id)!) <= p.resource;
  const tank = c.tank();
  const low = c.lowestAlly({ minMissing: 1 });
  const hurt = c.partyAlive().filter((u) => healthPct(u) < 0.8);
  const mana = c.manaLocked ? 1 : p.resource / p.maxResource;
  const hotOn = (u: Unit) => !!(c.aura(u, 'rejuvenation') || c.aura(u, 'regrowthHot'));
  if (!c.manaLocked && p.inCombat) {
    if (mana < 0.25 && ready('innervate') && !c.aura(p, 'innervate')) return { id: 'innervate', target: c.self };
    if (mana < 0.3 && ready('manaPotion')) return { id: 'manaPotion', target: c.self };
  }
  if (low && healthPct(low) < 0.35) {
    if (tl.swiftmend && ready('swiftmend') && hotOn(low) && afford('swiftmend')) return { id: 'swiftmend', target: low };
    if (tl.naturesSwiftness && ready('naturesSwiftness') && afford('healingTouch')) return { id: 'naturesSwiftness', target: low };
    if (swift(c) && afford('healingTouch')) return { id: 'healingTouch', target: low };
    if (afford('regrowth')) return { id: 'regrowth', target: low };
  }
  if (tank.health > 0 && !c.aura(tank, 'rejuvenation') && c.missing(tank) > 0 && afford('rejuvenation')) return { id: 'rejuvenation', target: tank };
  if (tl.wildGrowth && hurt.length >= 3 && ready('wildGrowth') && afford('wildGrowth')) return { id: 'wildGrowth', target: hurt[0] };
  if (tank.health > 0 && healthPct(tank) < 0.7) {
    if (!c.aura(tank, 'regrowthHot') && afford('regrowth')) return { id: 'regrowth', target: tank };
    if (afford('healingTouch')) return { id: 'healingTouch', target: tank };
  }
  if (low && healthPct(low) < 0.75) {
    if (!c.aura(low, 'rejuvenation') && afford('rejuvenation')) return { id: 'rejuvenation', target: low };
    if (afford('regrowth')) return { id: 'regrowth', target: low };
  }
  if (nobodyHurt(c)) return null;
  if (low && !c.aura(low, 'rejuvenation') && afford('rejuvenation')) return { id: 'rejuvenation', target: low };
  return null;
}

function chances(c: Combat): { title: string; rows: [string, string][] }[] {
  const tl = T(c);
  const pct = (n: number) => `${Math.max(0, Math.min(100, n)).toFixed(1)}%`;
  return [
    {
      title: 'Your heals',
      rows: [
        ['Heal crit (Nature\'s Majesty +' + 2 * tl.naturesMajesty + '%)', pct(healCritChance(c, 'healingTouch'))],
        ['Regrowth crit (Improved Regrowth +' + 10 * tl.improvedRegrowth + '%)', pct(healCritChance(c, 'regrowth'))],
        ['Crit heals', '1.5x; heal over time ticks crit too (provisional)'],
        ['Healing power', String(healingPower(c, 'nature'))],
        ['Gift of Nature / Genesis', `+${2 * tl.giftOfNature}% all healing / +${tl.genesis}% ticks`],
      ],
    },
    {
      title: 'Rhythm',
      rows: [
        ['Global cooldown', `1.5 s (${quickGcd(c)} s on Rejuvenation, Swiftmend and Wild Growth), shorter with casting haste`],
        ['Healing Touch / Regrowth cast', `${(D.healingTouch.cast - 0.1 * tl.naturalist).toFixed(1)} s / ${D.regrowth.cast} s`],
        ['Rejuvenation / Regrowth ticks', `${rejuvTicks(c)} every 3 s / ${regrowthTicks(c)} every 3 s`],
        ['Mana regeneration now', `${regen(c).toFixed(1)} per second (Spirit stops 5 s after you spend mana${tl.reflection ? `; Reflection keeps ${[0, 17, 33, 50][tl.reflection]}%` : ''})`],
      ],
    },
  ];
}

function review(c: Combat): Row[] {
  const time = c.counters.combatTime ?? 0;
  if (time < 1) return [];
  const rows: Row[] = [
    { label: 'Rejuvenation on the tank', value: pctOf(tankUptime(c, 'rejuvenation')), good: tankUptime(c, 'rejuvenation') >= 0.7 },
    { label: 'Regrowth on the tank', value: pctOf(tankUptime(c, 'regrowthHot')) },
  ];
  if (T(c).swiftmend) rows.push({ label: 'Swiftmends', value: String(c.counters.swiftmends ?? 0) });
  if (T(c).naturesSwiftness) rows.push({ label: "Nature's Swiftness used", value: String(c.counters.naturesSwiftnessUsed ?? 0) });
  return [...rows, ...healingReview(c, 'healingTouch')];
}

export const druidResto: Spec = {
  id: 'druid-resto',
  className: 'Druid',
  specName: 'Restoration',
  resource: 'mana',
  healer: true,
  partyDamage: 600,
  showHealth: true,
  startDistance: HEALER_START,
  abilities: ABILITIES,
  stats: RESTO_STATS,
  rules: BOSS_RULES,
  builds: buildsFor('resto').map((b) => ({ id: b.id, label: buildLabel(b), name: b.name, source: 'our proposal', talentString: b.talentString, stats: b.stats, bar: b.bar, trees: summary(talentsFor(b.id, 'resto')) })),
  defaultOptions: { build: 'resto', mana: 4024, spirit: D.restoSpirit, mp5: D.restoMp5, lockMana: false },
  defaultRaid: ['blessingOfWisdom', 'manaSpring'],
  lowMana: (c) => c.cost(c.ability('healingTouch')!),
  options: MANA_OPTIONS,
  sheet: HEALER_SHEET,
  regen,
  bar: buildById('resto', 'resto').bar,
  welcome: 'Welcome to the Restoration practice yard. Keep Rejuvenation on the tank and Regrowth up when the blows land, Swiftmend when someone drops fast, Nature\'s Swiftness with Healing Touch for the big one, Wild Growth when the whole party is hurt. Overhealing shows in the panel: heals over time that tick on a full target are wasted mana.',
  help: `${CONTROLS}
    ${HELP_HEALING}
    Restoration in WoW Forever: Gift of Nature is +10% healing, Genesis +5% on every tick, Nature's Splendor lengthens Rejuvenation by a tick and Regrowth by two, Gift of the Earthmother puts Rejuvenation, Swiftmend and Wild Growth on a 1.0 sec global cooldown, Living Spirit is +15% Spirit. Swiftmend spends a Regrowth (first) or Rejuvenation for its full worth at once. Wild Growth (31 points) heals the party over 7 sec, most at first. Tranquility is a 10 sec channel on a 2 min cooldown with Improved Tranquility. Healing Touch is 3.0 sec with Naturalist, instant with Nature's Swiftness.
    The yellow glow and the cue above the bar are our priority list (no sim has a healer list yet): Swiftmend or an instant Healing Touch for a party member under 35%, Rejuvenation on the tank, Wild Growth when three or more are hurt, Regrowth then Healing Touch on the tank under 70%, Rejuvenation and Regrowth on whoever is lowest.
    This is a practice tool: crit chances follow WoW Forever; healing numbers are an approximation.`,
  look: { clothColor: 0x3c6e3a, leatherColor: 0x5a4a30, hood: false, robe: true },
  sources: SOURCES,
  prepare,
  suggest: (c) => hintParts(hint(c), c).suggest,
  cue: (c) => hintParts(hint(c), c).cue,
  chances,
  review,
};
