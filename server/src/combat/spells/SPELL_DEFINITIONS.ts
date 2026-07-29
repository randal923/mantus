import type { SpellDefinition } from "../Spell";
import { exevoDisFlamHur } from "./attack/exevo-dis-flam-hur";
import { exevoFlamHur } from "./attack/exevo-flam-hur";
import { exevoFrigoHur } from "./attack/exevo-frigo-hur";
import { exevoGranFlamHur } from "./attack/exevo-gran-flam-hur";
import { exevoGranFrigoHur } from "./attack/exevo-gran-frigo-hur";
import { exevoGranMasFlam } from "./attack/exevo-gran-mas-flam";
import { exevoGranMasFrigo } from "./attack/exevo-gran-mas-frigo";
import { exevoGranMasTera } from "./attack/exevo-gran-mas-tera";
import { exevoGranMasVis } from "./attack/exevo-gran-mas-vis";
import { exevoGranVisLux } from "./attack/exevo-gran-vis-lux";
import { exevoInfirFlamHur } from "./attack/exevo-infir-flam-hur";
import { exevoInfirFrigoHur } from "./attack/exevo-infir-frigo-hur";
import { exevoMasSan } from "./attack/exevo-mas-san";
import { exevoTeraHur } from "./attack/exevo-tera-hur";
import { exevoUlusFrigo } from "./attack/exevo-ulus-frigo";
import { exevoUlusTera } from "./attack/exevo-ulus-tera";
import { exevoVisHur } from "./attack/exevo-vis-hur";
import { exevoVisLux } from "./attack/exevo-vis-lux";
import { exori } from "./attack/exori";
import { exoriAmpVis } from "./attack/exori-amp-vis";
import { exoriCon } from "./attack/exori-con";
import { exoriFlam } from "./attack/exori-flam";
import { exoriFrigo } from "./attack/exori-frigo";
import { exoriGran } from "./attack/exori-gran";
import { exoriGranCon } from "./attack/exori-gran-con";
import { exoriGranFlam } from "./attack/exori-gran-flam";
import { exoriGranFrigo } from "./attack/exori-gran-frigo";
import { exoriGranIco } from "./attack/exori-gran-ico";
import { exoriGranTera } from "./attack/exori-gran-tera";
import { exoriGranVis } from "./attack/exori-gran-vis";
import { exoriHur } from "./attack/exori-hur";
import { exoriIco } from "./attack/exori-ico";
import { exoriInfirCon } from "./attack/exori-infir-con";
import { exoriInfirMin } from "./attack/exori-infir-min";
import { exoriInfirTera } from "./attack/exori-infir-tera";
import { exoriInfirVis } from "./attack/exori-infir-vis";
import { exoriMas } from "./attack/exori-mas";
import { exoriMaxFlam } from "./attack/exori-max-flam";
import { exoriMaxFrigo } from "./attack/exori-max-frigo";
import { exoriMaxTera } from "./attack/exori-max-tera";
import { exoriMaxVis } from "./attack/exori-max-vis";
import { exoriMin } from "./attack/exori-min";
import { exoriMinFlam } from "./attack/exori-min-flam";
import { exoriMoeIco } from "./attack/exori-moe-ico";
import { exoriMort } from "./attack/exori-mort";
import { exoriSan } from "./attack/exori-san";
import { exoriTera } from "./attack/exori-tera";
import { exoriVis } from "./attack/exori-vis";
import { utoriFlam } from "./attack/utori-flam";
import { utoriKor } from "./attack/utori-kor";
import { utoriMort } from "./attack/utori-mort";
import { utoriPox } from "./attack/utori-pox";
import { utoriSan } from "./attack/utori-san";
import { utoriVis } from "./attack/utori-vis";
import { adanaAni } from "./conjuring/adana-ani";
import { adanaMort } from "./conjuring/adana-mort";
import { adanaPox } from "./conjuring/adana-pox";
import { adetaSio } from "./conjuring/adeta-sio";
import { adevoGravFlam } from "./conjuring/adevo-grav-flam";
import { adevoGravPox } from "./conjuring/adevo-grav-pox";
import { adevoGravTera } from "./conjuring/adevo-grav-tera";
import { adevoGravVis } from "./conjuring/adevo-grav-vis";
import { adevoGravVita } from "./conjuring/adevo-grav-vita";
import { adevoIna } from "./conjuring/adevo-ina";
import { adevoMasFlam } from "./conjuring/adevo-mas-flam";
import { adevoMasGravFlam } from "./conjuring/adevo-mas-grav-flam";
import { adevoMasGravPox } from "./conjuring/adevo-mas-grav-pox";
import { adevoMasGravVis } from "./conjuring/adevo-mas-grav-vis";
import { adevoMasHur } from "./conjuring/adevo-mas-hur";
import { adevoMasPox } from "./conjuring/adevo-mas-pox";
import { adevoMasVis } from "./conjuring/adevo-mas-vis";
import { adevoResFlam } from "./conjuring/adevo-res-flam";
import { aditoGrav } from "./conjuring/adito-grav";
import { aditoTera } from "./conjuring/adito-tera";
import { adoriBlank } from "./conjuring/adori-blank";
import { adoriDisMinVis } from "./conjuring/adori-dis-min-vis";
import { adoriFlam } from "./conjuring/adori-flam";
import { adoriFrigo } from "./conjuring/adori-frigo";
import { adoriGranMort } from "./conjuring/adori-gran-mort";
import { adoriInfirMasTera } from "./conjuring/adori-infir-mas-tera";
import { adoriInfirVis } from "./conjuring/adori-infir-vis";
import { adoriMasFlam } from "./conjuring/adori-mas-flam";
import { adoriMasFrigo } from "./conjuring/adori-mas-frigo";
import { adoriMasTera } from "./conjuring/adori-mas-tera";
import { adoriMasVis } from "./conjuring/adori-mas-vis";
import { adoriMinVis } from "./conjuring/adori-min-vis";
import { adoriSan } from "./conjuring/adori-san";
import { adoriTera } from "./conjuring/adori-tera";
import { adoriVis } from "./conjuring/adori-vis";
import { aduraGran } from "./conjuring/adura-gran";
import { aduraVita } from "./conjuring/adura-vita";
import { exetaCon } from "./conjuring/exeta-con";
import { exetaVis } from "./conjuring/exeta-vis";
import { exevoCon } from "./conjuring/exevo-con";
import { exevoConFlam } from "./conjuring/exevo-con-flam";
import { exevoConGrav } from "./conjuring/exevo-con-grav";
import { exevoConHur } from "./conjuring/exevo-con-hur";
import { exevoConMort } from "./conjuring/exevo-con-mort";
import { exevoConPox } from "./conjuring/exevo-con-pox";
import { exevoConVis } from "./conjuring/exevo-con-vis";
import { exevoGranConGrav } from "./conjuring/exevo-gran-con-grav";
import { exevoGranMort } from "./conjuring/exevo-gran-mort";
import { exevoInfirCon } from "./conjuring/exevo-infir-con";
import { exanaFlam } from "./healing/exana-flam";
import { exanaKor } from "./healing/exana-kor";
import { exanaMort } from "./healing/exana-mort";
import { exanaPox } from "./healing/exana-pox";
import { exanaVis } from "./healing/exana-vis";
import { exura } from "./healing/exura";
import { exuraDis } from "./healing/exura-dis";
import { exuraGran } from "./healing/exura-gran";
import { exuraGranIco } from "./healing/exura-gran-ico";
import { exuraGranSan } from "./healing/exura-gran-san";
import { exuraGranSio } from "./healing/exura-gran-sio";
import { exuraGranTio } from "./healing/exura-gran-tio";
import { exuraIco } from "./healing/exura-ico";
import { exuraInfir } from "./healing/exura-infir";
import { exuraInfirIco } from "./healing/exura-infir-ico";
import { exuraMaxVita } from "./healing/exura-max-vita";
import { exuraMedIco } from "./healing/exura-med-ico";
import { exuraSan } from "./healing/exura-san";
import { exuraSio } from "./healing/exura-sio";
import { exuraTioSio } from "./healing/exura-tio-sio";
import { exuraVita } from "./healing/exura-vita";
import { utura } from "./healing/utura";
import { uturaGran } from "./healing/utura-gran";
import { antidoteRune } from "./runes/antidote-rune";
import { avalancheRune } from "./runes/avalanche-rune";
import { explosionRune } from "./runes/explosion-rune";
import { fireballRune } from "./runes/fireball-rune";
import { greatFireballRune } from "./runes/great-fireball-rune";
import { heavyMagicMissileRune } from "./runes/heavy-magic-missile-rune";
import { holyMissileRune } from "./runes/holy-missile-rune";
import { icicleRune } from "./runes/icicle-rune";
import { intenseHealingRune } from "./runes/intense-healing-rune";
import { lightMagicMissileRune } from "./runes/light-magic-missile-rune";
import { lightestMagicMissileRune } from "./runes/lightest-magic-missile-rune";
import { lightestMissileRune } from "./runes/lightest-missile-rune";
import { paralyzeRune } from "./runes/paralyze-rune";
import { soulfireRune } from "./runes/soulfire-rune";
import { stalagmiteRune } from "./runes/stalagmite-rune";
import { stoneShowerRune } from "./runes/stone-shower-rune";
import { suddenDeathRune } from "./runes/sudden-death-rune";
import { thunderstormRune } from "./runes/thunderstorm-rune";
import { ultimateHealingRune } from "./runes/ultimate-healing-rune";
import { exanaAmpRes } from "./support/exana-amp-res";
import { exanaIna } from "./support/exana-ina";
import { exanaVita } from "./support/exana-vita";
import { exaniHur } from "./support/exani-hur";
import { exaniTera } from "./support/exani-tera";
import { exetaAmpRes } from "./support/exeta-amp-res";
import { exetaRes } from "./support/exeta-res";
import { exevoPan } from "./support/exevo-pan";
import { exoriKor } from "./support/exori-kor";
import { exoriMasRes } from "./support/exori-mas-res";
import { exoriMoe } from "./support/exori-moe";
import { utamoTempo } from "./support/utamo-tempo";
import { utamoVita } from "./support/utamo-vita";
import { utanaVid } from "./support/utana-vid";
import { utaniGranHur } from "./support/utani-gran-hur";
import { utaniHur } from "./support/utani-hur";
import { utaniTempoHur } from "./support/utani-tempo-hur";
import { utetaTio } from "./support/uteta-tio";
import { utevoGranLux } from "./support/utevo-gran-lux";
import { utevoLux } from "./support/utevo-lux";
import { utevoRes } from "./support/utevo-res";
import { utevoResIna } from "./support/utevo-res-ina";
import { utevoVisLux } from "./support/utevo-vis-lux";
import { utitoTempo } from "./support/utito-tempo";

/**
 * Every spell and rune the server can cast. Each entry lives in its own file
 * under `spells/<category>/<spell-id>.ts` and is free to diverge from Canary;
 * `content/spells/canary-spells.json` is kept only as the upstream reference
 * to diff against.
 */
export const SPELL_DEFINITIONS: ReadonlyArray<SpellDefinition> = [
  exevoDisFlamHur,
  exevoFlamHur,
  exevoFrigoHur,
  exevoGranFlamHur,
  exevoGranFrigoHur,
  exevoGranMasFlam,
  exevoGranMasFrigo,
  exevoGranMasTera,
  exevoGranMasVis,
  exevoGranVisLux,
  exevoInfirFlamHur,
  exevoInfirFrigoHur,
  exevoMasSan,
  exevoTeraHur,
  exevoUlusFrigo,
  exevoUlusTera,
  exevoVisHur,
  exevoVisLux,
  exori,
  exoriAmpVis,
  exoriCon,
  exoriFlam,
  exoriFrigo,
  exoriGran,
  exoriGranCon,
  exoriGranFlam,
  exoriGranFrigo,
  exoriGranIco,
  exoriGranTera,
  exoriGranVis,
  exoriHur,
  exoriIco,
  exoriInfirCon,
  exoriInfirMin,
  exoriInfirTera,
  exoriInfirVis,
  exoriMas,
  exoriMaxFlam,
  exoriMaxFrigo,
  exoriMaxTera,
  exoriMaxVis,
  exoriMin,
  exoriMinFlam,
  exoriMoeIco,
  exoriMort,
  exoriSan,
  exoriTera,
  exoriVis,
  utoriFlam,
  utoriKor,
  utoriMort,
  utoriPox,
  utoriSan,
  utoriVis,
  adanaAni,
  adanaMort,
  adanaPox,
  adetaSio,
  adevoGravFlam,
  adevoGravPox,
  adevoGravTera,
  adevoGravVis,
  adevoGravVita,
  adevoIna,
  adevoMasFlam,
  adevoMasGravFlam,
  adevoMasGravPox,
  adevoMasGravVis,
  adevoMasHur,
  adevoMasPox,
  adevoMasVis,
  adevoResFlam,
  aditoGrav,
  aditoTera,
  adoriBlank,
  adoriDisMinVis,
  adoriFlam,
  adoriFrigo,
  adoriGranMort,
  adoriInfirMasTera,
  adoriInfirVis,
  adoriMasFlam,
  adoriMasFrigo,
  adoriMasTera,
  adoriMasVis,
  adoriMinVis,
  adoriSan,
  adoriTera,
  adoriVis,
  aduraGran,
  aduraVita,
  exetaCon,
  exetaVis,
  exevoCon,
  exevoConFlam,
  exevoConGrav,
  exevoConHur,
  exevoConMort,
  exevoConPox,
  exevoConVis,
  exevoGranConGrav,
  exevoGranMort,
  exevoInfirCon,
  exanaFlam,
  exanaKor,
  exanaMort,
  exanaPox,
  exanaVis,
  exura,
  exuraDis,
  exuraGran,
  exuraGranIco,
  exuraGranSan,
  exuraGranSio,
  exuraGranTio,
  exuraIco,
  exuraInfir,
  exuraInfirIco,
  exuraMaxVita,
  exuraMedIco,
  exuraSan,
  exuraSio,
  exuraTioSio,
  exuraVita,
  utura,
  uturaGran,
  antidoteRune,
  avalancheRune,
  explosionRune,
  fireballRune,
  greatFireballRune,
  heavyMagicMissileRune,
  holyMissileRune,
  icicleRune,
  intenseHealingRune,
  lightMagicMissileRune,
  lightestMagicMissileRune,
  lightestMissileRune,
  paralyzeRune,
  soulfireRune,
  stalagmiteRune,
  stoneShowerRune,
  suddenDeathRune,
  thunderstormRune,
  ultimateHealingRune,
  exanaAmpRes,
  exanaIna,
  exanaVita,
  exaniHur,
  exaniTera,
  exetaAmpRes,
  exetaRes,
  exevoPan,
  exoriKor,
  exoriMasRes,
  exoriMoe,
  utamoTempo,
  utamoVita,
  utanaVid,
  utaniGranHur,
  utaniHur,
  utaniTempoHur,
  utetaTio,
  utevoGranLux,
  utevoLux,
  utevoRes,
  utevoResIna,
  utevoVisLux,
  utitoTempo,
];
