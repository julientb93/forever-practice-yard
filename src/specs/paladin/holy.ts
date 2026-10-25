// Holy for WoW Forever: Flash of Light and Holy Light, Holy Shock as a heal,
// Light's Vigil (31 points) to make the next Holy Shock free of its cooldown
// and heal the party, Divine Favor, Illumination and Infusion of Light,
// Blessing of Light on the tank, Lay on Hands. Numbers in ./data.ts, builds
// in ./talents.ts; sources in research/healing_forever.md.
import type { Combat } from '../../engine/combat';
import type { Ability, Heal, Spec, Unit } from '../../engine/types';
import { BOSS_RULES, CONTROLS } from '../common';
import {
  HEALER_SHEET, HEALER_START, HELP_HEALING, MANA_OPTIONS, between, directHeal, healCritChance, healingPower, healingReview, healthPct,
  heal, hintParts, needs, nobodyHurt, note, partyHeal, partyOf, type HealHint, type Row,
} from '../healing';
import { D, SOURCES, T, regen } from './core';
import { HOLY_STATS } from './data';
import { buildById, buildLabel, buildsFor, summary, talentsFor } from './talents';

const favor = (c: Combat) => !!c.aura(c.player, 'divineFavor');
const spendFavor = (c: Combat) => { if (favor(c)) { c.removeAura(c.player, 'divineFavor'); c.count('divineFavorUsed'); return true; } return false; };
const infused = (c: Combat) => !!c.aura(c.player, 'infusionOfLight');
/** The base cost Illumination gives half of, per heal. */
const BASE_COST: Record<string, number> = { flashOfLight: D.flashOfLight.mana, holyLight: D.holyLight.mana, holyShock: D.holyShockHeal.mana, lightsVigil: D.lightsVigilHeal.mana };

// ---------------------------------------------------------------- effects
/** Illumination: a crit heal gives back half its base cost, 20 % chance per point; Infusion of Light: a Holy Shock or Flash of Light crit speeds up your next Holy Light. */
function afterHeal(c: Combat, h: Heal): void {
  if (!h.crit || h.periodic) return;
  const tl = T(c);
  const base = BASE_COST[h.source];
  if (base && tl.illumination && c.random() * 100 < 20 * tl.illumination) {
    const n = Math.round(base * D.illumination.refund);
    c.gainMana(n);
    c.count('illuminationMana', n);
  }
  if (tl.infusionOfLight && (h.source === 'holyShock' || h.source === 'flashOfLight')) {
    c.applyAura(c.player, { id: 'infusionOfLight', name: 'Infusion of Light', icon: 'infusionOfLight', duration: D.infusionOfLight.duration });
  }
}

const blessed = (c: Combat, u: Unit) => !!c.aura(u, 'blessingOfLight');

// -------------------------------------------------------------- abilities
const ABILITIES: Ability[] = [
  heal({
    id: 'flashOfLight', name: 'Flash of Light', icon: 'flashOfLight',
    cost: () => D.flashOfLight.mana,
    castTime: (c) => D.flashOfLight.cast / c.castHaste(),
    description: () => `A ${D.flashOfLight.cast} sec cast: heals for ${D.flashOfLight.base}-${Math.round(D.flashOfLight.base * (1 + D.flashOfLight.variance))} plus ${Math.round(D.flashOfLight.coeff * 100)}% of your healing power (+${D.blessingOfLight.flashOfLight} on a target with your Blessing of Light). Cheap and quick: the filler.`,
    use: (c, t) => {
      const u = t!;
      directHeal(c, u, { id: 'flashOfLight', school: 'holy', base: D.flashOfLight.base, variance: D.flashOfLight.variance, coeff: D.flashOfLight.coeff, flat: blessed(c, u) ? D.blessingOfLight.flashOfLight : 0, forceCrit: spendFavor(c) });
    },
  }),
  heal({
    id: 'holyLight', name: 'Holy Light', icon: 'holyLight',
    cost: () => D.holyLight.mana,
    castTime: (c) => Math.max(0, D.holyLight.cast - (infused(c) ? D.infusionOfLight.perPoint * T(c).infusionOfLight : 0)) / c.castHaste(),
    highlight: infused,
    description: (c) => `A ${D.holyLight.cast} sec cast (${(D.holyLight.cast - D.infusionOfLight.perPoint * T(c).infusionOfLight).toFixed(1)} sec after a Holy Shock or Flash of Light crit with Infusion of Light): heals for ${D.holyLight.base}-${Math.round(D.holyLight.base * (1 + D.holyLight.variance))} plus ${Math.round(D.holyLight.coeff * 100)}% of your healing power (+${D.blessingOfLight.holyLight} with your Blessing of Light). The big heal.`,
    use: (c, t) => {
      const u = t!;
      if (infused(c)) { c.removeAura(c.player, 'infusionOfLight'); c.count('infusionUsed'); }
      directHeal(c, u, { id: 'holyLight', school: 'holy', base: D.holyLight.base, variance: D.holyLight.variance, coeff: D.holyLight.coeff, flat: blessed(c, u) ? D.blessingOfLight.holyLight : 0, forceCrit: spendFavor(c) });
    },
  }),
  heal({
    id: 'holyShock', name: 'Holy Shock', icon: 'holyShock', range: D.holyShockHeal.range,
    cost: () => D.holyShockHeal.mana,
    cooldown: D.holyShockHeal.cooldown,
    ...needs((c) => T(c).holyShock > 0, 'Holy Shock'),
    highlight: (c) => !!c.aura(c.friendTarget(), 'lightsVigilMark'),
    description: (c) => `Instant: heals for ${D.holyShockHeal.base}-${Math.round(D.holyShockHeal.base * (1 + D.holyShockHeal.variance))} plus ${Math.round(D.holyShockHeal.coeff * 100)}% of your healing power. ${D.holyShockHeal.cooldown} sec cooldown.${T(c).holyPower ? ` Holy Power: +${D.holyPower.shock * T(c).holyPower}% crit.` : ''} On a target with your Light's Vigil it triggers no cooldown and heals their party for ${D.lightsVigilHeal.base}-${Math.round(D.lightsVigilHeal.base * (1 + D.lightsVigilHeal.variance))} plus ${Math.round(D.lightsVigilHeal.coeff * 100)}% each.`,
    use: (c, t) => {
      const u = t!;
      const vigil = c.aura(u, 'lightsVigilMark');
      directHeal(c, u, { id: 'holyShock', school: 'holy', base: D.holyShockHeal.base, variance: D.holyShockHeal.variance, coeff: D.holyShockHeal.coeff, forceCrit: spendFavor(c) });
      if (vigil) {
        c.removeAura(u, 'lightsVigilMark');
        c.clearCooldown('holyShock');
        partyHeal(c, partyOf(c, u), { id: 'lightsVigil', school: 'holy', base: D.lightsVigilHeal.base, variance: D.lightsVigilHeal.variance, coeff: D.lightsVigilHeal.coeff });
        c.count('vigilShocks');
        note(c, "Light's Vigil: Holy Shock is free again");
      }
    },
  }),
  heal({
    id: 'lightsVigil', name: "Light's Vigil", icon: 'lightsVigil', range: D.lightsVigilHeal.range,
    cost: () => D.lightsVigilHeal.mana,
    cooldown: D.lightsVigilHeal.cooldown,
    castTime: (c) => D.lightsVigilHeal.cast / c.castHaste(),
    ...needs((c) => T(c).lightsVigil > 0, "Light's Vigil"),
    description: () => `A ${D.lightsVigilHeal.cast} sec cast: marks the target for ${D.lightsVigilHeal.mark} sec. Your next Holy Shock on them triggers no cooldown and heals their party for ${D.lightsVigilHeal.base}-${Math.round(D.lightsVigilHeal.base * (1 + D.lightsVigilHeal.variance))} plus ${Math.round(D.lightsVigilHeal.coeff * 100)}% of your healing power each. ${D.lightsVigilHeal.mana} mana, ${D.lightsVigilHeal.cooldown} sec cooldown. One mark at a time: put it on the tank, then Shock twice.`,
    use: (c, t) => {
      for (const u of c.partyUnits()) c.removeAura(u, 'lightsVigilMark');
      c.applyAura(t!, { id: 'lightsVigilMark', name: "Light's Vigil", icon: 'lightsVigilMark', duration: D.lightsVigilHeal.mark });
    },
  }),
  {
    id: 'divineFavor', name: 'Divine Favor', icon: 'divineFavor', gcd: 0, target: 'self',
    cost: () => D.divineFavor.mana, cooldown: D.divineFavor.cooldown,
    ...needs((c) => T(c).divineFavor > 0, 'Divine Favor'),
    highlight: favor,
    description: () => `Your next Flash of Light, Holy Light or Holy Shock crits. Off the global cooldown: pair it with Holy Light on a hurt tank (and Illumination gives mana back on the crit). ${D.divineFavor.cooldown / 60} min cooldown.`,
    use: (c) => { c.applyAura(c.player, { id: 'divineFavor', name: 'Divine Favor', icon: 'divineFavor', duration: Infinity }); },
  },
  heal({
    id: 'blessingOfLight', name: 'Blessing of Light', icon: 'blessingOfLight', range: 30,
    cost: () => D.blessingOfLight.mana,
    highlight: (c) => !blessed(c, c.tank()) && c.partyDamage.on,
    description: () => `Instant: for an hour your Holy Light heals the target ${D.blessingOfLight.holyLight} more and your Flash of Light ${D.blessingOfLight.flashOfLight} more. One blessing per target from you; put it on the tank before the pull.`,
    use: (c, t) => { c.applyAura(t!, { id: 'blessingOfLight', name: 'Blessing of Light', icon: 'blessingOfLight', duration: D.blessingOfLight.duration }); },
  }),
  heal({
    id: 'layOnHands', name: 'Lay on Hands', icon: 'layOnHands',
    cooldown: D.layOnHandsHeal.cooldown,
    description: () => `Instant: heals the target for your maximum health and gives them ${D.layOnHandsHeal.mana} mana; drains all your mana. ${D.layOnHandsHeal.cooldown / 60} min cooldown. The last resort.`,
    use: (c, t) => {
      directHeal(c, t!, { id: 'layOnHands', school: 'holy', base: c.player.maxHealth, coeff: 0 });
      if (!c.manaLocked) { c.player.resource = 0; c.lastSpend = c.t; }
      c.count('layOnHands');
    },
  }),
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
  p.maxResource = Math.max(1, Number(c.options.mana ?? 4200));
  p.regenPerSecond = 0;
  c.manaLocked = !!c.options.lockMana;
  c.mod.healCrit = D.holyPower.others * tl.holyPower;
  c.mod.healCritFor = { holyShock: (D.holyPower.shock - D.holyPower.others) * tl.holyPower };
  const light = 1 + D.healingLight * tl.healingLight;
  c.mod.healingFor = { holyLight: light, flashOfLight: light, holyShock: light };
  c.afterHeal.push((h) => afterHeal(c, h));
  c.trackedTankAuras.push('blessingOfLight', 'lightsVigilMark');
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

/** Our priority list (no sim has one): Blessing of Light on the tank, Holy Shock then Flash of Light for whoever drops, Light's Vigil and a double Holy Shock on a hurt tank, Holy Light (with Divine Favor) for the big hits, Flash of Light as the filler. */
function computeHint(c: Combat): HealHint | null {
  const tl = T(c);
  const p = c.player;
  const ready = (id: string) => c.cooldownLeft(id).left === 0 && (c.ability(id)?.usable?.(c) ?? true);
  const afford = (id: string) => c.cost(c.ability(id)!) <= p.resource;
  const tank = c.tank();
  if (c.partyDamage.on && tank !== c.self && tank.health > 0 && !blessed(c, tank) && afford('blessingOfLight')) return { id: 'blessingOfLight', target: tank };
  if (!c.partyDamage.on) return null;
  const low = c.lowestAlly({ minMissing: 1 });
  const mana = c.manaLocked ? 1 : p.resource / p.maxResource;
  if (!c.manaLocked && p.inCombat && mana < 0.3 && ready('manaPotion')) return { id: 'manaPotion', target: c.self };
  if (low && healthPct(low) < 0.15 && ready('layOnHands')) return { id: 'layOnHands', target: low };
  if (low && healthPct(low) < 0.35) {
    if (tl.holyShock && ready('holyShock') && afford('holyShock')) return { id: 'holyShock', target: low };
    if (afford('flashOfLight')) return { id: 'flashOfLight', target: low };
  }
  // Holy Shock on cooldown is cheap healing (and Illumination mana): the most hurt member gets it; a Vigil mark makes it free again.
  if (tl.holyShock && low && healthPct(low) < 0.85 && ready('holyShock') && afford('holyShock')) return { id: 'holyShock', target: c.aura(tank, 'lightsVigilMark') && healthPct(tank) < 0.85 ? tank : low };
  if (tank.health > 0 && healthPct(tank) < 0.75) {
    if (tl.lightsVigil && ready('lightsVigil') && afford('lightsVigil') && !c.aura(tank, 'lightsVigilMark') && healthPct(tank) < 0.65 && !c.casting) return { id: 'lightsVigil', target: tank };
    if (tl.divineFavor && ready('divineFavor') && healthPct(tank) < 0.5 && afford('holyLight')) return { id: 'divineFavor', target: tank };
    if (afford('holyLight') && (infused(c) || healthPct(tank) < 0.6 || c.missing(tank) > 1800)) return { id: 'holyLight', target: tank };
  }
  if (low && healthPct(low) < 0.8 && afford('flashOfLight')) return { id: 'flashOfLight', target: low };
  if (nobodyHurt(c)) return null;
  if (low && afford('flashOfLight')) return { id: 'flashOfLight', target: low };
  return null;
}

function chances(c: Combat): { title: string; rows: [string, string][] }[] {
  const tl = T(c);
  const pct = (n: number) => `${Math.max(0, Math.min(100, n)).toFixed(1)}%`;
  const procs: [string, string][] = [];
  if (tl.illumination) procs.push(['Illumination per crit heal', `${20 * tl.illumination}% for half the base cost back (Flash ${D.flashOfLight.mana / 2}, Holy Light ${D.holyLight.mana / 2}, Shock ${Math.round(D.holyShockHeal.mana / 2)})`]);
  if (tl.infusionOfLight) procs.push(['Infusion of Light per Holy Shock or Flash crit', `next Holy Light ${D.infusionOfLight.perPoint * tl.infusionOfLight} s faster, 15 s`]);
  return [
    {
      title: 'Your heals',
      rows: [
        ['Heal crit (Holy Power +' + D.holyPower.others * tl.holyPower + '%)', pct(healCritChance(c, 'holyLight'))],
        ['Holy Shock crit (Holy Power +' + D.holyPower.shock * tl.holyPower + '%)', pct(healCritChance(c, 'holyShock'))],
        ['Crit heals', '1.5x'],
        ['Healing power', String(healingPower(c, 'holy'))],
        ['Healing Light', `+${Math.round(D.healingLight * tl.healingLight * 100)}% on Holy Light, Flash of Light and Holy Shock`],
      ],
    },
    { title: 'Procs', rows: procs },
    {
      title: 'Rhythm',
      rows: [
        ['Global cooldown', '1.5 s, shorter with casting haste (1.0 s floor)'],
        ['Holy Light / Flash of Light cast', `${D.holyLight.cast} s (${(D.holyLight.cast - D.infusionOfLight.perPoint * tl.infusionOfLight).toFixed(1)} s with Infusion of Light) / ${D.flashOfLight.cast} s`],
        ['Holy Shock cooldown', `${D.holyShockHeal.cooldown} s, none on a Light's Vigil target`],
        ['Mana regeneration now', `${regen(c).toFixed(1)} per second (Spirit stops 5 s after you spend mana${tl.reverence ? `; Reverence keeps ${10 * tl.reverence}%` : ''})`],
      ],
    },
  ];
}

function review(c: Combat): Row[] {
  const k = c.counters;
  const time = k.combatTime ?? 0;
  if (time < 1) return [];
  const rows: Row[] = [];
  if (T(c).lightsVigil) rows.push({ label: "Holy Shocks freed by Light's Vigil", value: String(k.vigilShocks ?? 0) });
  if (T(c).illumination) rows.push({ label: 'Mana from Illumination', value: `+${Math.round(k.illuminationMana ?? 0)}` });
  if (T(c).infusionOfLight) rows.push({ label: 'Holy Lights sped up by Infusion of Light', value: String(k.infusionUsed ?? 0) });
  return [...rows, ...healingReview(c, 'holyLight')];
}

export const paladinHoly: Spec = {
  id: 'paladin-holy',
  className: 'Paladin',
  specName: 'Holy',
  resource: 'mana',
  healer: true,
  partyDamage: 600,
  showHealth: true,
  startDistance: HEALER_START,
  abilities: ABILITIES,
  stats: HOLY_STATS,
  rules: BOSS_RULES,
  builds: buildsFor('holy').map((b) => ({ id: b.id, label: buildLabel(b), name: b.name, source: b.source, talentString: b.talentString, stats: b.stats, bar: b.bar, trees: summary(talentsFor(b.id, 'holy')) })),
  defaultOptions: { build: 'holy', mana: 4200, spirit: D.holySpirit, mp5: D.holyMp5, lockMana: false },
  defaultRaid: ['blessingOfWisdom', 'manaSpring'],
  lowMana: (c) => c.cost(c.ability('holyLight')!),
  options: MANA_OPTIONS,
  sheet: HEALER_SHEET,
  regen,
  bar: buildById('holy', 'holy').bar,
  welcome: 'Welcome to the Holy practice yard. Blessing of Light on the tank, Flash of Light as the filler, Holy Light when the blows add up (faster after a crit with Infusion of Light), Holy Shock for whoever drops, Light\'s Vigil on the tank and two Holy Shocks in a row, Divine Favor with Holy Light. Illumination gives mana back on crits: crit is your mana.',
  help: `${CONTROLS}
    ${HELP_HEALING}
    Holy in WoW Forever: Holy Shock heals on a 10 sec cooldown and Light's Vigil (31 points) marks a target so that your next Holy Shock on them triggers no cooldown and heals their party. Infusion of Light makes Holy Light 1 sec faster after a Holy Shock or Flash of Light crit; Illumination gives half a crit heal's base cost back; Holy Power is +15% crit on Holy Shock and +5% on the rest; Healing Light +12%. Blessing of Light adds 400 to Holy Light and 115 to Flash of Light on its target. Reverence keeps 30% of your Spirit regeneration while casting.
    The yellow glow and the cue above the bar are our priority list (no sim has a healer list yet): Blessing of Light on the tank, Lay on Hands under 15%, Holy Shock then Flash of Light for a party member under 35%, on a tank under 70% a Vigil Shock, Light's Vigil, Divine Favor and Holy Light, then Holy Shock and Flash of Light on whoever is lowest.
    This is a practice tool: crit chances follow WoW Forever; healing numbers are an approximation.`,
  look: { clothColor: 0xf0e6c8, leatherColor: 0xc0a040, hood: false, plate: true },
  sources: SOURCES,
  prepare,
  suggest: (c) => hintParts(hint(c), c).suggest,
  cue: (c) => hintParts(hint(c), c).cue,
  chances,
  review,
};
