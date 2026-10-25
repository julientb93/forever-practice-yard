// What every healing spec shares: how a heal is rolled (1.5x crits, no
// misses), heals over time, party heals, the party the dummy hurts, the hint
// that names whom to heal next, the review rows (overhealing, deaths, mana)
// and the settings every healer gets. No healing meter: the panel counts
// heals and crits and reviews the habits. Sources: research/healing_forever.md.
import type { Combat } from '../engine/combat';
import type { Ability, Heal, School, SettingField, Spec, Unit } from '../engine/types';
import { fmt } from '../strings';

export const roll = (c: Combat, pct: number) => c.random() * 100 < pct;
export const between = (c: Combat, min: number, max: number) => min + c.random() * (max - min);
export const note = (c: Combat, text: string, kind: 'proc' | 'resource' = 'proc') => c.emit('note', { text, kind });

/** Yards to metres, as the engine measures. */
export const YARD = 0.9144;
/** Where healers start: 10 yards behind the dummy, among the party. */
export const HEALER_START = 10;

/** Healing power: Forever's gear gives one spell power number; talents add on top (Spiritual Guidance). */
export const healingPower = (c: Combat, school: School) => c.spellPowerFor(school) + c.mod.healingPower;

/** A heal's crit chance: spell crit (gear, Intellect, auras, talents) plus the healing talents. */
export const healCritChance = (c: Combat, id: string, extra = 0) => c.spellCritChance(c.mod.healCrit + (c.mod.healCritFor[id] ?? 0) + extra);

/** Heals crit for 1.5x, as in Classic (no Forever source says otherwise). */
export const healCritMultiplier = (c: Combat) => c.rules.spellCritMultiplier;

export interface DirectHeal {
  id: string;
  school: School;
  /** The client row's base value (its minimum) and the spread above it. */
  base: number;
  variance?: number;
  coeff: number;
  /** Extra crit chance in percentage points, or a guaranteed crit (Divine Favor). */
  extraCrit?: number;
  forceCrit?: boolean;
  /** A multiplier of this cast only (Nourish-style bonuses, Blessing of Light's flat bonus goes in `flat`). */
  mult?: number;
  flat?: number;
  /** Divine Aegis and Inspiration react to non-periodic crits; a shield is not a heal. */
  shield?: boolean;
}

/** The healing a direct heal does before crit: base roll, healing power and multipliers. */
export function healRoll(c: Combat, h: DirectHeal): number {
  const base = h.base * (1 + c.random() * (h.variance ?? 0)) + (h.flat ?? 0);
  return (base + h.coeff * healingPower(c, h.school)) * c.mod.healingDone * (c.mod.healingFor[h.id] ?? 1) * c.auraProduct('healingDone') * (h.mult ?? 1);
}

/** A direct heal on a party member: rolls the crit and lands it. */
export function directHeal(c: Combat, t: Unit, h: DirectHeal): Heal {
  const crit = h.forceCrit || roll(c, healCritChance(c, h.id, h.extraCrit));
  const amount = healRoll(c, h) * (crit ? healCritMultiplier(c) : 1);
  return c.heal({ target: t, source: h.id, amount, crit, school: h.school, shield: h.shield });
}

export interface HotSpec {
  id: string;
  name: string;
  icon?: string;
  school: School;
  ticks: number;
  period: number;
  /** Healing per tick before multipliers, read at each tick (healing power is not snapshot in Forever). */
  tick: (c: Combat) => number;
  /** Multiplier for the ticks only (Genesis); the spell's own multiplier applies too. */
  periodicMult?: (c: Combat) => number;
  /** Shape of the ticks: 1 everywhere, or front-loaded (Wild Growth). */
  shape?: (tick: number, ticks: number) => number;
  /** The ticks can crit (the sims roll heal crits on ticks; provisional). */
  canCrit?: boolean;
  /** Recasting keeps the old aura's ticks in step instead of restarting it (off: WoW restarts). */
  onExpire?: (c: Combat, t: Unit) => void;
}

/** A heal over time on a party member; recasting restarts it, as in WoW. */
export function hot(c: Combat, t: Unit, h: HotSpec): void {
  c.applyAura(t, {
    id: h.id, name: h.name, icon: h.icon ?? h.id, duration: h.ticks * h.period, period: h.period,
    onTick: (cc, a) => {
      const n = Math.round((a.duration - (a.end - cc.t)) / h.period);
      const crit = !!h.canCrit && roll(cc, healCritChance(cc, h.id));
      const amount = h.tick(cc) * cc.mod.healingDone * (cc.mod.healingFor[h.id] ?? 1) * cc.auraProduct('healingDone') * (h.periodicMult?.(cc) ?? 1)
        * (h.shape?.(n, h.ticks) ?? 1) * (crit ? healCritMultiplier(cc) : 1);
      cc.heal({ target: t, source: h.id, amount, crit, periodic: true, school: h.school });
    },
    onRemove: (cc, _a, expired) => { if (expired) h.onExpire?.(cc, t); },
  });
}

/** The party members a party heal reaches: everyone alive (the yard keeps the party together). */
export const partyOf = (c: Combat, _around?: Unit) => c.partyAlive();

/** A heal on the whole party (Prayer of Healing, Holy Nova, Light's Vigil): one roll per member. */
export function partyHeal(c: Combat, members: Unit[], h: DirectHeal): void {
  for (const u of members) directHeal(c, u, h);
}

/** Chain Heal: the target, then the two most hurt other members, each jump at `falloff` of the one before. */
export function chainHeal(c: Combat, first: Unit, h: DirectHeal, jumps: number, falloff: number, boost: (u: Unit) => number = () => 1): void {
  const done = new Set<Unit>([first]);
  let u: Unit | null = first;
  let mult = 1;
  for (let i = 0; i <= jumps && u; i++) {
    directHeal(c, u, { ...h, mult: (h.mult ?? 1) * mult * boost(u) });
    mult *= falloff;
    u = c.partyAlive().filter((x) => !done.has(x)).sort((a, b) => c.missing(b) / b.maxHealth - c.missing(a) / a.maxHealth)[0] ?? null;
    if (u) done.add(u);
  }
}

/** A friendly spell: a 1.5 s global cooldown that casting haste shortens, 40 yards, no auto attack. */
export const heal = (a: Omit<Ability, 'gcd' | 'target' | 'range' | 'hastedGcd' | 'noAutoAttack'> & { range?: number; gcd?: number }): Ability => {
  const { range, gcd, ...rest } = a;
  return { gcd: gcd ?? 1.5, target: 'friend', range: range ?? 40, hastedGcd: true, noAutoAttack: true, animation: 'cast', ...rest };
};

/** Mana per second with Spirit regeneration outside the five-second rule, a share of it while casting, MP5 always, and Innervate. */
export function manaRegen(c: Combat, opts: { spirit: number; mp5: number; casting: number; innervate?: boolean }): number {
  const spirit = 6.25 + opts.spirit / 8;
  const casting = c.t - c.lastSpend < 5;
  const innervate = !!opts.innervate && !!c.aura(c.player, 'innervate');
  const share = innervate ? 1 : casting ? opts.casting : 1;
  return spirit * (innervate ? 5 : 1) * share + opts.mp5 / 5;
}

// ----------------------------------------------------------------- hints
export interface HealHint { id: string; target: Unit }

/** The fraction of health a party member has. */
export const healthPct = (u: Unit) => u.health / u.maxHealth;

/** What the yellow glow says (the ability) and the cue above the bar (whom to heal). */
export function hintParts(hint: HealHint | null, c: Combat): { suggest: string | null; cue: { text: string; tone: 'go' | 'hit' | 'back' } | null } {
  if (!hint) return { suggest: null, cue: null };
  const a = c.ability(hint.id);
  const selected = c.friendTarget() === hint.target;
  const name = hint.target === c.self ? 'You' : hint.target.name;
  return { suggest: hint.id, cue: a ? { text: selected ? `${name}: ${a.name}` : `Target ${name} (${a.name})`, tone: selected ? 'go' : 'hit' } : null };
}

/** The common cases every healer hint starts with: nothing to heal, a potion, someone about to die. */
export function nobodyHurt(c: Combat): boolean {
  return !c.partyAlive().some((u) => c.missing(u) > u.maxHealth * 0.08);
}

// ----------------------------------------------------------------- review
export type Row = { label: string; value: string; good?: boolean };
const pctOf = (n: number) => `${Math.round(n * 100)}%`;

/** The review rows every healer gets: overhealing, heals on full targets, the tank's danger time, deaths and mana. */
export function healingReview(c: Combat, mainHeal: string): Row[] {
  const k = c.counters;
  const time = k.combatTime ?? 0;
  if (time < 1) return [];
  const healed = k.healing ?? 0;
  const over = k.overheal ?? 0;
  const overPct = healed + over > 0 ? over / (healed + over) : 0;
  const rows: Row[] = [
    { label: 'Overhealing', value: pctOf(overPct), good: overPct <= 0.35 },
    { label: 'Heals on a full target', value: String(k.healsOnFull ?? 0), good: (k.healsOnFull ?? 0) === 0 },
  ];
  if (c.allies.length) {
    rows.push({ label: 'Tank under 40% health', value: `${Math.round(k.tankLow ?? 0)} s (${pctOf((k.tankLow ?? 0) / time)})`, good: (k.tankLow ?? 0) / time < 0.1 });
    rows.push({ label: 'Deaths in your party', value: String(k.deaths ?? 0), good: (k.deaths ?? 0) === 0 });
  }
  if ((k.shielding ?? 0) > 0) rows.push({ label: 'Damage your shields soaked', value: fmt(Math.round(k.damageAbsorbed ?? 0)) });
  if (!c.manaLocked) {
    rows.push({ label: 'Time regenerating Spirit mana', value: pctOf((k.regenTime ?? 0) / time) });
    if (c.raid.has('judgementOfWisdom')) rows.push({ label: 'Mana from Judgement of Wisdom', value: `+${Math.round(k.manaOnHit ?? 0)}` });
    const a = c.ability(mainHeal);
    const low = k.lowMana ?? 0;
    if (a) rows.push({ label: `Time without mana for ${a.name}`, value: `${Math.round(low)} s (${pctOf(low / time)})`, good: low / time < 0.1 });
  }
  return rows;
}

/** Uptime of a heal over time on the tank, for the review. */
export function tankUptime(c: Combat, id: string): number {
  const time = c.counters.combatTime ?? 0;
  return time > 0 ? Math.min(1, (c.counters[`uptime:tank:${id}`] ?? 0) / time) : 0;
}

// --------------------------------------------------------------- settings
/** The mana options every healer has. */
export const MANA_OPTIONS: SettingField[] = [
  { key: 'lockMana', name: 'Lock your mana (spells cost nothing)', kind: 'toggle' },
  { key: 'mana', name: 'Mana pool', kind: 'number', step: 100 },
  { key: 'spirit', name: 'Spirit (regeneration outside the five-second rule)', kind: 'number', step: 1 },
  { key: 'mp5', name: 'Mana per 5 sec from gear', kind: 'number', step: 1 },
];

export const HEALER_SHEET: Spec['sheet'] = { attackPower: false, crit: false, hit: false, spellCrit: 'Spell crit (gear + Intellect)', spellPower: 'Healing power (spell power)', mainHand: false, offHand: false };

/** The paragraph every healer's help page shares. */
export const HELP_HEALING = `Your party stands with you: a tank in front of the dummy, a rogue beside them, a mage and a hunter at range. The dummy hurts them (Settings → The dummy attacks your party): steady blows on the tank, spiky blows with crits and crushing blows, or raid-style damage with splashes and a blast on everyone every 15 sec. The blows start with your first heal or when the pull countdown ends, and Reset stops them. Click a party member, or press F1 to F5 (F1 is you), to target them; a heal cast with no party member targeted lands on you, as in WoW. Heals never miss and crit for 1.5x. What the target was not missing is overhealing: the rotation panel counts it, with your heals and crits per spell, deaths and the mana you had left. There is no healing meter on purpose.
    Mana is your resource. Spirit regeneration stops for 5 sec after you spend mana (a talent keeps a share while casting); Blessing of Wisdom and Mana Spring Totem are on by default under Raid buffs and debuffs, Major Mana Potions are on your bar, and you can lock your mana in Settings.`;

/** Talent-gated ability pieces. */
export const needs = (ok: (c: Combat) => boolean, name: string) => ({
  requirements: (c: Combat) => (ok(c) ? null : `Requires the ${name} talent`),
  usable: (c: Combat) => ok(c),
});

/** Spends an Inner Focus-style charge on the player: free cast and extra crit on a non-periodic heal. */
export function spendFocus(c: Combat, id: string, crit: number): number {
  if (!c.aura(c.player, id)) return 0;
  c.removeAura(c.player, id);
  c.count(`${id}Used`);
  return crit;
}

/** Shields on a party member stack by refreshing to the larger amount (Divine Aegis adds up to its cap). */
export function addShield(c: Combat, t: Unit, id: string, name: string, icon: string, amount: number, duration: number, cap = Infinity): void {
  const old = c.aura(t, id);
  const total = Math.min(cap, (old?.absorb ?? 0) + amount);
  c.applyAura(t, { id, name, icon, duration, absorb: total });
}

/** The default party: a warrior tank in melee, a rogue beside them, a mage at range. Health is a level 60 raid-buffed guess (Settings changes it). */
export function defaultParty(tankHealth: number, memberHealth: number): Unit[] {
  const mk = (id: number, name: string, role: Unit['role'], health: number, x: number, z: number): Unit => ({
    id, name, level: 60, health, maxHealth: health, armor: 0, auras: new Map(), x, z, facing: 0, radius: 0.5, friendly: true, role,
  });
  return [
    mk(100, 'Tank', 'tank', tankHealth, 1.15, -1.2),
    mk(101, 'Rogue', 'melee', memberHealth, -1.5, -1.3),
    mk(102, 'Mage', 'ranged', memberHealth, 3.2, -7.5),
    mk(103, 'Hunter', 'ranged', memberHealth, -3.4, -7.8),
  ];
}
