// 4세대 배틀 구현 등록소 (COPYRIGHT.md §2.9 · DEPLOY.md §4)
//
// **왜 이 층이 있나.** 배틀 심판은 `@pkmn/sim`의 엔진이 맡는데, 그 패키지는
// 엔진 코드와 포켓몬 **데이터**를 한 파일에 담고 있다. MIT는 코드에 대한
// 라이선스지 그 안의 게임 데이터를 우리가 배포할 권리를 주지 않는다.
//
// 그래서 둘을 가른다:
//
//   · **수치·이름** → 사용자의 롬에서. `provider.ts`가 채운다
//   · **효과 구현** → 여기. `vendor/*.gen.ts`가 원문 그대로 들고 있다
//
// 이 파일은 그 둘을 합치는 규칙만 적는다.
import { ABILITY_MECHANICS } from './vendor/abilities.gen'
import { CONDITIONS } from './vendor/conditions.gen'
import { ITEM_MECHANICS } from './vendor/items.gen'
import { MOVE_MECHANICS } from './vendor/moves.gen'
import { RULESETS } from './vendor/rulesets.gen'
import { SCRIPTS } from './vendor/scripts.gen'
import { SPECIES_MECHANICS } from './vendor/species.gen'
import { TYPE_MECHANICS } from './vendor/types.gen'

/**
 * 구현 한 조각. 콜백과 선언형 효과가 섞여 있다.
 *
 * 모양을 더 조이지 않는다 — sim의 표는 항목마다 칸이 다르고, 여기서 좁게
 * 적으면 생성물이 바뀔 때마다 형이 깨진다. 값을 읽는 쪽은 sim이고 그쪽이
 * 자기 형을 갖고 있다
 */
export type Mechanics = Record<string, unknown>

/**
 * 롬에서 온 수치 위에 구현을 얹는다.
 *
 * ⚠️ **롬이 이긴다.** 같은 칸이 양쪽에 있으면 사용자의 롬 값을 쓴다 — 원작이
 * 정답이고 Showdown의 표는 그것을 옮겨 적은 것이기 때문이다. 실측으로 어긋난
 * 자리가 딱 하나 있었다: 참고 있기의 우선도가 롬 +3, Showdown +4다 (4세대는
 * +3이 맞다)
 */
export function withMechanics(rom: Mechanics, mechanics: Mechanics | undefined): Mechanics {
  return mechanics ? { ...mechanics, ...rom } : rom
}

/**
 * 배틀이 들고 있는 **수다의 확률(%)** — 쪽마다 하나 (`sim/session`이 배틀 객체에 붙인다).
 * 없으면 녹음이 없는 페라페의 값(1%)이다
 */
export interface ChatterOdds { chatterOdds?: readonly [number, number] }

/** 녹음이 없는 페라페의 확률 (`chatotCry.chatterChance(0)`) */
const CHATTER_UNRECORDED = 1

/**
 * 수다 (`BtlCmd_CheckChatterActivation`) — 혼란 확률이 **녹음이 정한다**: 1 · 11 · 31%.
 *
 * ⚠️ **sim의 구현을 그대로 두면 한 번도 안 건다.** 그쪽은 `species.name !== 'Chatot'`이면 0으로 만드는데,
 * 우리 표는 이름 자리에 id(`chatot`)를 넣는다(`provider.ts`) — 페라페도 늘 0이었다. 원작은 종족 번호를 보고
 * (`ATTACKING_MON.species == SPECIES_CHATOT`), 변신한 몸이면 안 건다 — 변신은 sim에서 종족이 바뀌므로 id가 같은 뜻이다
 */
function chatterModifyMove(
  this: ChatterOdds,
  move: { secondaries?: { volatileStatus?: string, chance?: number }[] | null },
  pokemon: { species: { id: string }, side: { n: number } },
): void {
  const confusion = move.secondaries?.find((x) => x.volatileStatus === 'confusion')
  if (!confusion) return
  if (pokemon.species.id !== 'chatot') { confusion.chance = 0; return }
  confusion.chance = this.chatterOdds?.[pokemon.side.n === 0 ? 0 : 1] ?? CHATTER_UNRECORDED
}

/**
 * 배틀이 서 있는 땅 (`BattleTerrain` 번호) — 배틀 객체에 붙는다 (`sim/session`).
 * 없으면 평지(0)로 본다
 */
export interface TerrainBattle { terrain?: number }

/**
 * 땅 → 기술·타입·부가효과 (`include/data/terrain/to_move.h` · `to_type.h` ·
 * `to_secondary_effect.h`). 자리는 `enum BattleTerrain` 번호 그대로고,
 * 12(아론 방)부터는 전부 `TERRAIN_SPECIAL`로 접힌다 (`terrain > TERRAIN_SPECIAL`이면 SPECIAL)
 */
const TERRAIN_SPECIAL = 12
const TERRAIN_MOVE = [
  'earthquake', 'earthquake', 'seedbomb', 'seedbomb', 'rockslide', 'rockslide', 'blizzard',
  'hydropump', 'icebeam', 'triattack', 'mudbomb', 'airslash', 'triattack',
] as const
const TERRAIN_TYPE = [
  'Ground', 'Ground', 'Grass', 'Grass', 'Rock', 'Rock', 'Ice',
  'Water', 'Ice', 'Normal', 'Ground', 'Flying', 'Normal',
] as const
/** 비밀의힘의 30% 부가효과. 명중·공격·회피 하락은 한 단계다 */
const TERRAIN_SECONDARY: readonly Record<string, unknown>[] = [
  { boosts: { accuracy: -1 } }, { boosts: { accuracy: -1 } },
  { status: 'slp' }, { status: 'slp' },
  { volatileStatus: 'flinch' }, { volatileStatus: 'flinch' },
  { status: 'frz' },
  { boosts: { atk: -1 } },
  { status: 'frz' },
  { status: 'par' },
  { boosts: { spe: -1 } },
  { boosts: { evasion: -1 } },
  { status: 'par' },
]

function terrainSlot(battle: TerrainBattle): number {
  return Math.min(Math.max(battle.terrain ?? 0, 0), TERRAIN_SPECIAL)
}

/** 자연의힘 (`BtlCmd_GetTerrainMove`) — 땅이 고른 기술을 쓴다 */
function naturePowerHit(this: TerrainBattle & { actions: { useMove: (id: string, user: unknown) => unknown } }, pokemon: unknown): void {
  this.actions.useMove(TERRAIN_MOVE[terrainSlot(this)]!, pokemon)
}

/** 비밀의힘 (`BtlCmd_GetTerrainSecondaryEffect`) — 땅이 부가효과를 고른다 */
function secretPowerModifyMove(this: TerrainBattle, move: { secondaries?: unknown[] | null }): void {
  move.secondaries = [{ chance: 30, ...TERRAIN_SECONDARY[terrainSlot(this)]! }]
}

/** 위장 (`BtlCmd_TryCamouflage`) — 땅의 타입으로 바뀐다. 이미 그 타입이면 실패 */
function camouflageHit(
  this: TerrainBattle & { add: (...args: unknown[]) => void },
  target: { hasType: (t: string) => boolean, setType: (t: string) => boolean },
): boolean | undefined {
  const type = TERRAIN_TYPE[terrainSlot(this)]!
  if (target.hasType(type) || !target.setType(type)) return false
  this.add('-start', target, 'typechange', type)
  return undefined
}

/** 원작 규칙으로 갈아 끼운 기술 효과. sim의 표보다 앞선다 */
const ROM_MOVE_RULES: Record<string, Mechanics> = {
  chatter: { ...MOVE_MECHANICS.chatter, onModifyMove: chatterModifyMove },
  naturepower: { ...MOVE_MECHANICS.naturepower, onHit: naturePowerHit },
  secretpower: { ...MOVE_MECHANICS.secretpower, onModifyMove: secretPowerModifyMove },
  camouflage: { ...MOVE_MECHANICS.camouflage, onHit: camouflageHit },
}

export const MechanicsRegistry = {
  species: (id: string): Mechanics | undefined => SPECIES_MECHANICS[id],
  move: (id: string): Mechanics | undefined => ROM_MOVE_RULES[id] ?? MOVE_MECHANICS[id],
  ability: (id: string): Mechanics | undefined => ABILITY_MECHANICS[id],
  item: (id: string): Mechanics | undefined => ITEM_MECHANICS[id],
  type: (id: string): Mechanics | undefined => TYPE_MECHANICS[id],
  /** 도구는 롬 468종 중 배틀에 나오는 것만 구현이 있다 */
  hasItem: (id: string): boolean => id in ITEM_MECHANICS,
  conditions: CONDITIONS,
  rulesets: RULESETS,
  scripts: SCRIPTS,
}
