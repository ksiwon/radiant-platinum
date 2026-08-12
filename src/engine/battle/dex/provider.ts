// 배틀 표를 **사용자의 롬에서** 채운다 (COPYRIGHT.md §2.9 · DEPLOY.md §4)
//
// sim의 데이터 폴더는 빌드에서 빠져 있다. 종족값·위력·명중률 같은 수치는
// 여기서 채우고, 효과 구현은 `MechanicsRegistry`가 얹는다.
//
// ⚠️ **첫 배틀 전에 반드시 채워야 한다.** `dex.loadData()`는 표를 한 번 읽고
// 그 결과를 캐시한다 — 비어 있는 채로 그 순간이 지나가면 그 뒤로 아무리
// 채워도 sim은 종족을 하나도 모른다. `battleStore`가 sim을 지연 로딩하기
// **직전에** 여기를 기다린다.
import { loadItems, loadMoves, loadSpecies } from '../../../data/gameData'
import type { Item, Move, Species } from '../../../data/schema'
import { natureEffect } from '../../pokemon/stats'
import { TYPE_COUNT, typeMultiplier } from '../ai/typeChart'
import { MechanicsRegistry, withMechanics } from './mechanics'
import {
  Abilities, clearBattleTables, Items, Moves, Natures, Pokedex, TypeChart,
} from './tables'
import {
  ABILITY_IDS, FORM_IDS, ITEM_IDS, MOVE_IDS, NATURE_IDS, SPECIES_IDS, TYPE_NAMES,
} from './vendor/names.gen'
import { formSpeciesId, formTypes } from '../../pokemon/form'

/**
 * sim의 `damageTaken` 부호. 0 보통 · 1 효과 굉장 · 2 반감 · 3 무효.
 *
 * ⚠️ **배수가 아니라 방향이다.** 1이 2배고 2가 0.5배다 — 뒤집어 읽으면 상성이
 * 통째로 반대가 된다
 */
function taken(mult: number): number {
  if (mult === 0) return 3
  if (mult === 0.5) return 2
  if (mult === 2) return 1
  return 0
}

/** 상성표에 칸이 없는 타입 (`TYPE_MYSTERY` = Showdown의 `???`). 저주가 쓴다 */
const MYSTERY = 9

/** 롬 타입 번호 → 구현이 글자로 비교하는 이름 */
function typeName(id: number): string {
  const name = TYPE_NAMES[id]
  if (!name) throw new Error(`타입 번호 ${String(id)}에 이름이 없다`)
  return name
}

function speciesEntry(
  s: Species, id: string, over: Record<string, unknown> = {},
): Record<string, unknown> {
  const [t0, t1] = s.types
  return withMechanics({
    num: s.id,
    // ⚠️ **이름 자리에 id를 넣는다.** sim은 `toID(name)`으로 색인하므로 롬의
    // 현지화된 이름을 넣으면 한국어 롬에서 색인이 통째로 깨진다. 화면에 뜨는
    // 이름은 이 표가 아니라 글 뱅크에서 온다 (`data/names/`)
    name: id,
    types: t0 === t1 ? [typeName(t0)] : [typeName(t0), typeName(t1)],
    baseStats: { ...s.stats },
    abilities: abilitySlots(s.abilities),
    // 데시미터·헥토그램 → 미터·킬로그램. 저울질과 풀묶기가 이 숫자를 본다
    heightm: s.heightDm / 10,
    weightkg: s.weightHg / 10,
    ...genderOf(s.genderRatio),
    ...over,
  }, MechanicsRegistry.species(id))
}

// ── 폼 (PARITY §3.4) ─────────────────────────────────────────────────────────

/**
 * id의 첫 글자를 올린다. `castform` → `Castform`.
 *
 * ⚠️ **구현이 이름을 글자로 비교하는 자리가 셋 있어서 필요하다.** 날씨구슬은
 * `pokemon.baseSpecies.baseSpecies !== 'Castform'`으로, 플라워기프트는
 * `!== 'Cherrim'`으로 걸러내고, 얼음 상태는 `species.name === 'Shaymin-Sky'`일
 * 때만 스카이를 랜드로 되돌린다. id를 그대로 넣으면 그 셋이 **조용히 아무
 * 일도 안 한다** — 캐스퐁이 날씨를 타지 않고 스카이 쉐이미가 얼어도 안 바뀐다.
 *
 * 새 자료가 아니다. 이미 우리 소스에 있는 id를 첫 글자만 올린 것이고, 비교
 * 대상 글자 자체는 벤더 구현 파일에 그대로 들어 있다
 */
const cap = (id: string): string => id[0]!.toUpperCase() + id.slice(1)

/** `castform` + `sunny` → `Castform-Sunny` (`Species.name`이 이 꼴이다) */
function formName(baseId: string, id: string): string {
  return `${cap(baseId)}-${cap(id.slice(baseId.length))}`
}

/**
 * 폼 항목 하나.
 *
 * 종족값·특성은 **롬의 폼 칸**에서 온다(`formSpeciesId`) — 로토무 히트는 503번,
 * 도롱마담 모래는 499번이다. 제 칸이 없는 폼(안농·캐스퐁·아르세우스…)은 기본형
 * 칸을 그대로 쓰는 것이 맞다.
 *
 * ⚠️ **타입만 롬 표에서 못 온다.** 캐스퐁과 아르세우스는 폼마다 타입이 다른데
 * 그 값이 종족 자료가 아니라 배틀 코드에 있다 (`BattleSystem_TriggerFormChange`·
 * `Pokemon_GetArceusTypeOf`). 그래서 `form.ts`가 그 규칙을 들고 있다
 */
function formEntry(rom: Species, id: string, baseId: string, base: number, form: number) {
  const types = formTypes(base, form)
  return speciesEntry(rom, id, {
    // 도감 번호는 기본형과 같다 — 폼은 도감에서 한 자리를 나눠 쓴다
    num: base,
    name: formName(baseId, id),
    baseSpecies: cap(baseId),
    forme: cap(id.slice(baseId.length)),
    ...(types ? { types: [...new Set(types.map(typeName))] } : {}),
    // ⚠️ **티어를 안 적으면 sim이 선다.** 폼 항목은 `baseSpecies !== name`이라
    // `getByID`가 대전 티어를 기본형의 `FormatsData`에서 끌어오려 하는데, 우리
    // 표에는 그 칸이 통째로 없다 — `Castform has no formats-data entry`로 던진다.
    // 여기 적는 `Illegal`은 **그 함수가 빈 표에서 계산해 낼 바로 그 값**이고,
    // 우리는 팀 검사 없는 `gen4customgame`으로 싸우므로 아무 데서도 안 읽힌다
    tier: 'Illegal',
  })
}

/** 특성 두 칸. 둘째가 첫째와 같거나 비면 칸이 하나다 */
function abilitySlots(pair: readonly [number, number]): Record<string, string> {
  const first = ABILITY_IDS[pair[0]]
  if (!first) throw new Error(`특성 #${String(pair[0])}에 이름이 없다`)
  const second = pair[1] === 0 || pair[1] === pair[0] ? null : ABILITY_IDS[pair[1]]
  return second ? { 0: first, 1: second } : { 0: first }
}

/**
 * 성별이 하나로 정해진 종족만 적는다. 255 무성 · 0 항상 수컷 · 254 항상 암컷.
 *
 * ⚠️ **성비는 안 넘긴다.** sim은 `gender`가 비어 있으면 성비로 **자기가**
 * 굴리는데, 우리 개체의 성별은 이미 PID로 정해져 있다(`genderOf` in
 * `instance.ts`, `(pid & 0xff) < ratio`). 둘이 따로 굴리면 화면에 ♀로 뜨는
 * 애가 배틀 안에서는 ♂가 되고 매혹·헤롱헤롱이 반대로 돈다. 그래서 개체를
 * 넣을 때 성별을 **글자로 박아서** 넘기고(`session.ts`의 `toSet`) sim이
 * 굴릴 일을 아예 없앤다
 */
function genderOf(ratio: number): { gender?: string } {
  if (ratio === 255) return { gender: 'N' }
  if (ratio === 0) return { gender: 'M' }
  if (ratio === 254) return { gender: 'F' }
  return {}
}

function moveEntry(m: Move, id: string): Record<string, unknown> {
  const mech = MechanicsRegistry.move(id)
  const rom: Record<string, unknown> = {
    num: m.id,
    name: id,
    // 0은 "명중 판정을 안 한다"는 뜻이다. sim은 그것을 `true`로 적는다
    accuracy: m.alwaysHits ? true : m.accuracy,
    category: m.category[0].toUpperCase() + m.category.slice(1),
    pp: m.pp,
    priority: m.priority,
    type: typeName(m.type),
  }
  // ⚠️ **위력 1은 위력이 아니라 표식이다.** 롬은 "이 기술의 위력은 다른 데서
  // 정한다"를 그렇게 적는다 — 지구던지기·일격필살·풀묶기가 그렇고, 그 32개는
  // 전부 구현이 위력을 들고 있다 (bake.mjs가 그것을 실측으로 확인한다)
  if (!(m.power === 1 && mech && 'basePower' in mech)) rom.basePower = m.power
  return withMechanics(rom, mech)
}

/**
 * 도구.
 *
 * ⚠️ **롬 468종 중 배틀에 나오는 것만 표에 넣는다.** 상처약이나 기술머신은
 * 대전 규칙에 없는 물건이라 구현이 없고, 넣어 봐야 sim이 아무 데서도 안 본다.
 * 가방에서 쓰는 도구는 sim을 안 거치고 `applyPlan`이 직접 처리한다
 */
function itemEntry(it: Item, num: number, id: string): Record<string, unknown> {
  const mech = MechanicsRegistry.item(id)
  const rom: Record<string, unknown> = { num, name: id }
  // ⚠️ **던지기는 반만 롬이다.** 위력은 `flingPower` 바이트고, 던졌을 때 붙는
  // 화상·마비·풀죽음은 효과라 구현이 들고 있다. 위력만 덮어쓴다
  if (it.flingPower) {
    rom.fling = { ...(mech?.fling as object | undefined), basePower: it.flingPower }
  }
  // 자연의은혜 타입 31은 "없음"이다 — 5비트를 전부 세운 값
  if (it.naturalGiftPower && it.naturalGiftType !== undefined && it.naturalGiftType < 18) {
    rom.naturalGift = { basePower: it.naturalGiftPower, type: typeName(it.naturalGiftType) }
  }
  return withMechanics(rom, mech)
}

let primed: Promise<void> | null = null

/** 다시 채우게 만든다. 설치본을 갈아 끼우면 옛 롬의 수치가 남으면 안 된다 */
export function resetBattleDex(): void {
  primed = null
  clearBattleTables()
}

/**
 * 롬에서 배틀 표를 채운다. 여러 번 불러도 한 번만 읽는다.
 *
 * ⚠️ 실패를 캐시하지 않는다 — 설치가 덜 끝난 상태에서 한 번 실패하면 그 뒤로
 * 영영 배틀이 안 되는 꼴이 된다
 */
export function primeBattleDex(): Promise<void> {
  primed ??= build().catch((e: unknown) => { primed = null; throw e })
  return primed
}

async function build(): Promise<void> {
  const [species, moves, items] = await Promise.all([loadSpecies(), loadMoves(), loadItems()])

  for (let num = 1; num < SPECIES_IDS.length; num++) {
    const id = SPECIES_IDS[num]
    if (!id) continue
    const s = species.byId.get(num)
    if (!s) throw new Error(`종족 #${String(num)}이 설치본에 없다`)
    // 폼이 있는 종은 기본형에도 `baseSpecies`를 적는다 — 날씨구슬과
    // 플라워기프트가 **기본형일 때** 그 글자를 보고 걸러내기 때문이다
    Pokedex[id] = num in FORM_IDS
      ? speciesEntry(s, id, { name: cap(id), baseSpecies: cap(id) })
      : speciesEntry(s, id)
  }

  // 폼. 종족값은 롬의 폼 칸에서 오고 여기서 나가는 것은 이름 다리뿐이다
  for (const [key, forms] of Object.entries(FORM_IDS)) {
    const base = Number(key)
    const baseId = forms[0]
    if (!baseId) continue
    for (let form = 1; form < forms.length; form++) {
      const id = forms[form]
      if (!id) continue // sim이 안 나누는 폼(안농 글자·아르세우스 `???`)
      const s = species.byId.get(formSpeciesId(base, form))
      if (!s) throw new Error(`종족 #${String(base)} 폼 ${String(form)}이 설치본에 없다`)
      Pokedex[id] = formEntry(s, id, baseId, base, form)
    }
  }

  for (let num = 1; num < MOVE_IDS.length; num++) {
    const id = MOVE_IDS[num]
    if (!id) continue
    const m = moves.byId.get(num)
    if (!m) throw new Error(`기술 #${String(num)}이 설치본에 없다`)
    Moves[id] = moveEntry(m, id)
  }

  for (let num = 1; num < ABILITY_IDS.length; num++) {
    const id = ABILITY_IDS[num]
    if (!id) continue
    Abilities[id] = withMechanics({ num, name: id }, MechanicsRegistry.ability(id))
  }

  // ⚠️ **롬 이름을 그대로 키로 쓰지 않는다.** 롬은 `cheri_berry`, 구현이 사는
  // 자리는 `cheriberry`다. 그 다리도 디컴프 열거형에서 굽는다 (`ITEM_IDS`)
  for (let num = 1; num < ITEM_IDS.length; num++) {
    const id = ITEM_IDS[num]
    if (!id) continue
    const it = items.all[num]
    if (!it) throw new Error(`도구 #${String(num)}이 설치본에 없다`)
    Items[id] = itemEntry(it, num, id)
  }

  // ⚠️ **상성표는 받는 쪽 기준이다.** `TypeChart['fire'].damageTaken['Water']`는
  // "불꽃이 물에게서 받는 것"이다 — 공격 쪽으로 적으면 표가 통째로 뒤집힌다
  //
  // ⚠️ 9번(`???`)은 칸이 없다. 저주가 그 타입인데 어느 타입에도 등배라
  // sim은 아예 항목을 안 두고 "모르는 타입 = 0단계"로 흘린다
  for (let def = 0; def < TYPE_COUNT; def++) {
    if (def === MYSTERY) continue
    const id = typeName(def).toLowerCase()
    const damageTaken: Record<string, number> = {}
    for (let atk = 0; atk < TYPE_COUNT; atk++) {
      if (atk === MYSTERY) continue
      damageTaken[typeName(atk)] = taken(typeMultiplier(atk, def))
    }
    const mech = MechanicsRegistry.type(id)
    const extra = (mech?.damageTaken ?? {}) as Record<string, number>
    TypeChart[id] = { ...mech, damageTaken: { ...damageTaken, ...extra } }
  }

  // 성격 보정은 다섯 칸(공·방·스피드·특공·특방)에만 붙는다. 무보정 성격 다섯은
  // `plus`·`minus`가 아예 없는 것이 맞다 — 같은 칸을 올리고 내리는 것이 아니다
  NATURE_IDS.forEach((id, num) => {
    const e = natureEffect(num)
    Natures[id] = e.up && e.down ? { name: id, plus: e.up, minus: e.down } : { name: id }
  })
}
