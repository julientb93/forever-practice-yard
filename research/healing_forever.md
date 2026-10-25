# Healing data sheet for WoW Forever (level 60): Priest Holy and Discipline, Druid Restoration, Shaman Restoration, Paladin Holy

Research date: 25 Oct 2026. The machine-readable version is `healing_forever.json` in this folder. Every number there has a source and a confidence label. It covers the healing spells the five healing specs use in the yard, the healing rules the yard applies, the talents it models, the builds, the priority lists behind the yellow glow and the cue, the party the dummy hurts, and what is left out. Damage, tanking and the DPS hybrids are in the class sheets (`priest_forever.md`, `druid_forever.md`, `shaman_forever.md`, `paladin_forever.md`).

## The five things that matter most

1. **The numbers are the client's.** Base healing, variance, healing power coefficient, mana, cast time, cooldown, range, tick period and duration come from the Forever beta client rows (build 1.60.1.70450, read through wago.tools), checked against Wowhead Forever tooltips. The row's base is the spell's minimum and the maximum is base × (1 + variance). Healing Touch rank 11 heals 2332–2719 + 100% of healing power for 840 mana over 3.5 s; Greater Heal rank 5 1960–2175 + 85.7% for 710; Holy Light rank 9 1580–1749 + 71.4% for 660; Chain Heal rank 3 (the last rank at 60) 490–555 + 71.4% and jumps twice at 50%.
2. **Healing power is spell power.** Forever gear carries one spell power number (the sims' modelled items say "+17 SP"); foreversim keeps a separate healing stat but every heal reads the same coefficient. The yard reads your spell power as healing power and adds Spiritual Guidance's share of Spirit (priest). Heals never miss and crit for 1.5x (Classic; foreversim applies the default spell crit multiplier to heals). Ticks of heals over time re-read healing power and can crit (foreversim rolls heal crits on Renew ticks; no Forever log confirms it).
3. **The talents are new.** Prayer of Mending (Holy 31) heals the next five party members the dummy hurts; Light's Vigil (Paladin Holy 31) makes the next Holy Shock on its target free of its cooldown and heal the party; Riptide (Shaman 31) is an instant heal over time that makes Chain Heal 25% stronger on that target; Wild Growth (Druid 31) heals the party over 7 s, most at first; Renewed Hope, Divine Aegis, Soul Warding, Litany of Light, Twin Disciplines, Gift of the Earthmother, Nature's Splendor, Genesis, Water Shield, Infusion of Light, Holy Power and Illumination at 100% are in. Their values are gunba's tree curves (the layout the yard draws), which the client's Classic-era Talent table does not hold: **sim-provisional** unless a client spell row backs them.
4. **One healer runs dry.** With the DPS sheets' Intellect gear read as healing power (205–230), a 4,000–4,500 mana pool, Spirit regeneration under the five-second rule and Blessing of Wisdom and Mana Spring on, a healer sustains about 200 effective healing per second over a few minutes before the mana runs out (`tools/engine_check.ts`: 41,000–46,000 healing in 150 s on the default blows with a few hundred mana left). The dummy's blows on the party default to 600 every 2.5 s on the tank (spiky: 15% crits, 20% crushing blows), a little above that: raise them for a sprint, lower them to learn the rhythm.
5. **The Season of Discovery rows are not Forever's.** Lifebloom, Nourish, Circle of Healing, Pain Suppression, Earth Shield, Sacred Shield and Beacon of Light sit in the class skill lines in the client, but Wowhead prints them at "Requires level 1" with rune-style scaling formulas, no trainer rank teaches them (SkillLineAbility AcquireMethod 3) and gunba's trees have no talent for them. The yard leaves them out.

## Sources

| Id | Source | Version read |
|---|---|---|
| client | Forever beta client DB2 rows through [wago.tools](https://wago.tools/db2/SpellEffect?build=1.60.1.70450): SpellEffect, SpellPower, SpellMisc, SpellCastTimes, SpellDuration, SpellLevels, SpellName, SkillLineAbility, SkillLine, SpellClassOptions, PlayerExpectedStat, ChrClasses (local extract in `ClassScaling/db2`), plus SpellCooldowns, SpellRange, SpellAuraOptions, SpellTargetRestrictions, Spell, Talent fetched for the same build | build 1.60.1.70450 |
| wowhead | Wowhead Forever tooltips (`nether.wowhead.com/forever/tooltip/spell/<id>`) | 21 ids read 25 Oct 2026 |
| wf | [wowsims/forever](https://github.com/wowsims/forever) (MIT), the upstream foreversim forks: the same healer code (its paladin heals make 0.25 threat a point healed, with a test), the same older-tree test talent strings, no healer APL | commit `8e32acca79`, 25 Oct 2026 |
| ss | [SixtySim](https://sixtysim.com/method/): a fork of wowsims/forever (commit `e0085e8`, 19 Oct 2026) that searches gear, talents and rotations for every spec and ranks healers by healing per second on one target or a party of five over the fight's mana. "The engine only has the paladin's heals; the other healers' heals are ours." It leaves out the spell ranks raid books teach, so its rotations cast Greater Heal 4, Renew 9, Healing Touch 10, Rejuvenation 10, Healing Wave 9 and Holy Light 8; it does not model Inspiration, Prayer of Mending, Binding Heal, Ancestral Healing or healer set bonuses. Its bench digests (`/app-assets/digests_bench60-*.js`, `digests_bench120-*.js`) hold the tuned talent strings, rotations and healing per spell | method page and digests of 19 Oct 2026, read 25 Oct |
| gs | [gunba/wow-forever-sim](https://github.com/gunba/wow-forever-sim) (MIT): `ui/core/talents/trees/*.json` (the trees), `sim/core/base_stats.go` (crit per Intellect), `sim/priest/healing` (a wowsims/classic stub: commented-out WotLK heals; no healer APL) | commit `bb5811b3af`, 24 Oct 2026 |
| fs | [laurencestokes/foreversim](https://github.com/laurencestokes/foreversim) (MIT): healer specs for priest, druid, paladin and shaman on the client rows (`sim/priest/*.go`, `sim/paladin/holy_light.go`, `flash_of_light.go`, `holy_shock.go`, `divine_favor.go`, `talents_holy.go`, `sim/shaman/shields.go`, `talents_restoration.go`, `sim/druid/natures_swiftness.go`); the druid healing talents, Riptide and the shaman heals are TODO or disabled (`_heals.go` holds WotLK numbers); no healer APL; its test talent strings are on older tree shapes, only the Disc preset decodes | commit `10205cb9bc`, 22 Oct 2026 |
| ours | this yard: `src/engine/combat.ts` (party, heals, overhealing), `src/specs/healing.ts` (heal rolls, hints, review), `src/specs/<class>/*.ts` | branch `healing-specs` |

Wowhead's level-60 tooltips print a few percent under the client rows for Holy Light (1524–1694 vs 1580–1749) and Chain Heal (474–539 vs 490–555); the sims use the rows, so does the yard.

## Confidence labels

- **confirmed-forever**: the Forever client rows (build 1.60.1.70450) or a Wowhead Forever tooltip, or both.
- **sim-provisional**: a choice of ours or of a sim with no Forever source yet, or a value the sources disagree on. Use it, but expect it to change.
- **classic-fallback**: Forever data is silent, so the Classic 1.12 rule is kept.

## Core rules

| Rule | Value | Confidence |
|---|---|---|
| Healing power | Spell power from gear (one number in Forever) + flat talent bonuses (Spiritual Guidance: up to 25% of Spirit). Judgement of Wisdom gives a healer nothing | sim-provisional |
| Heal crit | 1.5x; the chance is the sheet's spell crit + healing talents + Moonkin Aura. Base spell crit 0.8% priest, 1.8% druid, 2.3% shaman, 3.5% paladin; about 60 Intellect per 1% (client PlayerExpectedStat 0.000167–0.000169 per point, gs agrees). Ticks roll a crit like a direct heal (fs, wf; SixtySim: "heals over time can critically strike", and its Renew, Riptide and Wild Growth digests show crit ticks) | classic-fallback / confirmed / provisional |
| Misses | Heals cannot miss or be resisted | classic-fallback |
| Overhealing | What the target was not missing; counted per spell and in total. A shield (Power Word: Shield, Divine Aegis) counts in full and never overheals | sim-provisional |
| Heals over time | Ticks re-read healing power (no snapshot, as Forever's DoTs). Recasting restarts the heal and loses the pending tick | sim-provisional / classic-fallback |
| Global cooldown | 1.5 s, shorter with casting haste down to 1.0 s. Gift of the Earthmother: 1.0 s on Rejuvenation, Swiftmend and Wild Growth. Totems 1.0 s. Off the GCD: Inner Focus, Power Infusion, Divine Favor, Nature's Swiftness | confirmed |
| Mana | Base mana 1376 priest, 1244 druid, 1520 shaman, 1512 paladin (client PlayerExpectedStat) + 15 per Intellect. Spirit regeneration 6.25 + Spirit/8 per second stops for 5 s after a spell costs mana (gs's formula; SixtySim credits it every tenth of a second); Meditation, Reflection, Mindfulness and Reverence keep a share while casting; MP5 always; Innervate x5 and all of it | confirmed / sim-provisional |
| Low-rank penalty | A rank loses 5% of its spell power for each level you are more than 12 past its maximum level (SixtySim); at 60 the ranks learned from about level 43 keep it all. None of the yard's heals is affected (its lowest rank is Chain Heal 3, level 54) | sim-provisional |
| Ranks | The yard casts the top rank in the client (Greater Heal 5, Renew 10, Prayer of Healing 5, Healing Touch 11, Rejuvenation 11, Healing Wave 10, Holy Light 9). SixtySim leaves out the ranks raid books teach and casts Greater Heal 4 (1782 + 0.857 for 655 mana), Renew 9 (134 per tick), Healing Touch 10 (1920 + 1.0 for 755), Rejuvenation 10 (161 per tick for 335), Healing Wave 9 (1344 + 0.857 for 560) and Holy Light 8 (1217 + 0.714 for 580). In Classic the top ranks came from raid and reputation books; whether Forever teaches them at a trainer is open | sim-provisional |
| Heal threat | Holy Light, Flash of Light and Holy Shock's heal make 0.25 threat a point healed, half of other heals (wowsims/forever, with a test); not modelled, the dummy has no aggro | sim-provisional |
| Percentage costs | Swiftmend 20% of base mana (249), Divine Favor 4% (60), Power Infusion 20% (275), Innervate 5% (62) | confirmed |

## The party and the dummy's blows (the yard)

Your party: a Tank (6,500 health) in melee next to the dummy, a Rogue (3,800) beside them, a Mage and a Hunter (3,800) at range, and you. Level 60 raid-buffed guesses; Settings changes the health. Heals land on your target when it is a party member, else on you (WoW's self-cast); F1 targets you, F2 to F5 the party; click a party member in the frame or their dummy.

The blows start with your first heal or when the pull countdown ends, and Reset stops them. Default: 600 damage (after armor) on the tank every 2.5 s.

| Profile | What happens | Average damage |
|---|---|---|
| Steady | The blow × U(0.9, 1.1) on the tank | 240 per second on the tank |
| Spiky (default) | The blow × U(0.85, 1.15) with 15% crits (×2) and 20% crushing blows (×1.5) | about 300 per second, in bursts |
| Raid-style | 0.6 × the blow on the tank (12% crushing), 0.4 × the blow on a random member 40% of the time, 0.45 × the blow on everyone (you too) every 15 s | about 150 on the tank, 40 on a random member, 90 spread over everyone |

A member at 0 health is dead for 6 s (counted as a death), then back on their feet. All of this is **sim-provisional**: the yard's own model.

## Abilities (max rank at 60)

Costs, cast times, cooldowns, ranges, base values, variances and coefficients are client rows checked against Wowhead (**confirmed-forever**) unless the Notes say otherwise. "HP" = healing power. Base–max = base × (1 + variance).

### Priest

| Ability | Id | Icon | Mana | Cast / CD | Effect at 60 | Notes |
|---|---|---|---|---|---|---|
| Flash Heal r7 | 10917 | spell_holy_flashheal | 380 | 1.5 s | 825–961 + 0.429 HP | The quick heal; last rank at 60 |
| Greater Heal r5 | 25314 | spell_holy_greaterheal | 710 | 3.0 s (2.5 with Divine Fury 5/5) | 1960–2175 + 0.857 HP | Improved Healing -5%/pt cost |
| Renew r10 | 25315 | spell_holy_renew | 410 | instant | 5 ticks × (166 + 0.2 HP) every 3 s | A second rank-10 row 425277 (194 at 0.23) sits in the skill line with AcquireMethod 3; fs and Wowhead's trained rank use 25315. Open question |
| Prayer of Healing r5 | 25316 | spell_holy_prayerofhealing | 1070 | 3.0 s | 649–684 + 0.286 HP on every party member | |
| Prayer of Mending r3 (Holy 31) | 1240827 | spell_holy_prayerofmendingtga | 390 | instant / 10 s | 413 + 0.429 HP when the bearer is hurt, then jumps up to 5 times (30 s each, 20 yd) | The yard jumps to the most hurt other member (provisional). Improved Healing and Mental Agility lower the cost |
| Power Word: Shield r10 | 10901 | spell_holy_powerwordshield | 500 | instant / 4 s | absorbs 928 + 0.1 HP for 30 s; Weakened Soul 15 s | Improved PW:S +7/14/20%, Soul Warding: no cooldown, -15% cost; Twin Disciplines +1%/pt. Wowhead prints 950 |
| Penance r4 (Discipline 21), heal | 1316995 | spell_holy_penance | 385 | 2 s channel / 12 s | 3 bolts × (425 + 0.19 HP) at 0, 1 and 2 s | Row 1316991; each bolt its own crit; 36 yd |
| Binding Heal r6 (Holy talent) | 1240774 | spell_holy_blindingheal | 380 | 1.5 s | 825–961 + 0.429 HP on the target and on you | Low threat |
| Holy Nova r6 (Holy talent), heal | 27801 | spell_holy_holynova | 750 | instant | 311–357 + 0.107 HP on party members within 10 yd (row 27805) | The damage half is in the Smite sheet |
| Desperate Prayer r7 | 19243 | spell_holy_restoration | 0 | instant / 10 min | 1383–1611 + 0.429 HP on you | In every priest's Holy line in the client; Classic: Dwarf and Human. Provisional |
| Inner Focus (Discipline) | 14751 | spell_frost_windwalkon | 0 | 3 min, off the GCD | next spell free, +25% crit if not periodic | |
| Power Infusion (Discipline 31) | 10060 | spell_holy_powerinfusion | 275 | 3 min, off the GCD | +20% healing (and damage) for 15 s | On yourself in the yard |

### Druid

| Ability | Id | Icon | Mana | Cast / CD | Effect at 60 | Notes |
|---|---|---|---|---|---|---|
| Healing Touch r11 | 25297 | spell_nature_healingtouch | 840 | 3.5 s (3.0 with Naturalist 5/5) | 2332–2719 + 1.0 HP | Tranquil Spirit -2%/pt cost; instant with Nature's Swiftness. Coefficient 1.0 from rank 5 up |
| Rejuvenation r11 | 25299 | spell_nature_rejuvenation | 360 | instant | 4 ticks × (194 + 0.2 HP) every 3 s | Improved Rejuvenation +5%/pt; Nature's Splendor +1 tick; Gift of the Earthmother: 1.0 s GCD |
| Regrowth r9 | 9858 | spell_nature_resistnature | 525 | 2.0 s | 1021–1133 + 0.286 HP, then 7 ticks × (142 + 0.071 HP) every 3 s | Improved Regrowth +10%/pt crit; Nature's Splendor +2 ticks |
| Swiftmend (Restoration talent) | 18562 | inv_relics_idolofrejuvenation | 20% base (249) | instant / 15 s | spends your Regrowth (first) or Rejuvenation on the target for the full duration of its ticks at once | Which goes first is our choice (provisional) |
| Wild Growth r3 (Restoration 31) | 1238215 | ability_druid_flourish | 1050 | instant / 6 s | 7 ticks × (97 + 0.033 HP) every 1 s on the party, "quickly at first" | The yard shapes the ticks 1.4x down to 0.6x for the same total (provisional). Wowhead: 769 over 7 s |
| Tranquility r4 | 9863 | spell_nature_tranquility | 925 | 10 s channel / 5 min (3.5 / 2 min with Improved Tranquility) | 5 ticks × (285 + 0.067 HP) every 2 s on the party | Tranquil Spirit -2%/pt cost |
| Nature's Swiftness (Restoration) | 17116 | spell_nature_ravenform | 0 | 3 min, off the GCD | next Nature spell instant | Healing Touch or Regrowth in the yard |
| Innervate | 29166 | spell_nature_lightning | 62 | 6 min | +400% regeneration and all of it while casting, 20 s | As in the Balance sheet |

### Shaman

| Ability | Id | Icon | Mana | Cast / CD | Effect at 60 | Notes |
|---|---|---|---|---|---|---|
| Healing Wave r10 | 25357 | spell_nature_magicimmunity | 620 | 3.0 s (2.5 with Improved Healing Wave 5/5) | 1615–1830 + 0.857 HP | Healing Way +8/17/25%; Tidal Focus -1%/pt cost |
| Lesser Healing Wave r6 | 10468 | spell_nature_healingwavelesser | 380 | 1.5 s | 820–909 + 0.429 HP | |
| Chain Heal r3 | 10623 | spell_nature_healingwavegreater | 405 | 2.5 s | 490–555 + 0.714 HP, then jumps to 2 more targets at 50% each | The last rank at 60 (level 54). The yard picks the two most hurt other members. +25% on a target with your Riptide, not consumed (the tooltip says nothing about consuming it; WotLK did): provisional |
| Riptide r3 (Restoration 31) | 1239243 | spell_nature_riptide | 385 | instant / 6 s | 841–925 + 0.214 HP, then 5 ticks × (161 + 0.1 HP) every 3 s; +25% to your Chain Heal on that target | Wowhead: 838–922 + 953 over 15 s |
| Water Shield (Restoration talent) | 408510 | ability_shaman_watershield | 0 | instant, no cooldown | 3 globes for 10 min: a spell crit of yours (or a hit taken) spends one for 2% of your maximum mana (row 408511), at most every 3.5 s | No cooldown in the client and on Wowhead (the Elemental sheet notes gs's 15 s) |
| Mana Tide Totem r4 (Restoration talent) | 1325256 | spell_frost_summonwaterelemental | 60 | 1.0 s GCD / 5 min | 290 mana every 3 s for 12 s (1,160; row 1325257) to the party | A Water totem: it replaces Mana Spring; Totemic Focus -5%/pt |
| Healing Stream Totem r5 | 10463 | inv_spear_04 | 80 | 1.0 s GCD | 11 + 0.022 HP every 2 s on the party for 5 min (row 10461) | Restorative Totems +10%/pt; tiny |
| Mana Spring Totem r4 | 10497 | spell_nature_manaregentotem | 100 | 1.0 s GCD | 10 mana every 2 s (row 10494) | As in the Elemental sheet |
| Nature's Swiftness (Restoration) | 16188 | spell_nature_ravenform | 0 | 3 min, off the GCD | next Nature spell under 10 s cast instant | |

### Paladin

| Ability | Id | Icon | Mana | Cast / CD | Effect at 60 | Notes |
|---|---|---|---|---|---|---|
| Holy Light r9 | 25292 | spell_holy_holybolt | 660 | 2.5 s (1.5 after a crit with Infusion of Light 2/2) | 1580–1749 + 0.714 HP (+400 with Blessing of Light) | Healing Light +4%/pt. Wowhead prints 1524–1694 |
| Flash of Light r6 | 19943 | spell_holy_flashheal | 140 | 1.5 s | 303–336 + 0.429 HP (+115 with Blessing of Light) | |
| Holy Shock r4 (Holy talent), heal | 20930 | spell_holy_searinglight | 325 | instant / 10 s | 320–345 + 0.429 HP (row 25903) | Holy Power +3%/pt crit; on a Light's Vigil target: no cooldown and a party heal |
| Light's Vigil r3 (Holy 31) | 1311595 | ability_paladin_judgementofthepure | 1340 | 1.5 s / 6 s | marks the target 30 s; your next Holy Shock on them triggers no cooldown and heals their party for 704–744 + 0.143 HP each (row 1311596) | The enemy side is in the paladin sheet; no refund on an ally (Wowhead) |
| Divine Favor (Holy talent) | 20216 | spell_holy_heal | 4% base (60) | 2 min, off the GCD | next Flash of Light, Holy Light or Holy Shock crits | |
| Blessing of Light r3 | 19979 | spell_holy_prayerofhealing02 | 135 | instant | +400 to your Holy Light and +115 to your Flash of Light on the target, 1 h | fs adds the flat bonus before the crit, so does the yard |
| Lay on Hands r3 | 10310 | spell_holy_layonhands | all your mana | 20 min | heals for your maximum health, +550 mana to the target | |

## Talents the yard models

Values from gunba's trees (checked against commit `bb5811b3af` on 25 Oct 2026: the yard's layout matches, only Champion of the Light's values moved); the client's Talent table is Classic-era. **Confirmed** where a client spell row backs the value, else **sim-provisional**.

- **Priest**: Holy Specialization +1%/pt crit on Holy spells; Improved Renew +5/10/15%; Divine Fury -0.1 s/pt on Greater Heal; Improved Healing -5%/pt on Greater Heal, Penance, Prayer of Mending; Spiritual Guidance 5–25% of Spirit as healing power (client 14901: 25 at max rank); Spiritual Healing +3/7/10% (the client row prints 2 per rank; provisional); Litany of Light 5/10% of the base cost back when the heal differs from the last (client rows print 20; Wowhead's talent tooltips are stale; provisional); Twin Disciplines +1%/pt on instant heals and shields (provisional); Mental Agility -3/7/10% on instants; Meditation 17/33/50%; Improved Power Word: Shield +7/14/20%; Soul Warding -4 s cooldown, -15% cost; Renewed Hope +2%/pt crit on direct heals of a Weakened Soul target and -1 s/pt of Weakened Soul per heal (fs); Divine Aegis 5/10/15% of a direct crit heal as a shield up to 1,200 (fs); Inspiration armor aura (cosmetic); Inner Focus; Power Infusion.
- **Druid**: Gift of Nature +2%/pt; Genesis +1%/pt on ticks; Naturalist -0.1 s/pt on Healing Touch; Tranquil Spirit -2%/pt on Healing Touch and Tranquility; Improved Rejuvenation +5%/pt; Improved Regrowth +10%/pt crit; Gift of the Earthmother 1.0 s GCD on Rejuvenation, Swiftmend, Wild Growth; Nature's Splendor +3 s Rejuvenation, +6 s Regrowth; Nature's Majesty +2%/pt crit; Reflection 17/33/50%; Living Spirit +5%/pt Spirit; Improved Tranquility -30/60% cooldown.
- **Shaman**: Purification +2%/pt; Tidal Mastery +1%/pt crit on heals; Tidal Focus -1%/pt cost; Healing Way +8/17/25% Healing Wave; Improved Healing Wave -0.1 s/pt; Mindfulness 17/33/50%; Restorative Totems +5%/pt Mana Spring, +10%/pt Healing Stream; Totemic Focus -5%/pt on totems; Ancestral Healing armor aura (cosmetic); Thundering Strikes +1%/pt crit.
- **Paladin**: Healing Light +4%/pt on Holy Light, Flash of Light, Holy Shock; Illumination 20%/pt chance on a crit heal for 50% of the base cost (client 20210, fs); Infusion of Light -0.5 s/pt on the next Holy Light after a Holy Shock or Flash of Light crit; Holy Power +3%/pt crit on Holy Shock, +1%/pt on the rest; Reverence 10/20/30%; Divine Favor.

Not modelled: threat (Subtlety, Silent Resolve, Natural Grace, Healing Grace), pushback (Nature's Focus, Healing Focus, Spiritual Focus, Twilight Focus, Martyrdom), Blessed Recovery, Spirit of Redemption, Holy Reach, Searing Light, Mental Strength and Divine Intellect (the sheet already holds your Intellect), Ancestral Knowledge, Improved Reincarnation.

## Builds

All seventeen strings decode on gunba's current trees with the row and prerequisite rules (`tools/engine_check.ts`). Of the sims' own strings only foreversim's Discipline preset and SixtySim's tuned benches decode on the current trees; the first four below are ours (**sim-provisional**).

| Build | Split | String | Source |
|---|---|---|---|
| Priest Holy | 18/33/0 | `00500503113-03505103030121531` | gs's Holy test string's Holy tree (`healing_priest_test.go`) with a legal 18-point Discipline dip (gs's dip predates the Oct 15 rows) |
| Priest Discipline | 32/19/0 | `005025021330011531-335001030301` | fs `ui/specs/priest/healer/presets.ts` |
| Priest Discipline, Divine Fury | 33/18/0 | `005005231330011531-0250500303` | gs's Disc test string, Searing Light 2 moved to Improved Renew 2 so that the Holy rows are legal |
| Druid Restoration | 11/0/40 | `05302001--5050035153113251` | ours; fs's `restoration_test.go` string is on an older tree |
| Druid Restoration, Balance dip | 20/0/31 | `55302001103--5050035103113031` | ours |
| Shaman Restoration | 0/11/40 | `-055001-5530203015513151` | ours; fs's `restoration_test.go` string is on an older tree |
| Shaman Restoration, Elemental dip | 11/0/40 | `5500001--5530203015513151` | ours |
| Paladin Holy | 34/17/0 | `55320013025101051-503250002` | fs `holy_test.go` (`55320030025131051-503050002`), re-pointed: Voice of Truth is a 1-point talent now and Divine Precision does nothing for heals, so Reverence 3 and Guardian's Favor 2 |
| Priest Holy, one target (SixtySim) | 20/31/0 | `00520503113-2350500313001053` | SixtySim 1 min bench, tuned; rotation Greater Heal 4 + Renew 9, 1,310 HPS |
| Priest Holy, party (SixtySim) | 21/30/0 | `00510503133-0350500313002053` | SixtySim; Prayer of Healing 4 then rank 1 with Renew 9 on five, 1,463 HPS |
| Priest Discipline, one target (SixtySim) | 31/19/1 | `005005021332011431-0350500303-001` | SixtySim; Greater Heal 4 + Renew 9, 1,256 HPS |
| Priest Discipline, party (SixtySim) | 32/19/0 | `005005021332011531-0350500303` | SixtySim; Prayer of Healing 4 and 3 with Penance 4, 1,427 HPS |
| Druid Restoration, one target (SixtySim) | 11/3/37 | `05302001-03-5050035143113051` | SixtySim; Healing Touch 10 + Rejuvenation 10 + Regrowth 9 + Swiftmend, 1,393 HPS |
| Druid Restoration, party (SixtySim) | 11/4/36 | `05302001-04-5053035143113011` | SixtySim; Rejuvenation 10 on five, Wild Growth 3, Swiftmend, Regrowth, Healing Touch, 1,891 HPS |
| Shaman Restoration, one target (SixtySim) | 1/10/40 | `1-055-5530400215503151` | SixtySim; Healing Wave 9 + Riptide 3 + Healing Stream Totem 5, 1,410 HPS |
| Shaman Restoration, party (SixtySim) | 1/11/39 | `1-055001-5530300315503051` | SixtySim; Healing Wave 9 + Riptide 3 on five + Healing Stream Totem 5, 1,547 HPS |
| Paladin Holy 38/13 (SixtySim) | 38/13/0 | `25320213225131051-50323` | SixtySim, the same string as foreversim's Holy healer preset; Holy Light 8 (1,117 HPS), or Light's Vigil 3 and Holy Shock 4 then Holy Light 8 for a party (1,125 HPS) |

SixtySim's healing per second comes with full consumables, raid buffs, its own gear search (item level 58–62) and a party of five taking damage; its 2 min benches run 850–1,300 HPS with time without mana (Discipline dry for 16 s, the party druid for 31 s). The yard's party damage defaults (about 300 per second) sit under these because the yard's sheets carry no consumables.

## Priority lists (the glow and the cue)

No sim has a healer priority list; SixtySim's digests give the spells its tuned rotations cast (the builds table), which agree with these on the backbone: a big heal on the tank with Renew, Rejuvenation or Riptide kept up, Prayer of Healing, Wild Growth and Chain Heal for a party, Swiftmend, Light's Vigil with a double Holy Shock. The lists are ours (**sim-provisional**). The yellow glow names the spell, the cue above the bar the target; "low" is the party member missing the largest share of their health.

- **Priest Holy**: mana potion under 30% mana; low under 35%: Flash Heal; Prayer of Mending on the tank when free and on nobody; three or more under 80%: Inner Focus then Prayer of Healing; tank under 70%: Greater Heal; tank without Renew: Renew; low under 75%: Binding Heal when you are hurt too, else Flash Heal; nobody missing more than 8%: nothing.
- **Priest Discipline**: Power Word: Shield on the tank whenever they can be shielded; low under 35%: Penance, else Flash Heal; Prayer of Mending and Prayer of Healing as Holy; tank under 70%: Penance, else Greater Heal; then Renew and Flash Heal as Holy.
- **Druid Restoration**: Innervate under 25% mana, potion under 30%; low under 35%: Swiftmend if they carry your heal over time, else Nature's Swiftness and Healing Touch, else Regrowth; tank without Rejuvenation: Rejuvenation; three or more under 80%: Wild Growth; tank under 70%: Regrowth if it is not ticking, else Healing Touch; low under 75%: Rejuvenation if missing, else Regrowth.
- **Shaman Restoration**: Water Shield when down; Mana Tide under 50% mana, potion under 30%; low under 35%: Nature's Swiftness and Healing Wave, else Lesser Healing Wave; Riptide on the tank when ready and not ticking; three or more under 80%: Chain Heal (on the Riptide target if hurt); tank under 70%: Healing Wave; low under 75%: Riptide, else Lesser Healing Wave; nobody hurt and no Water totem: Healing Stream Totem.
- **Paladin Holy**: Blessing of Light on the tank; Lay on Hands under 15%; low under 35%: Holy Shock, else Flash of Light; Holy Shock on cooldown on the low member under 85% (a Light's Vigil tank first); tank under 75%: Light's Vigil under 65%, Divine Favor under 50%, Holy Light when Infusion of Light is up, the tank is under 60% or missing more than 1,800; low under 80%: Flash of Light.

## Default stats

No sim publishes a Forever healer sheet (fs's gear sets are level 60 blues as a placeholder). The yard reads the DPS sheets' Intellect gear as healing power (**sim-provisional**); change them in Settings.

| Spec | Healing power | Spell crit | Mana | Spirit | MP5 | Health |
|---|---|---|---|---|---|---|
| Priest (Holy, Discipline) | 205 | 10.6% | 4,495 | 145 | 9 | 2,157 |
| Druid Restoration | 230 | 10.2% | 4,024 | 150 | 9 | 2,400 |
| Shaman Restoration | 230 | 11.8% | 4,376 | 140 | 9 | 2,510 |
| Paladin Holy | 230 | 12.5% | 4,200 | 120 | 9 | 2,800 |

Raid buffs on by default: Blessing of Wisdom and Mana Spring Totem (the shaman brings their own Water totem).

## What the yard shows instead of a healing meter

Heals and crits per spell with the share that was overhealing; overhealing in total; heals on a full target; the time the tank spent under 40% health; deaths in your party; damage your shields soaked; the time Spirit regeneration was running; the time without mana for your main heal; and per spec, Renew or Rejuvenation or Riptide uptime on the tank, Prayer of Mending heals, Divine Aegis shields, Swiftmends, Water Shield mana, Mana Tide mana, Holy Shocks freed by Light's Vigil, Illumination mana, Holy Lights sped up by Infusion of Light.

## Engine gaps and open questions

1. Which Renew rank 10 the trainer teaches: 25315 (830 over 15 s) or 425277 (970). fs and Wowhead's trained rank say 25315.
2. Whether heal over time ticks crit in Forever (fs rolls them; the yard follows).
3. Swiftmend's choice when Regrowth and Rejuvenation are both up (the yard spends Regrowth first), and whether Chain Heal consumes Riptide (the yard does not).
4. Wild Growth's tick shape ("quickly at first"): the yard's 1.4x to 0.6x is a guess for the same total.
5. Litany of Light's percentage (gs 5/10, client rows 20) and Spiritual Healing's (gs 3/7/10, client 2 per rank).
6. Healing threat, pushback and the five-second rule's exact server timing are not modelled; the dummy has no aggro.
7. Prayer of Mending's jump target (the yard: the most hurt other member) and its 2.5 s delay in fs (the yard heals at once).
8. Whether Desperate Prayer is a racial in Forever (the client puts it in every priest's Holy line).
9. Whether the Season of Discovery rows (Lifebloom, Nourish, Circle of Healing, Pain Suppression, Earth Shield, Sacred Shield, Beacon of Light) ever reach a trainer or a talent (SixtySim agrees on Shadowfiend: a rune only).
10. Whether the top ranks (Greater Heal 5, Renew 10, Healing Touch 11, Rejuvenation 11, Healing Wave 10, Holy Light 9) come from a trainer in Forever or from raid books as in Classic; SixtySim casts the rank below.
