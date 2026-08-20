// 폼 (PARITY §3.4 · `include/constants/forms.h`)
//
// 열세 종이 한 종족 번호 아래 여러 모습을 갖는다. 그 값이 개체의 `form` 칸이고,
// 이 파일은 그 값을 **읽는 규칙**만 모은다 — 언제 바뀌는가는 부르는 쪽이 안다.
//
// ⚠️ **폼은 PID에서 나오지 않는다.** 3세대의 안농은 PID에서 글자를 뽑았지만
// 4세대는 칸에 적어 두고 그 칸만 본다(`MON_DATA_FORM`은 `dataBlockB->form`을
// 그대로 돌려준다). 야생 안농의 글자도 PID가 아니라 **맵의 표**에서 온다
// (`WildEncounters_UnownTables`) — PID로 다시 세면 잡은 것과 다른 글자가 뜬다.
//
// ⚠️ **폼마다 종족값이 다른 것은 다섯뿐이다.** 테오키스·도롱마담·기라티나·
// 쉐이미·로토무만 `pl_personal`에 제 칸이 있고(494번 뒤), 나머지는 그림만
// 다르다. 그 갈림이 `formSpeciesId`다.
import type { PokemonInstance } from './instance'
import type { TerrainId } from '../battle/terrain'
import { Terrain } from '../battle/terrain'

/** `generated/species.txt` */
export const SPECIES_UNOWN = 201
export const SPECIES_CASTFORM = 351
export const SPECIES_DEOXYS = 386
export const SPECIES_BURMY = 412
export const SPECIES_WORMADAM = 413
const SPECIES_CHERRIM = 421
export const SPECIES_SHELLOS = 422
export const SPECIES_GASTRODON = 423
export const SPECIES_ROTOM = 479
export const SPECIES_GIRATINA = 487
export const SPECIES_SHAYMIN = 492
export const SPECIES_ARCEUS = 493
export const SPECIES_MANAPHY = 490
/** 알 자신도 종족 번호를 갖는다. 아이콘과 그림이 이 번호로 걸린다 */
export const SPECIES_EGG = 494

/**
 * 종족 → 폼 수 (`Pokemon_SanitizeFormId`).
 *
 * 여기 없는 종은 폼이 하나뿐이고, 표에 있어도 **수를 넘는 값은 0으로 접힌다** —
 * 원작이 그렇게 막는다. 그러지 않으면 없는 칸을 읽는다
 */
export const FORM_COUNT: ReadonlyMap<number, number> = new Map([
  [SPECIES_UNOWN, 28],
  [SPECIES_CASTFORM, 4],
  [SPECIES_DEOXYS, 4],
  [SPECIES_BURMY, 3],
  [SPECIES_WORMADAM, 3],
  [SPECIES_CHERRIM, 2],
  [SPECIES_SHELLOS, 2],
  [SPECIES_GASTRODON, 2],
  [SPECIES_ROTOM, 6],
  [SPECIES_GIRATINA, 2],
  [SPECIES_SHAYMIN, 2],
  [SPECIES_ARCEUS, 18],
  [SPECIES_EGG, 2],
])

/** 그 종이 가질 수 있는 폼 수. 하나뿐이면 1 */
export function formCount(species: number): number {
  return FORM_COUNT.get(species) ?? 1
}

/**
 * 폼 값을 그 종의 범위로 접는다 (`Pokemon_SanitizeFormId`).
 *
 * 넘치면 자르는 것이 아니라 **0으로 되돌린다**. 로토무 폼 7을 5로 자르면
 * 잔디깎이가 되는데, 원작은 보통 모습으로 돌린다
 */
export function sanitizeForm(species: number, form: number): number {
  if (!Number.isInteger(form) || form < 0) return 0
  return form < formCount(species) ? form : 0
}

// ── 폼마다 종족값이 다른 다섯 (`Pokemon_GetFormNarcIndex`) ────────────────────

/**
 * 폼의 종족 자료 번호.
 *
 * `pl_personal`은 494칸 뒤에 폼 열둘을 더 들고 있다. 494·495는 알과 나쁜알이라
 * 비어 있고 **496부터**가 폼이다:
 *
 *   496~498 테오키스 어택·디펜스·스피드 · 499~500 도롱마담 모래·쓰레기
 *   501 기라티나 어나더(원작 차례로는 오리진) · 502 쉐이미 스카이
 *   503~507 로토무 히트·워시·프로스트·팬·모우
 *
 * ⚠️ **표를 안 거치면 폼이 겉모습뿐이 된다.** 도롱마담 쓰레기의 방어가 95인데
 * 105로 서고, 기라티나 오리진이 어나더의 종족값으로 싸운다
 */
export function formSpeciesId(species: number, form: number): number {
  const at = sanitizeForm(species, form)
  if (at === 0) return species
  switch (species) {
    case SPECIES_DEOXYS: return 495 + at
    case SPECIES_WORMADAM: return 498 + at
    case SPECIES_GIRATINA: return 500 + at
    case SPECIES_SHAYMIN: return 501 + at
    case SPECIES_ROTOM: return 502 + at
    default: return species
  }
}

/** 그 종이 폼마다 다른 종족값을 갖는가 */
export function hasFormStats(species: number): boolean {
  return species === SPECIES_DEOXYS || species === SPECIES_WORMADAM
    || species === SPECIES_GIRATINA || species === SPECIES_SHAYMIN
    || species === SPECIES_ROTOM
}

// ── 아이콘 (`PokeIconSpriteIndex`) ────────────────────────────────────────────

/**
 * 아이콘 아틀라스의 칸 번호.
 *
 * 앞 495칸이 종족 순서(494 = 알)고 그 뒤 45칸이 폼이다 — 차례는
 * `res/pokemon/meson.build`의 `poke_icon_files`가 정한다.
 *
 * ⚠️ **폼 아이콘이 있는 종은 아홉뿐이다.** 캐스퐁·체리버·아르세우스는 그림은
 * 달라도 아이콘이 하나라서, 여기서 그 셋을 빼먹는 것이 맞다
 */
export const ICON_MANAPHY_EGG = 495
const ICON_DEOXYS_ATTACK = 496
const ICON_UNOWN_B = 500
const ICON_BURMY_SANDY = 527
const ICON_WORMADAM_SANDY = 529
const ICON_SHELLOS_EAST = 531
const ICON_GASTRODON_EAST = 532
const ICON_GIRATINA_ORIGIN = 533
const ICON_SHAYMIN_SKY = 534
const ICON_ROTOM_HEAT = 535
/** 폼까지 세어 아틀라스에 있는 칸 수 (495 + 45) */
export const ICON_SLOTS = 540

/** 폼 첫 칸이 앉는 자리. 여기 없는 종은 폼이 달라도 아이콘이 같다 */
const ICON_FIRST_FORM: ReadonlyMap<number, number> = new Map([
  [SPECIES_DEOXYS, ICON_DEOXYS_ATTACK],
  [SPECIES_UNOWN, ICON_UNOWN_B],
  [SPECIES_BURMY, ICON_BURMY_SANDY],
  [SPECIES_WORMADAM, ICON_WORMADAM_SANDY],
  [SPECIES_SHELLOS, ICON_SHELLOS_EAST],
  [SPECIES_GASTRODON, ICON_GASTRODON_EAST],
  [SPECIES_GIRATINA, ICON_GIRATINA_ORIGIN],
  [SPECIES_SHAYMIN, ICON_SHAYMIN_SKY],
  [SPECIES_ROTOM, ICON_ROTOM_HEAT],
])

/**
 * 그 개체가 쓸 아이콘 칸.
 *
 * ⚠️ **알이 먼저다.** 알 상태의 마나피는 제 아이콘이 아니라 파란 알을 쓴다 —
 * 종을 먼저 보면 안에 든 것이 새어 나간다
 */
export function iconSlot(species: number, form: number, isEgg: boolean): number {
  if (isEgg) return species === SPECIES_MANAPHY ? ICON_MANAPHY_EGG : SPECIES_EGG
  const at = sanitizeForm(species, form)
  if (at === 0) return species
  const first = ICON_FIRST_FORM.get(species)
  return first === undefined ? species : first + at - 1
}

// ── 언제 바뀌는가 ────────────────────────────────────────────────────────────

export const BURMY_PLANT = 0
export const BURMY_SAND = 1
export const BURMY_TRASH = 2

/**
 * 도롱마담 옷감은 **싸운 땅**이 정한다 (`BattleSystem_SetBurmyForm`).
 *
 * ⚠️ **눈·물·얼음·웅덩이·대습원은 풀이다.** 원작 `switch`가 그 다섯을 안 적어
 * 두고 `default`로 흘리는데 `default`가 풀이다 — 눈밭에서 싸우면 모래가 될 것
 * 같지만 아니다
 */
export function burmyCloak(terrain: TerrainId): number {
  switch (terrain) {
    case Terrain.PLAIN:
    case Terrain.SAND:
    case Terrain.MOUNTAIN:
    case Terrain.CAVE:
    case Terrain.DISTORTION_WORLD:
    case Terrain.GIRATINA:
      return BURMY_SAND
    case Terrain.BUILDING:
    case Terrain.BRIDGE:
    case Terrain.AARON:
    case Terrain.BERTHA:
    case Terrain.FLINT:
    case Terrain.LUCIAN:
    case Terrain.CYNTHIA:
    case Terrain.BATTLE_TOWER:
    case Terrain.BATTLE_FACTORY:
    case Terrain.BATTLE_ARCADE:
    case Terrain.BATTLE_CASTLE:
    case Terrain.BATTLE_HALL:
      return BURMY_TRASH
    default:
      return BURMY_PLANT
  }
}

export const GIRATINA_ALTERED = 0
export const GIRATINA_ORIGIN = 1
/** `generated/items.txt` */
export const ITEM_GRISEOUS_ORB = 112
export const ITEM_GRACIDEA = 466

/**
 * 기라티나는 백금옥을 들었으면 오리진이다 (`BoxPokemon_SetGiratinaForm`).
 *
 * ⚠️ 깨어진 세계 안에서는 **들지 않아도** 오리진이다 — 그쪽은 자리가 정하는
 * 것이라 `Party_SetGiratinaForm(party, 1)`이 따로 부른다
 */
export function giratinaForm(heldItem: number): number {
  return heldItem === ITEM_GRISEOUS_ORB ? GIRATINA_ORIGIN : GIRATINA_ALTERED
}

export const SHAYMIN_LAND = 0
export const SHAYMIN_SKY = 1

/**
 * 그라시데아를 받을 수 있는가 (`Pokemon_CanShayminSkyForm`).
 *
 * ⚠️ 조건이 다섯이다 — 랜드 폼이고, 안 쓰러졌고, **운명적인 만남**이고, 얼지
 * 않았고, 4시~20시다. 이벤트로 온 마리만 스카이가 된다는 뜻이 `fateful`이다
 */
export function canShayminSky(
  mon: { species: number; form: number; hp: number; status: string; origin: { fateful: boolean } },
  hour: number,
): boolean {
  return mon.species === SPECIES_SHAYMIN
    && sanitizeForm(mon.species, mon.form) === SHAYMIN_LAND
    && mon.hp > 0
    && mon.origin.fateful
    && mon.status !== 'frz'
    && hour >= 4 && hour < 20
}

/** 밤이면 랜드로 돌아간다 (`Party_SetShayminForm`) — 20시부터 4시까지 */
export function shayminMustLand(hour: number): boolean {
  return hour >= 20 || hour < 4
}

/**
 * 로토무 폼마다 딸려 오는 기술 (`rotomFormMoves`).
 *
 * 자리 0(보통 모습)은 기술이 없다 — 가전에서 빠져나오면 그 기술만 사라진다
 */
export const ROTOM_FORM_MOVES: readonly number[] = [
  0,   // 보통
  315, // 오버히트
  56,  // 하이드로펌프
  59,  // 눈보라
  403, // 에어슬래시
  437, // 리프스톰
]

/** 로토무가 기술을 하나도 안 갖게 되면 되돌려 놓는 기술 (`MOVE_THUNDER_SHOCK`) */
export const MOVE_THUNDER_SHOCK = 84

/**
 * 캐스퐁이 날씨로 갈아입는 타입 (`BattleSystem_TriggerFormChange`).
 *
 * ⚠️ **종족 자료에 없다.** 캐스퐁은 `pl_personal`에 칸이 하나뿐이고, 타입은
 * 배틀 코드가 `battleMons[i].type1`을 직접 갈아 끼운다 — 폼 칸도 배틀 안의
 * `formNum`이라 리포트에 안 남는다
 */
export const CASTFORM_TYPE: readonly number[] = [0, 10, 11, 15]

/**
 * 그 폼의 타입. 종족 자료에서 안 오는 둘만 답하고, 나머지는 null이다.
 *
 * 아르세우스는 **폼 번호가 곧 타입 번호**라 표가 필요 없다
 */
export function formTypes(species: number, form: number): [number, number] | null {
  const at = sanitizeForm(species, form)
  if (at === 0) return null
  if (species === SPECIES_CASTFORM) {
    const t = CASTFORM_TYPE[at] ?? 0
    return [t, t]
  }
  if (species === SPECIES_ARCEUS) return [at, at]
  return null
}

/** 아르세우스의 플레이트 지님효과 → 타입 (`Pokemon_GetArceusTypeOf`) */
const ARCEUS_TYPE_OF_HOLD: ReadonlyMap<number, number> = new Map([
  [126, 10], [127, 11], [128, 13], [129, 12], [130, 15], [131, 1],
  [132, 3], [133, 4], [134, 2], [135, 14], [136, 6], [137, 5],
  [138, 7], [139, 16], [140, 17], [141, 8],
])

/**
 * 아르세우스의 폼 = 든 플레이트의 타입 (`BoxPokemon_SetArceusForm`).
 *
 * ⚠️ **폼 번호가 곧 타입 번호다.** 자료의 폼 열여덟이 타입 열여덟과 같은
 * 차례라서, 9번(`???`)만 플레이트가 없어 영영 안 걸린다
 */
export function arceusForm(holdEffect: number): number {
  return ARCEUS_TYPE_OF_HOLD.get(holdEffect) ?? 0
}

// ── 갈아입기 ─────────────────────────────────────────────────────────────────

export interface FormTables {
  /** 그 개체의 최대 HP. 폼이 바뀌면 종족 자료가 바뀌므로 함께 바뀔 수 있다 */
  maxHp: (mon: PokemonInstance) => number
  /** 기술의 최대 PP. 로토무가 기술을 갈아 끼울 때만 쓴다 */
  maxPp?: (move: number) => number
}

/**
 * 폼을 갈아 끼운다.
 *
 * ⚠️ **능력치를 다시 세는 것이 이 함수의 절반이다.** 원작에서 PC 안의 기라티나는
 * 백금옥을 갈아 끼워도 능력치가 안 따라와서, 밖에서 레벨업할 때까지 어나더의
 * 수치로 싸운다 — 그것이 [BUGS](../../../docs/BUGS.md) §2.15고 **안 옮긴다**.
 * 폼을 바꾸는 자리는 전부 여기를 지나간다.
 *
 * ⚠️ 현재 HP는 최대치의 **차이만큼** 옮긴다 (`Pokemon_CalcStats`). 4세대 폼은
 * 어느 쪽도 HP 종족값이 같아서 실제로는 늘 0이지만, 규칙을 다르게 적으면
 * 나중에 그 하나가 어긋난다
 */
export function changeForm(
  mon: PokemonInstance, form: number, tables: FormTables, moveSlot = 0,
): PokemonInstance {
  const at = sanitizeForm(mon.species, form)
  if (at === mon.form) return mon
  const before = tables.maxHp(mon)
  let next: PokemonInstance = { ...mon, form: at }
  if (mon.species === SPECIES_ROTOM) next = rotomMoves(next, at, moveSlot, tables.maxPp)
  const after = tables.maxHp(next)
  if (mon.hp > 0 && after !== before) {
    next = { ...next, hp: Math.min(after, Math.max(1, mon.hp + after - before)) }
  }
  return next
}

/**
 * 로토무의 기술칸 (`Pokemon_SetRotomForm`).
 *
 * ⚠️ **먼저 지우고 나중에 넣는다.** 이미 갖고 있는 폼 기술을 새 기술로
 * **덮어쓰고**, 새 기술이 없으면(보통 모습으로 돌아갈 때) 그 칸을 통째로 지운다.
 * 그냥 붙이면 오버히트와 하이드로펌프를 같이 든 로토무가 생긴다.
 *
 * ⚠️ **칸이 없으면 스크립트가 고른 칸을 덮는다.** 네 칸이 다 차 있으면 원작이
 * 「어느 기술을 잊게 할까?」를 먼저 묻고 그 답을 `moveSlot`으로 넘긴다.
 *
 * ⚠️ **기술이 하나도 안 남으면 전기쇼크를 넣는다.** 지우기만 하고 넣을 것이
 * 없는 경우가 있어서, 원작이 마지막에 그 칸을 메운다
 */
function rotomMoves(
  mon: PokemonInstance, form: number, moveSlot: number, maxPp?: (move: number) => number,
): PokemonInstance {
  const pp = (move: number): { move: number, pp: number, ppUps: number } =>
    ({ move, pp: maxPp?.(move) ?? 5, ppUps: 0 })
  const moves = mon.moves.map((s) => ({ ...s }))
  const signature = new Set(ROTOM_FORM_MOVES.slice(1))
  let want = ROTOM_FORM_MOVES[form] ?? 0

  for (let i = 0; i < moves.length; i++) {
    const slot = moves[i]
    if (!slot || !signature.has(slot.move)) continue
    if (want !== 0) { moves[i] = pp(want); want = 0; continue }
    moves.splice(i, 1)
    i--
  }
  if (want !== 0) {
    if (moves.length < 4) moves.push(pp(want))
    else moves[Math.min(Math.max(moveSlot, 0), 3)] = pp(want)
  }
  if (moves.length === 0) moves.push(pp(MOVE_THUNDER_SHOCK))
  return { ...mon, moves }
}

/**
 * 지닌 물건이 바뀐 뒤 (`Pokemon_SetGiratinaFormByHeldItem`).
 *
 * ⚠️ **주고받는 자리마다 불러야 한다.** 원작은 파티 화면의 「지닌물건」 갈래
 * 셋과 PC 미리보기에서 각각 부른다 — 한 군데를 빼먹으면 백금옥을 뺐는데
 * 오리진인 기라티나가 남는다
 */
export function afterHeldItem(mon: PokemonInstance, tables: FormTables): PokemonInstance {
  if (mon.species !== SPECIES_GIRATINA) return mon
  return changeForm(mon, giratinaForm(mon.heldItem), tables)
}

/**
 * 배틀 그림 파일 이름의 앞부분 (`data/pokemon/{key}_front.png`).
 *
 * 기본형은 종 번호 그대로고 폼이 있으면 `479-2`다. **알은 494번**이다 —
 * `pl_pokegra`에 칸이 없어서 그 그림만 `pl_otherpoke`에서 온다
 */
export function spriteKey(species: number, form: number, isEgg: boolean): string {
  if (isEgg) return species === SPECIES_MANAPHY ? `${String(SPECIES_EGG)}-1` : String(SPECIES_EGG)
  const at = sanitizeForm(species, form)
  return at === 0 ? String(species) : `${String(species)}-${String(at)}`
}
