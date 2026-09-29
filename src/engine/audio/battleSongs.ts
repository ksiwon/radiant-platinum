// 배틀 곡과 승리 곡 — 트레이너 분류가 고른다 (`enc_effects.c` · `battle_controller_player.c` 4263~4318)
//
// 곡 번호는 두 자료가 함께 확인해 준다: 디컴프 `generated/sdat.txt`를 닻으로 센 번호와 SDAT `SYMB`의 이름이
// 같은 자리다(1117 `SEQ_BATTLE_GYM_LEADER` = `SEQ_BA_GYM` · 1120 `SEQ_BATTLE_CYRUS` = `SEQ_BA_AKAGI` …).
import { wildSongFor } from './songs'

/** `generated/trainer_classes.txt`의 차례 */
export const TRAINER_CLASS = {
  leaderRoark: 62, rival: 63, leaderByron: 64,
  eliteFourAaron: 65, eliteFourBertha: 66, eliteFourFlint: 67, eliteFourLucian: 68, championCynthia: 69,
  commanderMars: 72, galacticGruntMale: 73,
  leaderGardenia: 74, leaderWake: 75, leaderMaylene: 76, leaderFantina: 77, leaderCandice: 78, leaderVolkner: 79,
  galacticBoss: 86, commanderJupiter: 87, commanderSaturn: 88, galacticGruntFemale: 89,
  towerTycoon: 97, hallMatron: 99, factoryHead: 100, arcadeStar: 101, castleValet: 102,
} as const

const SONG = {
  trainer: 1119, gymLeader: 1117, eliteFour: 1136, champion: 1122, rival: 1124,
  galacticGrunt: 1123, galacticCommander: 1134, cyrus: 1120, frontierBrain: 1202,
} as const

/** 승리 곡 (`SEQ_VICTORY_*`) */
export const VICTORY = {
  wild: 1127, trainer: 1128, gymLeader: 1129, champion: 1130, galacticGrunt: 1131, cyrus: 1132,
  eliteFour: 1133, frontierBrain: 1203,
} as const

const C = TRAINER_CLASS
const GYM_LEADERS: ReadonlySet<number> = new Set([
  C.leaderRoark, C.leaderGardenia, C.leaderWake, C.leaderMaylene, C.leaderFantina, C.leaderCandice, C.leaderByron,
  C.leaderVolkner,
])
const ELITE_FOUR: ReadonlySet<number> = new Set([C.eliteFourAaron, C.eliteFourBertha, C.eliteFourFlint, C.eliteFourLucian])
const COMMANDERS: ReadonlySet<number> = new Set([C.commanderMars, C.commanderJupiter, C.commanderSaturn])
const GRUNTS: ReadonlySet<number> = new Set([C.galacticGruntMale, C.galacticGruntFemale])
const FRONTIER_BRAINS: ReadonlySet<number> = new Set([
  C.towerTycoon, C.hallMatron, C.factoryHead, C.arcadeStar, C.castleValet,
])

/** 분류 하나의 곡 (`EncEffects_TrainerClassEffect` → `sEncEffectsTable`) */
function classSong(trainerClass: number): number {
  if (GYM_LEADERS.has(trainerClass)) return SONG.gymLeader
  if (ELITE_FOUR.has(trainerClass)) return SONG.eliteFour
  if (trainerClass === C.championCynthia) return SONG.champion
  if (trainerClass === C.rival) return SONG.rival
  if (trainerClass === C.galacticBoss) return SONG.cyrus
  if (COMMANDERS.has(trainerClass)) return SONG.galacticCommander
  if (GRUNTS.has(trainerClass)) return SONG.galacticGrunt
  if (FRONTIER_BRAINS.has(trainerClass)) return SONG.frontierBrain
  return SONG.trainer
}

interface BattleSongQuery {
  kind: 'wild' | 'trainer' | 'factory' | 'safari'
  /** 첫 상대 트레이너의 분류 (`dto->trainer[1].header.trainerType`). 야생이면 null */
  trainerClass: number | null
  doubles: boolean
  /** 첫 야생의 종족 */
  foeSpecies: number
  mapId: number
}

/**
 * 배틀 곡 (`EncEffects_GetEffectPair` → `EncEffects_BGMForPair`).
 *
 * ⚠️ **차례가 곧 규칙이다.** 시설은 브레인만 제 곡이고 나머지는 트레이너 곡이다. 갤럭시단은 더블이어도
 * 제 곡이다(더블보다 먼저 본다). 더블은 전기 관장 하나만 관장 곡이고 나머지는 트레이너 곡이다 — 원작 주석이
 * 「특별한 트레이너가 더블을 걸면 특별함을 잃는다」는 버그라고 적어 두었고, 플래티넘에서 그런 판은 전기 관장
 * (나무 · 전기의 태그)뿐이라 드러나지 않는다
 */
export function battleSongFor(q: BattleSongQuery): number {
  if (q.kind === 'wild' || q.kind === 'safari') return wildSongFor(q.foeSpecies, q.mapId)
  const song = q.trainerClass === null ? SONG.trainer : classSong(q.trainerClass)
  if (q.kind === 'factory') return song === SONG.frontierBrain ? song : SONG.trainer
  if (song === SONG.galacticGrunt || song === SONG.galacticCommander || song === SONG.cyrus) return song
  if (q.doubles) return q.trainerClass === C.leaderVolkner ? SONG.gymLeader : SONG.trainer
  return song
}

/** 시설 배틀 곡 — 넘어가는 연출의 첫 틱에 튼다 (`FrontierScrCmd_3F` · `FrontierScrCmd_47`) */
export const frontierBattleSong = (brain: boolean): number => (brain ? SONG.frontierBrain : SONG.trainer)

/** 트레이너를 이겼을 때의 곡 (`battle_controller_player.c` — 결판이 난 순간 튼다) */
export function trainerVictorySong(trainerClass: number | null): number {
  if (trainerClass === null) return VICTORY.trainer
  if (GYM_LEADERS.has(trainerClass)) return VICTORY.gymLeader
  if (FRONTIER_BRAINS.has(trainerClass)) return VICTORY.frontierBrain
  if (trainerClass === C.championCynthia) return VICTORY.champion
  if (COMMANDERS.has(trainerClass) || GRUNTS.has(trainerClass)) return VICTORY.galacticGrunt
  if (trainerClass === C.galacticBoss) return VICTORY.cyrus
  if (ELITE_FOUR.has(trainerClass)) return VICTORY.eliteFour
  return VICTORY.trainer
}
