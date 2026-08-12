// 알과 육성가 (PARITY §3.2·§3.3) — `src/overlay005/daycare.c`.
//
// **알 계통이 통째로 없었다.** 개체에 "알인가"라는 칸부터 없어서, 육성가에
// 맡길 수도 없고 맡겨도 아무 일이 안 일어났다.
//
// 규칙만 여기 둔다 — 화면도 세이브도 안 건드린다. 순수해야 시험이 판 없이
// 궁합표와 유전 분포를 잴 수 있다.
import type { Species, Stats } from '../../data/schema'
import { genderOf, type MoveSlot, type PokemonInstance, type Rng } from './instance'
import { natureOf } from './instance'
import { hatchedAt, metToday } from './origin'

/** `generated/egg_groups.txt`. 줄 번호가 곧 값이다 */
export const EggGroup = {
  NONE: 0,
  MONSTER: 1,
  WATER_1: 2,
  BUG: 3,
  FLYING: 4,
  FIELD: 5,
  FAIRY: 6,
  GRASS: 7,
  HUMAN_LIKE: 8,
  WATER_3: 9,
  MINERAL: 10,
  AMORPHOUS: 11,
  WATER_2: 12,
  DITTO: 13,
  DRAGON: 14,
  UNDISCOVERED: 15,
} as const

/** `constants/daycare.h`. 100분위 확률이라 그대로 굴린다 */
export const Compatibility = {
  NONE: 0,
  LOW: 20,
  MED: 50,
  MAX: 70,
} as const
export type CompatibilityScore = (typeof Compatibility)[keyof typeof Compatibility]

/** 물려받는 개체값 수 (`NUM_INHERITED_IVS`) */
export const INHERITED_IVS = 3
/** 알에서 나오는 레벨 (`EGG_POKEMON_LEVEL`) */
export const EGG_LEVEL = 1
/** 기술 네 칸 (`LEARNED_MOVES_MAX`) */
const MOVE_SLOTS = 4

const SPECIES_DITTO = 132
const SPECIES_NIDORAN_F = 29
const SPECIES_NIDORAN_M = 32
const SPECIES_ILLUMISE = 314
const SPECIES_VOLBEAT = 313
const SPECIES_MANAPHY = 490
const SPECIES_PHIONE = 489
const SPECIES_PICHU = 172
const MOVE_VOLT_TACKLE = 344

const ITEM_EVERSTONE = 230
const ITEM_LIGHT_BALL = 237

export const ABILITY_MAGMA_ARMOR = 41
export const ABILITY_FLAME_BODY = 50

/**
 * 향로를 안 들리면 **위 단계가 나오는** 아기 아홉 (`sIncenseBabyTable`).
 *
 * ⚠️ 방향이 헷갈리기 쉽다 — 향로를 들려야 아기가 나오고, **안 들리면 어른**이
 * 나온다. 거꾸로 만들면 마릴을 맡겨도 영영 알마릴이 안 나온다.
 * `[아기, 필요한 향로, 향로 없을 때 나오는 것]`
 */
export const INCENSE_BABIES: readonly (readonly [number, number, number])[] = [
  [360, 256, 202], // 마자링 ← 편안한향로 · 없으면 마자용
  [298, 255, 183], // 루리리 ← 바다의향로 · 없으면 마릴
  [439, 315, 122], // 흉내내미 ← 이상한향로 · 없으면 흉내내
  [438, 316, 185], // 꼬지지 ← 바위의향로 · 없으면 꼬지모
  [446, 317, 143], // 먹고자 ← 잔뜩향로 · 없으면 잠만보
  [458, 318, 226], // 타만타 ← 파도의향로 · 없으면 만타인
  [406, 319, 315], // 꼬몽울 ← 장미향로 · 없으면 로젤리아
  [440, 320, 113], // 핑복 ← 행운의향로 · 없으면 럭키
  [433, 321, 358], // 종이 ← 청아한향로 · 없으면 치렁
]

/** 육성가에 맡긴 한 마리. 개체 그대로에 맡긴 뒤의 걸음이 붙는다 */
export interface DaycareMon {
  mon: PokemonInstance
  /** 맡긴 뒤 걸은 수. 경험치와 요금이 이걸 본다 */
  steps: number
  /** 맡길 때의 레벨. 몇 레벨 올랐는지를 이걸로 센다 */
  levelIn: number
}

export interface DaycareState {
  /** 두 자리. 앞에서부터 채운다 */
  slots: (DaycareMon | null)[]
  /** 알이 생겼으면 그 개체의 PID. 0이면 아직 없다 (`offspringPersonality`) */
  eggPid: number
  /** 알 주기 계수기 (`Daycare_GetStepCounter`). 255마다 부화 걸음이 깎인다 */
  cycle: number
}

export function newDaycare(): DaycareState {
  return { slots: [null, null], eggPid: 0, cycle: 0 }
}

// ── 궁합 ─────────────────────────────────────────────────────────────────────

function groupsOf(s: Species): readonly [number, number] {
  return [s.eggGroups[0], s.eggGroups[1]]
}

function shareGroup(a: readonly number[], b: readonly number[]): boolean {
  return a.some((x) => b.includes(x))
}

/**
 * 두 마리의 궁합 점수 (`BoxMon_GetPairDaycareCompatibilityScore`).
 *
 * 100분위 확률 그대로다 — 0·20·50·70. 순서가 중요하다: **미발견과 메타몽
 * 둘을 먼저 걸러야** 성별 검사에 안 걸린다. 메타몽 둘이 같은 성별이라
 * 순서를 바꾸면 "성별이 같다"로 튕겨 나가는데, 결과는 같아도 이유가 달라진다
 */
export function compatibility(
  a: PokemonInstance, b: PokemonInstance,
  dataOf: (species: number) => Species,
): CompatibilityScore {
  const pair = [a, b] as const
  const groups = pair.map((m) => groupsOf(dataOf(m.species)))
  const genders = pair.map((m) => genderOf(m.pid, dataOf(m.species).genderRatio))

  if (groups.some((g) => g[0] === EggGroup.UNDISCOVERED)) return Compatibility.NONE
  const dittos = groups.filter((g) => g[0] === EggGroup.DITTO).length
  if (dittos === 2) return Compatibility.NONE
  if (dittos === 1) {
    return a.otId === b.otId ? Compatibility.LOW : Compatibility.MED
  }
  if (genders[0] === genders[1]) return Compatibility.NONE
  if (genders.includes('genderless')) return Compatibility.NONE
  if (!shareGroup(groups[0]!, groups[1]!)) return Compatibility.NONE

  if (a.species === b.species) {
    return a.otId === b.otId ? Compatibility.MED : Compatibility.MAX
  }
  return a.otId === b.otId ? Compatibility.LOW : Compatibility.MED
}

/** 두 자리가 다 차 있을 때만 점수가 있다 */
export function daycareCompatibility(
  state: DaycareState, dataOf: (species: number) => Species,
): CompatibilityScore {
  const [a, b] = state.slots
  if (!a || !b) return Compatibility.NONE
  return compatibility(a.mon, b.mon, dataOf)
}

// ── 알이 생긴다 ──────────────────────────────────────────────────────────────

/**
 * 어느 자리가 어미고 어느 쪽이 아비인가, 그리고 나올 종족은 무엇인가
 * (`Egg_DetermineEggSpeciesAndParentSlots`).
 *
 * 돌려주는 `parents[0]`이 어미(종족을 물려주는 쪽), `[1]`이 아비다.
 * ⚠️ **아비 쪽이 알 기술을 물려준다.** 뒤집으면 알 기술이 통째로 안 붙는다
 */
export function eggSpeciesAndParents(
  state: DaycareState, babyOf: readonly number[], dataOf: (species: number) => Species,
): { species: number, mother: number, father: number } | null {
  const [a, b] = state.slots
  if (!a || !b) return null
  const mons = [a.mon, b.mon]
  let parents: [number, number] = [0, 1]
  for (const i of [0, 1]) {
    const mon = mons[i]!
    if (mon.species === SPECIES_DITTO) parents = [i ^ 1, i]
    else if (genderOf(mon.pid, dataOf(mon.species).genderRatio) === 'female') parents = [i, i ^ 1]
  }

  let species = babyOf[mons[parents[0]]!.species] ?? mons[parents[0]]!.species
  // 성별로 갈리는 둘. 알의 PID 최상위 비트가 그 답이다 (`EGG_GENDER_MALE`)
  const male = (state.eggPid & 0x8000) !== 0
  if (species === SPECIES_NIDORAN_F && male) species = SPECIES_NIDORAN_M
  if (species === SPECIES_ILLUMISE && male) species = SPECIES_VOLBEAT
  // 마나피는 자기가 안 나오고 피오네가 나온다
  if (species === SPECIES_MANAPHY) species = SPECIES_PHIONE

  // 메타몽이 상대가 수컷이면 **메타몽 쪽을 어미로** 돌린다
  if (mons[parents[1]]!.species === SPECIES_DITTO) {
    const other = mons[parents[0]]!
    if (genderOf(other.pid, dataOf(other.species).genderRatio) !== 'female') {
      parents = [parents[1], parents[0]]
    }
  }
  return { species, mother: parents[0], father: parents[1] }
}

/** 향로를 안 들렸으면 위 단계가 나온다 (`Daycare_AlterEggSpeciesWithIncenseItem`) */
export function incenseSpecies(species: number, state: DaycareState): number {
  const row = INCENSE_BABIES.find(([baby]) => baby === species)
  if (!row) return species
  const held = state.slots.map((s) => s?.mon.heldItem ?? 0)
  return held.includes(row[1]) ? species : row[2]
}

/**
 * 성격을 물려받을 자리 (`Daycare_GetParentToInheritNature`). 없으면 -1.
 *
 * ⚠️ **변함없는돌을 들고 있어도 반쯤이다.** 4세대는 5세대와 달라서, 돌을
 * 들려도 동전을 한 번 더 던진다. 그 한 줄을 빼면 성격 유전이 100%가 된다
 */
export function natureParent(state: DaycareState, coin: () => boolean): number {
  const mons = state.slots.map((s) => s?.mon ?? null)
  if (!mons[0] || !mons[1]) return -1
  let slot = -1
  // 원작은 성별 표를 안 보고 저장된 성별을 읽는다. 우리는 PID뿐이라
  // 종족 자료가 필요한데, 여기서는 **메타몽 검사 뒤에 덮이는 값**이라
  // 실제로 쓰이는 것은 메타몽 자리와 동전뿐이다
  const dittos: number[] = []
  for (const i of [0, 1]) if (mons[i]!.species === SPECIES_DITTO) dittos.push(i)
  if (dittos.length > 0) slot = dittos[dittos.length - 1]!
  if (dittos.length === 2) slot = coin() ? 0 : 1
  if (slot < 0) slot = 1

  if (mons[slot]!.heldItem !== ITEM_EVERSTONE) return -1
  return coin() ? -1 : slot
}

/**
 * 알의 PID를 정한다 (`Daycare_SetInheritedNature`).
 *
 * 변함없는돌이 먹으면 **그 부모와 같은 성격이 나올 때까지** 다시 굴린다
 * (최대 2400번). 아니면 그냥 한 번 굴린 값이다
 */
export function offspringPid(
  state: DaycareState, rng: Rng, coin: () => boolean,
): number {
  // ⚠️ **0은 못 쓴다.** 0이 "알이 아직 없다"는 표식이라, PID가 0으로 떨어지면
  // 방금 생긴 알이 없던 것이 된다. 원작도 성격을 물려받는 쪽에서 `!= 0`을
  // 조건에 넣어 두었다 — 같은 이유다
  const roll = (): number => (Math.floor(rng() * 0x100000000) >>> 0) || 1
  const slot = natureParent(state, coin)
  if (slot < 0) return roll()
  const want = natureOf(state.slots[slot]!.mon.pid)
  for (let i = 0; i <= 2400; i++) {
    const pid = roll()
    if (pid !== 0 && natureOf(pid) === want) return pid
  }
  return roll()
}

/**
 * 물려받는 개체값 셋 (`Egg_InheritIVs`).
 *
 * ⚠️ **원작 버그를 안 옮긴다** (BUGS.md §1.4). 목록에서 **뽑은 자리**를 지워야
 * 하는데 원작은 `RemoveIVIndexFromList(availableIVs, i)`로 루프 변수 `i`를
 * 지운다. 지우려는 대상과 지우는 대상이 다른 자기 모순이라, 4세대에서는 같은
 * 능력치가 두 번 뽑혀 "셋을 물려받는다"는 규칙 자체가 자주 깨진다.
 *
 * 여기서는 뽑은 자리를 지운다 — 셋이 늘 서로 다르다
 */
export function inheritedIvs(
  mother: PokemonInstance, father: PokemonInstance, base: Stats, rng: Rng,
): Stats {
  /** 원작의 `STAT_*` 차례 — HP·공격·방어·스피드·특공·특방 */
  const ORDER: (keyof Stats)[] = ['hp', 'atk', 'def', 'spe', 'spa', 'spd']
  const available = [0, 1, 2, 3, 4, 5]
  const picked: number[] = []
  for (let i = 0; i < INHERITED_IVS; i++) {
    const at = Math.floor(rng() * available.length)
    picked.push(available[at] ?? 0)
    available.splice(at, 1)
  }
  const from = Array.from({ length: INHERITED_IVS }, () => (rng() < 0.5 ? mother : father))
  const out = { ...base }
  for (let i = 0; i < INHERITED_IVS; i++) {
    const key = ORDER[picked[i]!]
    if (key) out[key] = from[i]!.ivs[key]
  }
  return out
}

/** 기술 하나를 붙인다. 네 칸이 다 찼으면 **첫 칸을 밀어낸다** (`Pokemon_ReplaceMove`) */
function addMove(moves: MoveSlot[], move: number, pp: number): void {
  if (moves.some((m) => m.move === move)) return
  const slot: MoveSlot = { move, pp, ppUps: 0 }
  if (moves.length < MOVE_SLOTS) { moves.push(slot); return }
  moves.shift()
  moves.push(slot)
}

export interface MovesetInput {
  /** 알에서 나올 종의 자료 */
  baby: Species
  mother: PokemonInstance
  father: PokemonInstance
  /** 기술 번호 → 기본 PP */
  ppOf: (move: number) => number
  /** 기술머신 100칸이 가르치는 기술 (`items.json`의 `tmMoves`) */
  tmMoves: readonly number[]
  /** 그 기술머신을 배울 수 있는가 */
  canLearnTm: (index: number) => boolean
}

/**
 * 알이 갖고 태어나는 기술 (`Egg_BuildMoveset`).
 *
 * 네 갈래를 **이 차례로** 얹는다. 차례가 곧 우선순위다 — 네 칸이 차면 앞의
 * 것부터 밀려나므로, 순서를 바꾸면 남는 기술이 달라진다:
 *
 *   ① 그 종의 레벨 1 기술
 *   ② 아비가 아는 **알 기술**
 *   ③ 아비가 아는 **기술머신** 중 그 종이 배울 수 있는 것
 *   ④ 부모가 **둘 다** 아는 레벨업 기술
 */
export function eggMoveset(input: MovesetInput): MoveSlot[] {
  const { baby, mother, father, ppOf, tmMoves, canLearnTm } = input
  const moves: MoveSlot[] = []
  for (const entry of baby.learnset) {
    if (entry.level <= EGG_LEVEL) addMove(moves, entry.move, ppOf(entry.move))
  }

  const fatherMoves = father.moves.map((m) => m.move)
  const eggMoves = new Set(baby.eggMoves)
  for (const move of fatherMoves) {
    if (eggMoves.has(move)) addMove(moves, move, ppOf(move))
  }

  for (const move of fatherMoves) {
    const index = tmMoves.indexOf(move)
    if (index >= 0 && canLearnTm(index)) addMove(moves, move, ppOf(move))
  }

  const motherMoves = new Set(mother.moves.map((m) => m.move))
  const levelUp = new Set(baby.learnset.map((e) => e.move))
  for (const move of fatherMoves) {
    if (motherMoves.has(move) && levelUp.has(move)) addMove(moves, move, ppOf(move))
  }
  return moves
}

/** 전기구슬을 들려 두면 피츄가 볼테커를 갖고 태어난다 (`Egg_TryGiveVoltTackle`) */
export function voltTackle(
  species: number, state: DaycareState, moves: MoveSlot[], ppOf: (move: number) => number,
): MoveSlot[] {
  if (species !== SPECIES_PICHU) return moves
  const held = state.slots.map((s) => s?.mon.heldItem ?? 0)
  if (!held.includes(ITEM_LIGHT_BALL)) return moves
  const out = [...moves]
  addMove(out, MOVE_VOLT_TACKLE, ppOf(MOVE_VOLT_TACKLE))
  return out
}

// ── 부화 ─────────────────────────────────────────────────────────────────────

/**
 * 한 번에 깎이는 부화 걸음 (`Party_GetEggCyclesToSubtract`).
 *
 * 마그마의무장이나 불꽃몸을 가진 **알이 아닌** 파티원이 있으면 2다.
 * "알이 아닌"이 중요하다 — 알은 특성을 안 세는데, 그 검사를 빼면 부화한
 * 적도 없는 알이 스스로를 데우게 된다
 */
export function hatchStep(
  party: readonly PokemonInstance[], abilityOf: (mon: PokemonInstance) => number,
): number {
  for (const mon of party) {
    if (mon.isEgg) continue
    const ability = abilityOf(mon)
    if (ability === ABILITY_MAGMA_ARMOR || ability === ABILITY_FLAME_BODY) return 2
  }
  return 1
}

/**
 * 알 주기 한 바퀴의 길이 (`Daycare_GetEggCycleLength`).
 *
 * 보통 255걸음이고, **열두 개의 특별한 날**에만 230이다. 원작이 정월과
 * 발렌타인, 그리고 시리즈의 발매일들을 넣어 두었다 — 그날은 알이 조금 빨리
 * 깬다. 지어낸 값이 아니라 `sEggCycleSpecialDates` 그대로다
 */
export const EGG_CYCLE_STEPS = 255
export const EGG_CYCLE_STEPS_SPECIAL = 230

/** `[달, 일]`. 원작 주석의 뜻까지 옮긴다 */
export const EGG_SPECIAL_DATES: readonly (readonly [number, number])[] = [
  [1, 12], // 정월
  [2, 14], // 발렌타인
  [3, 3],
  [4, 1], // 만우절
  [5, 1], // 에메랄드 미국 발매일
  [6, 11],
  [7, 7],
  [8, 21],
  [9, 7],
  [9, 28], // 다이아·펄 일본 발매일
  [11, 21], // 루비·사파이어 일본 발매일
  [12, 14], // 크리스탈 일본 발매일
]

export function eggCycleLength(month: number, day: number): number {
  const special = EGG_SPECIAL_DATES.some(([m, d]) => m === month && d === day)
  return special ? EGG_CYCLE_STEPS_SPECIAL : EGG_CYCLE_STEPS
}

/** 알을 하나 만들 때 나오는 값. 세이브 쪽이 개체로 조립한다 */
export interface EggPlan {
  species: number
  pid: number
  ivs: Stats
  moves: MoveSlot[]
  /** 남은 부화 걸음. 원작은 이것을 친밀도 칸에 넣는다 */
  eggCycles: number
}

/**
 * 알 하나를 만든다 (`Daycare_GiveEggFromDaycare`).
 *
 * PID는 이미 `state.eggPid`에 있다 — 알이 "생긴" 순간에 정해지고, 받아 갈 때
 * 다시 굴리지 않는다. 그래서 궁합이 좋아도 나오는 개체는 그때 이미 결정됐다
 */
export function makeEgg(
  state: DaycareState,
  babyOf: readonly number[],
  dataOf: (species: number) => Species,
  ppOf: (move: number) => number,
  tmMoves: readonly number[],
  canLearnTm: (species: number, index: number) => boolean,
  rng: Rng,
): EggPlan | null {
  const picked = eggSpeciesAndParents(state, babyOf, dataOf)
  if (!picked) return null
  const species = incenseSpecies(picked.species, state)
  const baby = dataOf(species)
  const mother = state.slots[picked.mother]!.mon
  const father = state.slots[picked.father]!.mon

  const randomIv = (): number => Math.floor(rng() * 32)
  const base: Stats = {
    hp: randomIv(), atk: randomIv(), def: randomIv(),
    spa: randomIv(), spd: randomIv(), spe: randomIv(),
  }
  const moves = voltTackle(species, state, eggMoveset({
    baby, mother, father, ppOf, tmMoves,
    canLearnTm: (index) => canLearnTm(species, index),
  }), ppOf)

  return {
    species,
    pid: state.eggPid,
    ivs: inheritedIvs(mother, father, base, rng),
    moves,
    eggCycles: baby.eggCycles,
  }
}

/** 알이 생길 판정을 하는 걸음인가 — 둘째 자리의 걸음이 256의 배수일 때 */
export function eggCheckDue(state: DaycareState): boolean {
  return (state.slots[1]?.steps ?? 0) % 256 === 255
}

/** 한 걸음의 결과. 부화한 자리는 화면이 처리한다 */
export interface DaycareStep {
  daycare: DaycareState
  party: PokemonInstance[]
  /** 부화할 준비가 된 파티 자리. 없으면 -1 */
  hatched: number
}

export interface DaycareWorld {
  daycare: DaycareState
  party: PokemonInstance[]
  /** 오늘 날짜. 알 주기 길이가 열두 날에만 짧다 */
  month: number
  day: number
  abilityOf: (mon: PokemonInstance) => number
  dataOf: (species: number) => Species
  rng: Rng
  coin: () => boolean
}

/**
 * 육성가와 알의 한 걸음 (`Daycare_Update`).
 *
 * 세 가지가 한 걸음 안에서 순서대로 일어난다:
 *
 *   ① 맡긴 마리마다 걸음이 하나씩 는다 (경험치와 요금이 이걸 본다)
 *   ② 둘째 자리의 걸음이 256의 배수면 궁합을 굴려 **알이 생길 수 있다**
 *   ③ 전역 계수기가 한 바퀴(255 또는 230)를 돌면 파티의 알이 그만큼 깎인다
 *
 * ⚠️ **②가 걸음마다가 아니다.** 256걸음에 한 번이라, 궁합 70이어도 평균
 * 366걸음이 걸린다. 걸음마다 굴리면 몇 걸음 만에 알이 나온다
 */
export function daycareStep(world: DaycareWorld): DaycareStep {
  const state = world.daycare
  const slots = state.slots.map((s) => (s ? { ...s, steps: s.steps + 1 } : null))
  let eggPid = state.eggPid
  const filled = slots.filter(Boolean).length

  if (eggPid === 0 && filled === 2) {
    const advanced: DaycareState = { ...state, slots }
    if (eggCheckDue(advanced)) {
      const score = daycareCompatibility(advanced, world.dataOf)
      if (score > Math.floor(world.rng() * 100)) {
        eggPid = offspringPid(advanced, world.rng, world.coin)
      }
    }
  }

  let cycle = state.cycle + 1
  let party = world.party
  let hatched = -1
  if (cycle >= eggCycleLength(world.month, world.day)) {
    cycle = 0
    const toSubtract = hatchStep(party, world.abilityOf)
    party = party.map((mon) => {
      if (!mon.isEgg || hatched >= 0) return mon
      if (mon.friendship === 0) return mon
      return { ...mon, friendship: Math.max(0, mon.friendship - toSubtract) }
    })
    // 원작은 걸음이 0이 된 **첫 알**에서 멈추고 부화 장면으로 간다
    hatched = party.findIndex((mon) => mon.isEgg && mon.friendship === 0)
  }

  return { daycare: { slots, eggPid, cycle }, party, hatched }
}

// ── 맡기고 찾는다 ───────────────────────────────────────────────────────────

/** `constants/daycare.h`의 `DAYCARE_*`. 스크립트가 이 수로 갈라진다 */
export const DaycareState_ = {
  NO_MONS: 0,
  EGG_WAITING: 1,
  ONE_MON: 2,
  TWO_MONS: 3,
} as const

/** 지금 육성가가 어떤 상태인가 (`Daycare_GetState`) */
export function daycareState(state: DaycareState): number {
  if (state.eggPid !== 0) return DaycareState_.EGG_WAITING
  const count = state.slots.filter(Boolean).length
  return count === 0 ? DaycareState_.NO_MONS : count + 1
}

/**
 * 궁합을 **아저씨의 말투 네 단계**로 (`DaycareCompatibilityScoreToLevel`).
 *
 * ⚠️ 번호가 거꾸로다 — 0이 제일 좋고 3이 "서로 놀지도 않는다"다.
 * 점수 그대로 넘기면 대사가 정반대로 나온다
 */
export function compatibilityLevel(score: CompatibilityScore): number {
  if (score === Compatibility.MAX) return 0
  if (score === Compatibility.MED) return 1
  if (score === Compatibility.LOW) return 2
  return 3
}

/** 맡길 자리. 앞에서부터 빈 칸을 찾는다. 없으면 -1 */
export function emptySlot(state: DaycareState): number {
  return state.slots.findIndex((s) => s === null)
}

/**
 * 찾아갈 때 내는 돈 (`DaycareMon_BufferDaycarePrice`).
 *
 * **오른 레벨 × 100 + 100.** 한 레벨도 안 올랐어도 100원은 낸다
 */
export function daycarePrice(levelsGained: number): number {
  return levelsGained * 100 + 100
}

/**
 * 맡겨 둔 동안 오른 경험치 (`BoxPokemon_GiveExperience`).
 *
 * ⚠️ **걸음 하나가 경험치 1이다.** 레벨이 아니라 걸음이 그대로 경험치라,
 * 낮은 레벨은 쑥쑥 오르고 높은 레벨은 거의 안 오른다 — 그것이 육성가의 성질이다.
 * 100레벨은 안 받는다
 */
export const MAX_LEVEL = 100

/** 부화한 뒤의 친밀도. **종족 기본값이 아니라 120이다** (`Egg_CreateHatchedMonInternal`) */
export const HATCHED_FRIENDSHIP = 120

/**
 * 알을 깬다. 레벨 1짜리 개체가 되고 별명이 지워진다.
 *
 * **깬 자리가 만난 자리다** (`egg_hatch.c` → `sel = 6`). 알 자리는 그대로
 * 남아서, 메모가 "육성가에서 받아 여기서 깼다" 두 줄이 된다. 레벨은 안 새긴다 —
 * 부화한 개체의 메모에는 Lv 줄 자체가 없다
 */
export function hatch(mon: PokemonInstance, location: number, date = metToday()): PokemonInstance {
  return {
    ...mon,
    isEgg: false,
    friendship: HATCHED_FRIENDSHIP,
    nickname: null,
    origin: hatchedAt(mon.origin, location, date),
  }
}
