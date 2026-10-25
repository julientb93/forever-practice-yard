// Every class and spec the yard can load. The player picks one in Settings;
// the choice is kept in the URL (?class=) and in the browser.
import type { Spec } from '../engine/types';
import { druidBalance, druidBear, druidCat, druidResto } from './druid';
import { hunterBm, hunterMm, hunterSv } from './hunter';
import { mageArcane, mageFire, mageFrost } from './mage';
import { paladinHoly, paladinProt, paladinRet, paladinShock } from './paladin';
import { priestDisc, priestHoly, priestShadow, priestSmite } from './priest';
import { rogue } from './rogue';
import { shamanElemental, shamanEnhancement, shamanResto, shamanTank } from './shaman';
import { warlockAffliction, warlockDemonology, warlockDestruction } from './warlock';
import { warrior } from './warrior';

export const SPECS: Spec[] = [rogue, warrior, druidCat, druidBear, druidBalance, druidResto, paladinRet, paladinProt, paladinShock, paladinHoly, hunterBm, hunterMm, hunterSv, priestShadow, priestSmite, priestHoly, priestDisc, mageArcane, mageFire, mageFrost, warlockAffliction, warlockDemonology, warlockDestruction, shamanElemental, shamanEnhancement, shamanTank, shamanResto];

export function specById(id: string | null | undefined): Spec {
  return SPECS.find((s) => s.id === id) ?? SPECS[0];
}
