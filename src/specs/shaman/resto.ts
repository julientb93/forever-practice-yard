// Restoration for WoW Forever: Healing Wave and Lesser Healing Wave, Chain
// Heal for the party (stronger on a Riptide target), Riptide (31 points),
// Water Shield and Mana Tide Totem for mana, Healing Stream Totem, Nature's
// Swiftness. Numbers in ./data.ts, builds in ./talents.ts; sources in
// research/healing_forever.md.
import type { Combat } from '../../engine/combat';
import type { Ability, Heal, Spec, Unit } from '../../engine/types';
import { BOSS_RULES, CONTROLS } from '../common';
import {
  HEALER_SHEET, HEALER_START, HELP_HEALING, MANA_OPTIONS, between, chainHeal, directHeal, healCritChance, healingPower, healingReview, healthPct,
  heal, hintParts, hot, needs, nobodyHurt, note, tankUptime, type HealHint, type Row,
} from '../healing';
import { ABILITIES as DAMAGE_ABILITIES, D, SOURCES, T, regen, totem } from './core';
import { RESTO_STATS } from './data';
import { buildById, buildLabel, buildsFor, summary, talentsFor } from './talents';

const pctOf = (n: number) => `${Math.round(n * 100)}%`;
const swift = (c: Combat) => !!c.aura(c.player, 'naturesSwiftness');
const spendSwift = (c: Combat) => { if (swift(c)) { c.removeAura(c.player, 'naturesSwiftness'); c.count('naturesSwiftnessUsed'); } };
/** Tidal Focus: heals 1 % cheaper per point. */
const tidal = (c: Combat) => 1 - 0.01 * T(c).tidalFocus;
const totemCost = (base: number) => (c: Combat) => Math.round(base * (1 - 0.05 * T(c).totemicFocus));

// ---------------------------------------------------------------- effects
interface RestoState { lastGlobe: number }
const states = new WeakMap<Combat, RestoState>();
const state = (c: Combat): RestoState => {
  let s = states.get(c);
  if (!s) states.set(c, (s = { lastGlobe: -Infinity }));
  return s;
};

/** Water Shield: a heal crit (or a hit taken) spends a globe for 2 % of your maximum mana, at most once every 3.5 s. */
function spendGlobe(c: Combat): void {
  const ws = c.aura(c.player, 'waterShield');
  const s = state(c);
  if (!ws || c.t - s.lastGlobe < D.waterShield.icd) return;
  s.lastGlobe = c.t;
  const n = Math.round(c.player.maxResource * D.waterShield.manaPct);
  c.gainMana(n);
  c.count('waterShieldMana', n);
  note(c, `+${n} Mana (Water Shield)`, 'resource');
  if ((ws.stacks ?? 1) <= 1) c.removeAura(c.player, 'waterShield'); else ws.stacks = (ws.stacks ?? 1) - 1;
}

/** Ancestral Healing: a crit heal gives the target Ancestral Fortitude (armor) for 15 s; Water Shield spends a globe. */
function afterHeal(c: Combat, h: Heal): void {
  if (!h.crit || h.periodic) return;
  if (T(c).ancestralHealing) c.applyAura(h.target, { id: 'ancestralFortitude', name: 'Ancestral Fortitude', icon: 'ancestralFortitude', duration: 15 });
  spendGlobe(c);
}

const riptideBoost = (c: Combat) => (u: Unit) => (c.aura(u, 'riptide') ? 1 + D.riptide.chainHeal : 1);

// -------------------------------------------------------------- abilities
const manaSpring = DAMAGE_ABILITIES.find((a) => a.id === 'manaSpringTotem')!;
const ABILITIES: Ability[] = [
  heal({
    id: 'healingWave', name: 'Healing Wave', icon: 'healingWave',
    cost: (c) => Math.round(D.healingWave.mana * tidal(c)),
    castTime: (c) => (swift(c) ? 0 : (D.healingWave.cast - 0.1 * T(c).improvedHealingWave) / c.castHaste()),
    description: (c) => `A ${(D.healingWave.cast - 0.1 * T(c).improvedHealingWave).toFixed(1)} sec cast: heals for ${D.healingWave.base}-${Math.round(D.healingWave.base * (1 + D.healingWave.variance))} plus ${Math.round(D.healingWave.coeff * 100)}% of your healing power.${T(c).healingWay ? ` Healing Way: +${Math.round((D.healingWay[T(c).healingWay] - 1) * 100)}%.` : ''} The big, efficient heal; instant with Nature's Swiftness.`,
    use: (c, t) => { spendSwift(c); directHeal(c, t!, { id: 'healingWave', school: 'nature', base: D.healingWave.base, variance: D.healingWave.variance, coeff: D.healingWave.coeff }); },
  }),
  heal({
    id: 'lesserHealingWave', name: 'Lesser Healing Wave', icon: 'lesserHealingWave',
    cost: (c) => Math.round(D.lesserHealingWave.mana * tidal(c)),
    castTime: (c) => (swift(c) ? 0 : D.lesserHealingWave.cast / c.castHaste()),
    description: () => `A ${D.lesserHealingWave.cast} sec cast: heals for ${D.lesserHealingWave.base}-${Math.round(D.lesserHealingWave.base * (1 + D.lesserHealingWave.variance))} plus ${Math.round(D.lesserHealingWave.coeff * 100)}% of your healing power. The quick heal, more mana per point of healing.`,
    use: (c, t) => { spendSwift(c); directHeal(c, t!, { id: 'lesserHealingWave', school: 'nature', base: D.lesserHealingWave.base, variance: D.lesserHealingWave.variance, coeff: D.lesserHealingWave.coeff }); },
  }),
  heal({
    id: 'chainHeal', name: 'Chain Heal', icon: 'chainHeal',
    cost: (c) => Math.round(D.chainHeal.mana * tidal(c)),
    castTime: (c) => (swift(c) ? 0 : D.chainHeal.cast / c.castHaste()),
    description: () => `A ${D.chainHeal.cast} sec cast: heals for ${D.chainHeal.base}-${Math.round(D.chainHeal.base * (1 + D.chainHeal.variance))} plus ${Math.round(D.chainHeal.coeff * 100)}% of your healing power, then jumps to the ${D.chainHeal.jumps} most hurt other party members at ${Math.round(D.chainHeal.falloff * 100)}% each jump. +${Math.round(D.riptide.chainHeal * 100)}% on a target with your Riptide. Rank 3 is the last one at 60.`,
    use: (c, t) => {
      spendSwift(c);
      chainHeal(c, t!, { id: 'chainHeal', school: 'nature', base: D.chainHeal.base, variance: D.chainHeal.variance, coeff: D.chainHeal.coeff }, D.chainHeal.jumps, D.chainHeal.falloff, riptideBoost(c));
    },
  }),
  heal({
    id: 'riptide', name: 'Riptide', icon: 'riptide',
    cost: (c) => Math.round(D.riptide.mana * tidal(c)),
    cooldown: D.riptide.cooldown,
    ...needs((c) => T(c).riptide > 0, 'Riptide'),
    description: () => `Instant: heals for ${D.riptide.base}-${Math.round(D.riptide.base * (1 + D.riptide.variance))} plus ${Math.round(D.riptide.coeff * 100)}% of your healing power, then ${D.riptide.ticks} ticks of ${D.riptide.tick} plus ${Math.round(D.riptide.tickCoeff * 100)}% every ${D.riptide.period} sec, and your Chain Heal on that target heals ${Math.round(D.riptide.chainHeal * 100)}% more. ${D.riptide.cooldown} sec cooldown. Keep it on the tank.`,
    use: (c, t) => {
      const u = t!;
      directHeal(c, u, { id: 'riptide', school: 'nature', base: D.riptide.base, variance: D.riptide.variance, coeff: D.riptide.coeff });
      hot(c, u, { id: 'riptide', name: 'Riptide', school: 'nature', ticks: D.riptide.ticks, period: D.riptide.period, canCrit: true, tick: (cc) => D.riptide.tick + D.riptide.tickCoeff * healingPower(cc, 'nature') });
    },
  }),
  {
    id: 'waterShield', name: 'Water Shield', icon: 'waterShield', gcd: D.gcd, target: 'self', hastedGcd: true, animation: 'cast',
    ...needs((c) => T(c).waterShield > 0, 'Water Shield'),
    highlight: (c) => !c.aura(c.player, 'waterShield'),
    description: () => `${D.waterShield.globes} globes of water for ${D.waterShield.duration / 60} min: when one of your spells crits (or something hits you) a globe gives you ${Math.round(D.waterShield.manaPct * 100)}% of your maximum mana, at most once every ${D.waterShield.icd} sec. Free, no cooldown: recast it when the globes are gone.`,
    use: (c) => {
      c.applyAura(c.player, {
        id: 'waterShield', name: 'Water Shield', icon: 'waterShield', duration: D.waterShield.duration, stacks: D.waterShield.globes,
        onDamageTaken: (cc) => spendGlobe(cc),
      });
    },
  },
  {
    ...totem('manaTideTotem', 'manaTideTotem', 'water', 'Mana Tide Totem', D.manaTideTotem.mana,
      () => `For ${D.manaTideTotem.duration} sec it gives you (and your party) ${D.manaTideTotem.perTick} mana every ${D.manaTideTotem.period} sec: ${D.manaTideTotem.perTick * (D.manaTideTotem.duration / D.manaTideTotem.period)} mana. ${D.manaTideTotem.cooldown / 60} min cooldown. It replaces your Mana Spring Totem.`,
      () => ({
        duration: D.manaTideTotem.duration, period: D.manaTideTotem.period,
        onTick: (cc: Combat) => { cc.gainMana(D.manaTideTotem.perTick); cc.count('manaTideMana', D.manaTideTotem.perTick); note(cc, `+${D.manaTideTotem.perTick} Mana (Mana Tide)`, 'resource'); },
      }),
      { cooldown: D.manaTideTotem.cooldown, cost: totemCost(D.manaTideTotem.mana), ...needs((c) => T(c).manaTideTotem > 0, 'Mana Tide Totem') }),
  },
  totem('healingStreamTotem', 'healingStreamTotem', 'water', 'Healing Stream Totem', D.healingStreamTotem.mana,
    (c) => `For ${D.healingStreamTotem.duration / 60} min it heals every party member for ${Math.round(D.healingStreamTotem.tick * (1 + 0.1 * T(c).restorativeTotems))} plus ${Math.round(D.healingStreamTotem.coeff * 100)}% of your healing power every ${D.healingStreamTotem.period} sec. Small, but free of overhealing worries. It replaces your Mana Spring Totem.`,
    () => ({
      duration: D.healingStreamTotem.duration, period: D.healingStreamTotem.period,
      onTick: (cc: Combat) => {
        const n = (D.healingStreamTotem.tick + D.healingStreamTotem.coeff * healingPower(cc, 'nature')) * (1 + 0.1 * T(cc).restorativeTotems) * cc.mod.healingDone;
        for (const u of cc.partyAlive()) cc.heal({ target: u, source: 'healingStreamTotem', amount: n, crit: false, periodic: true, school: 'nature' });
      },
    }),
    { cost: totemCost(D.healingStreamTotem.mana) }),
  { ...manaSpring, cost: totemCost(D.manaSpringTotem.mana) },
  {
    id: 'naturesSwiftness', name: "Nature's Swiftness", icon: 'naturesSwiftness', gcd: 0, target: 'self',
    cooldown: D.naturesSwiftness.cooldown,
    ...needs((c) => T(c).naturesSwiftness > 0, "Nature's Swiftness"),
    highlight: swift,
    description: () => `Your next Healing Wave, Lesser Healing Wave or Chain Heal is instant. Off the global cooldown: press it and the heal in the same breath. ${D.naturesSwiftness.cooldown / 60} min cooldown.`,
    use: (c) => { c.applyAura(c.player, { id: 'naturesSwiftness', name: "Nature's Swiftness", icon: 'naturesSwiftness', duration: Infinity }); },
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

// ----------------------------------------------------------------- setup
function prepare(c: Combat): void {
  const tl = T(c);
  const p = c.player;
  states.set(c, { lastGlobe: -Infinity });
  p.maxResource = Math.max(1, Number(c.options.mana ?? 4376));
  p.regenPerSecond = 0;
  c.manaLocked = !!c.options.lockMana;
  c.mod.spellCrit += tl.thunderingStrikes;
  c.mod.healCrit = tl.tidalMastery;
  c.mod.healingDone = 1 + 0.02 * tl.purification;
  c.mod.healingFor = { healingWave: D.healingWay[tl.healingWay] };
  c.afterHeal.push((h) => afterHeal(c, h));
  c.trackedTankAuras.push('riptide');
  c.trackedAuras.push('waterShield');
  c.registerSource('healingStreamTotem', 'Healing Stream Totem', 'healingStreamTotem');
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

/** Our priority list (no sim has one): Water Shield up, Riptide on the tank, Lesser Healing Wave or an instant Healing Wave for whoever drops, Chain Heal when the party is hurt, Healing Wave on the tank. */
function computeHint(c: Combat): HealHint | null {
  const tl = T(c);
  const p = c.player;
  const ready = (id: string) => c.cooldownLeft(id).left === 0 && (c.ability(id)?.usable?.(c) ?? true);
  const afford = (id: string) => c.cost(c.ability(id)!) <= p.resource;
  if (tl.waterShield && !c.aura(p, 'waterShield')) return { id: 'waterShield', target: c.self };
  if (!c.partyDamage.on || c.channeling) return null;
  const tank = c.tank();
  const low = c.lowestAlly({ minMissing: 1 });
  const hurt = c.partyAlive().filter((u) => healthPct(u) < 0.8);
  const mana = c.manaLocked ? 1 : p.resource / p.maxResource;
  if (!c.manaLocked && p.inCombat) {
    if (tl.manaTideTotem && mana < 0.5 && ready('manaTideTotem')) return { id: 'manaTideTotem', target: c.self };
    if (mana < 0.3 && ready('manaPotion')) return { id: 'manaPotion', target: c.self };
  }
  if (low && healthPct(low) < 0.35) {
    if (tl.naturesSwiftness && ready('naturesSwiftness') && afford('healingWave')) return { id: 'naturesSwiftness', target: low };
    if (swift(c) && afford('healingWave')) return { id: 'healingWave', target: low };
    if (afford('lesserHealingWave')) return { id: 'lesserHealingWave', target: low };
  }
  if (tl.riptide && tank.health > 0 && ready('riptide') && !c.aura(tank, 'riptide') && c.missing(tank) > 0 && afford('riptide')) return { id: 'riptide', target: tank };
  if (hurt.length >= 3 && afford('chainHeal')) return { id: 'chainHeal', target: c.aura(tank, 'riptide') && hurt.includes(tank) ? tank : hurt[0] };
  if (tank.health <= 0) return low && afford('lesserHealingWave') ? { id: 'lesserHealingWave', target: low } : null;
  if (tank.health > 0 && healthPct(tank) < 0.7 && afford('healingWave')) return { id: 'healingWave', target: tank };
  if (low && healthPct(low) < 0.75) {
    if (tl.riptide && ready('riptide') && !c.aura(low, 'riptide') && afford('riptide')) return { id: 'riptide', target: low };
    if (afford('lesserHealingWave')) return { id: 'lesserHealingWave', target: low };
  }
  if (nobodyHurt(c)) {
    if (!c.aura(p, 'manaSpringTotem') && !c.aura(p, 'healingStreamTotem') && !c.aura(p, 'manaTideTotem') && !c.raid.has('manaSpring') && afford('healingStreamTotem')) return { id: 'healingStreamTotem', target: c.self };
    return null;
  }
  return null;
}

function chances(c: Combat): { title: string; rows: [string, string][] }[] {
  const tl = T(c);
  const pct = (n: number) => `${Math.max(0, Math.min(100, n)).toFixed(1)}%`;
  const procs: [string, string][] = [];
  if (tl.waterShield) procs.push(['Water Shield per crit heal', `${Math.round(c.player.maxResource * D.waterShield.manaPct)} mana (${Math.round(D.waterShield.manaPct * 100)}% of your pool), 3 globes, 3.5 s between globes`]);
  if (tl.ancestralHealing) procs.push(['Ancestral Fortitude per crit heal', `+${[0, 8, 16, 25][tl.ancestralHealing]}% armor on the target, 15 s`]);
  return [
    {
      title: 'Your heals',
      rows: [
        ['Heal crit (Tidal Mastery +' + tl.tidalMastery + '%, Thundering Strikes +' + tl.thunderingStrikes + '%)', pct(healCritChance(c, 'healingWave'))],
        ['Crit heals', '1.5x; Riptide ticks crit too (provisional)'],
        ['Healing power', String(healingPower(c, 'nature'))],
        ['Purification / Healing Way', `+${2 * tl.purification}% all healing / +${Math.round((D.healingWay[tl.healingWay] - 1) * 100)}% Healing Wave`],
      ],
    },
    { title: 'Procs', rows: procs },
    {
      title: 'Rhythm',
      rows: [
        ['Global cooldown', '1.5 s, shorter with casting haste (1.0 s floor); totems 1.0 s'],
        ['Healing Wave / Chain Heal cast', `${(D.healingWave.cast - 0.1 * tl.improvedHealingWave).toFixed(1)} s / ${D.chainHeal.cast} s`],
        ['Mana regeneration now', `${regen(c).toFixed(1)} per second (Spirit stops 5 s after you spend mana${tl.mindfulness ? `; Mindfulness keeps ${[0, 17, 33, 50][tl.mindfulness]}%` : ''})`],
      ],
    },
  ];
}

function review(c: Combat): Row[] {
  const k = c.counters;
  const time = k.combatTime ?? 0;
  if (time < 1) return [];
  const rows: Row[] = [];
  if (T(c).riptide) rows.push({ label: 'Riptide on the tank', value: pctOf(tankUptime(c, 'riptide')), good: tankUptime(c, 'riptide') >= 0.6 });
  if (T(c).waterShield) rows.push({ label: 'Water Shield up / mana from it', value: `${pctOf((k['uptime:waterShield'] ?? 0) / time)} / +${Math.round(k.waterShieldMana ?? 0)}`, good: (k['uptime:waterShield'] ?? 0) / time >= 0.9 });
  if ((k.manaTideMana ?? 0) > 0) rows.push({ label: 'Mana from Mana Tide', value: `+${Math.round(k.manaTideMana ?? 0)}` });
  return [...rows, ...healingReview(c, 'healingWave')];
}

export const shamanResto: Spec = {
  id: 'shaman-resto',
  className: 'Shaman',
  specName: 'Restoration',
  resource: 'mana',
  healer: true,
  partyDamage: 600,
  showHealth: true,
  startDistance: HEALER_START,
  abilities: ABILITIES,
  stats: RESTO_STATS,
  rules: BOSS_RULES,
  builds: buildsFor('resto').map((b) => ({ id: b.id, label: buildLabel(b), name: b.name, source: b.source, talentString: b.talentString, stats: b.stats, bar: b.bar, trees: summary(talentsFor(b.id, 'resto')), options: b.options })),
  defaultOptions: { build: 'resto', mana: 4376, spirit: D.spirit.resto, mp5: D.mp5.resto, lockMana: false },
  defaultRaid: ['blessingOfWisdom'],
  lowMana: (c) => c.cost(c.ability('healingWave')!),
  options: MANA_OPTIONS,
  sheet: HEALER_SHEET,
  regen,
  bar: buildById('resto', 'resto').bar,
  welcome: 'Welcome to the Restoration practice yard. Water Shield up, Riptide on the tank, Healing Wave when the blows add up, Lesser Healing Wave when someone drops fast, Chain Heal when the party is hurt (it heals more on your Riptide target), Mana Tide when the mana runs low. Totems: Healing Stream or Mana Spring in the Water slot, Mana Tide replaces them for 12 sec.',
  help: `${CONTROLS}
    ${HELP_HEALING}
    Restoration in WoW Forever: Riptide (31 points) is an instant heal with a 15 sec heal over time that makes your Chain Heal on that target 25% stronger. Chain Heal rank 3 is the last one at 60 and jumps to two more party members at 50% each. Water Shield (a talent) gives mana on your crit heals; Mana Tide Totem gives 1,160 mana over 12 sec on a 5 min cooldown and takes down your Mana Spring. Healing Way makes Healing Wave 25% stronger, Purification adds 10% to everything, Tidal Mastery 5% crit. Nature's Swiftness makes the next Healing Wave instant.
    The yellow glow and the cue above the bar are our priority list (no sim has a healer list yet): Water Shield when it is down, Nature's Swiftness and Healing Wave or Lesser Healing Wave for a party member under 35%, Riptide on the tank, Chain Heal when three or more are hurt, Healing Wave on the tank under 70%, then Riptide and Lesser Healing Wave on whoever is lowest; Mana Tide under half mana.
    This is a practice tool: crit chances follow WoW Forever; healing numbers are an approximation.`,
  look: { clothColor: 0x2d5f8a, leatherColor: 0x5a4a30, hood: false, robe: false },
  sources: SOURCES,
  prepare,
  suggest: (c) => hintParts(hint(c), c).suggest,
  cue: (c) => hintParts(hint(c), c).cue,
  chances,
  review,
};
