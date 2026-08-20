// 꿀 나무 21그루 (PARITY §6.6) — `overlay005/honey_tree.c`
//
// 도로와 들판에 서 있는 나무 스물한 그루에 꿀을 바르고 여섯 시간 뒤에 오면
// 흔들리고 있다. 무엇이 붙었는지는 **바르는 순간** 정해진다 — 여섯 시간을
// 기다리는 동안 이미 정해져 있고, 흔들리는 횟수가 그 힌트다.
//
// ⚠️ **하루 한 그루가 아니라 스물한 그루가 각자 돈다.** 그루마다 남은 분이
// 따로 있고 실제 시계로 깎인다 (`SpecialEncounter_DecrementHoneyTreeTimers`가
// 지나간 분만큼).
//
// ⚠️ **먹이몬이 붙는 나무 넷은 트레이너 번호가 정한다.** 리포트마다 다르고
// 바뀌지 않는다 (`IsMunchlaxTree`) — 남의 리포트에서 먹이몬이 나온 나무가
// 내 리포트에서도 나오지 않는다. 이 넷이 없으면 먹이몬을 영영 못 만난다.
//
// ⚠️ **같은 나무에 연달아 바르면 90%로 앞의 무리가 그대로다.** 원작이
// 「마지막으로 바른 그루」 하나를 들고 그것과 같으면 무리를 다시 안 뽑는다 —
// 자리와 흔들림만 다시 뽑는다. 이게 연쇄를 만든다.

/** `NUM_HONEY_TREES` */
export const HONEY_TREE_COUNT = 21

/**
 * 나무가 선 맵 21곳 (`sHoneyTreeMapHeaderIDs`). **차례가 곧 그루 번호**다 —
 * 먹이몬 나무를 트레이너 번호에서 뽑을 때 이 번호를 쓴다
 */
export const HONEY_TREE_MAPS: readonly number[] = [
  347, 349, 350, 353, 354, 356, 362, 363, 366, 367, 371,
  373, 380, 382, 388, 392, 395, 200, 202, 204, 256,
]

/** `res/field/props/models/meson.build`의 `honey_tree.nsbmd` 줄 번호 */
export const HONEY_TREE_MODEL = 26

/** `constants/honey_tree.h`. **1부터 센다** — 0은 쓰지 않는다 */
export const TREE_STATUS = { bare: 1, slathered: 2, encounter: 3 } as const

/** 바르면 하루치가 찬다 (`24 * 60`) */
export const SLATHER_MINUTES = 24 * 60
/** 여섯 시간이 지나야 붙는다 — 남은 분이 18시간 이하로 떨어졌을 때다 */
export const RIPE_MINUTES = 18 * 60

/** `TREE_GROUP_*`. 0은 「아무것도 안 붙었다」 */
export const TREE_GROUP = { none: 0, a: 1, b: 2, c: 3 } as const

/** 한 그루의 상태 (`HoneyTree`) */
export interface HoneyTreeState {
  /** 남은 분. 0이면 맨 나무다 */
  minutesRemaining: number
  /** `TREE_GROUP_*` */
  group: number
  /** 출현표의 여섯 칸 중 하나 */
  slot: number
  /** 표 번호 0·1·2 (`encountersEx.honeyTree`의 common·uncommon·rare) */
  table: number
  /** 흔들리는 횟수 0~3 */
  shakes: number
}

function newHoneyTree(): HoneyTreeState {
  return { minutesRemaining: 0, group: TREE_GROUP.none, slot: 0, table: 0, shakes: 0 }
}

/** 스물한 그루와 마지막으로 바른 그루 (`PlayerHoneyTreeStates`) */
export interface HoneyTreesState {
  trees: HoneyTreeState[]
  /** 마지막으로 바른 그루. 아직 없으면 −1 */
  lastSlathered: number
}

export function newHoneyTrees(): HoneyTreesState {
  return {
    trees: Array.from({ length: HONEY_TREE_COUNT }, newHoneyTree),
    lastSlathered: -1,
  }
}

/** 그 맵의 그루 번호. 나무가 없는 맵이면 −1 */
export function honeyTreeOf(mapId: number): number {
  return HONEY_TREE_MAPS.indexOf(mapId)
}

/**
 * 지금 무슨 상태인가 (`HoneyTree_GetTreeSlatherStatus`).
 *
 * ⚠️ **바른 지 여섯 시간이 지났는지를 「남은 분」으로 잰다.** 하루치(1440)에서
 * 여섯 시간이 깎여 1080 이하로 내려왔으면 붙은 것이다. 0은 그냥 맨 나무고,
 * 그 사이는 아직 바르고 기다리는 중이다
 */
export function honeyTreeStatus(tree: HoneyTreeState): number {
  if (tree.minutesRemaining > 0 && tree.minutesRemaining <= RIPE_MINUTES) {
    return TREE_STATUS.encounter
  }
  return tree.minutesRemaining !== 0 ? TREE_STATUS.slathered : TREE_STATUS.bare
}

/** 지나간 분만큼 스물한 그루를 한꺼번에 깎는다 (`..._DecrementHoneyTreeTimers`) */
export function elapseHoneyTrees(state: HoneyTreesState, minutes: number): HoneyTreesState {
  if (minutes <= 0) return state
  let changed = false
  const trees = state.trees.map((tree) => {
    if (tree.minutesRemaining === 0) return tree
    changed = true
    return { ...tree, minutesRemaining: Math.max(0, tree.minutesRemaining - minutes) }
  })
  return changed ? { ...state, trees } : state
}

/**
 * 먹이몬이 붙을 수 있는 나무 넷 (`IsMunchlaxTree`).
 *
 * 트레이너 번호의 **네 바이트**를 각각 21로 나눈 나머지다. 겹치면 뒤의 것을
 * 하나씩 밀어서 **늘 서로 다른 넷**을 만든다 — 밀지 않으면 번호에 따라
 * 후보가 셋이나 둘로 줄어든다.
 *
 * ⚠️ **32비트 전체를 본다.** 보이는 다섯 자리(하위 16비트)만 넣으면 위의 두
 * 바이트가 늘 0이라 넷 중 둘이 0번과 1번 나무로 고정된다
 */
export function munchlaxTrees(trainerId32: number): number[] {
  const id = trainerId32 >>> 0
  const ids = [
    (id >>> 24) & 0xff, (id >>> 16) & 0xff, (id >>> 8) & 0xff, id & 0xff,
  ].map((b) => b % HONEY_TREE_COUNT)
  for (let i = 1; i < 4; i++) {
    for (let j = 0; j < i; j++) {
      if (ids[j] === ids[i]) {
        ids[i]!++
        if (ids[i]! >= HONEY_TREE_COUNT) ids[i] = 0
      }
    }
  }
  return ids
}

export function isMunchlaxTree(trainerId32: number, treeId: number): boolean {
  return munchlaxTrees(trainerId32).includes(treeId)
}

/**
 * 무리를 뽑는다 (`GetTreeEncounterGroup`).
 *
 * 보통 나무는 없음 10 · B 20 · A 70이고, 먹이몬 나무는 C 1 · 없음 9 · A 20 ·
 * B 70이다. **먹이몬 나무는 A와 B가 뒤바뀐다** — 원작 주석이 적어 둔 그대로다
 *
 * @param roll 0~99 (`LCRNG_RandMod(100)`)
 */
export function rollTreeGroup(munchlax: boolean, roll: number): number {
  if (munchlax) {
    if (roll < 1) return TREE_GROUP.c
    if (roll < 10) return TREE_GROUP.none
    if (roll < 30) return TREE_GROUP.a
    return TREE_GROUP.b
  }
  if (roll < 10) return TREE_GROUP.none
  if (roll < 30) return TREE_GROUP.b
  return TREE_GROUP.a
}

/** 여섯 칸 중 하나 (`GetTreeEncounterSlot`). 40·20·20·10·5·5 */
export function rollTreeSlot(roll: number): number {
  if (roll < 5) return 5
  if (roll < 10) return 4
  if (roll < 20) return 3
  if (roll < 40) return 2
  if (roll < 60) return 1
  return 0
}

/** 무리 → 출현표 번호 (`GetEncounterTableFromGroup`). 사실상 무리 − 1이다 */
export function tableOfGroup(group: number): number {
  if (group === TREE_GROUP.c) return 2
  if (group === TREE_GROUP.b) return 1
  return 0
}

/**
 * 흔들리는 횟수 (`GetShakesFromGroup`).
 *
 * 무리마다 다르고, 실측한 백 칸의 분포는 이렇다 (0·1·2·3 차례):
 *
 *   없음  80 · 18 ·  1 ·  1
 *   A     20 · 60 · 19 ·  1
 *   B      1 · 20 · 75 ·  4
 *   C      1 ·  1 ·  5 · 93
 *
 * ⚠️ **세 번 흔들리는 나무의 93%가 먹이몬 무리지만 전부는 아니다.** 없음과 A가
 * 1%, B가 4%로 같은 값을 낸다 — 「세 번이면 먹이몬」이 아니라 「세 번이면 거의
 * 먹이몬」이다. 반대로 먹이몬 무리가 한 번만 흔들리는 일도 1%로 있다
 */
export function rollTreeShakes(group: number, roll: number): number {
  if (group === TREE_GROUP.c) {
    if (roll < 5) return 2
    if (roll < 6) return 1
    if (roll < 7) return 0
    return 3
  }
  if (group === TREE_GROUP.b) {
    if (roll < 75) return 2
    if (roll < 95) return 1
    if (roll < 96) return 0
    return 3
  }
  if (group === TREE_GROUP.a) {
    if (roll < 19) return 2
    if (roll < 79) return 1
    if (roll < 99) return 0
    return 3
  }
  if (roll < 1) return 2
  if (roll < 19) return 1
  if (roll < 99) return 0
  return 3
}

/**
 * 흔들리는 그림의 애니 번호 (`GetShakingValue`).
 *
 * 세 번 → 2 · 두 번 → 1 · 한 번 → 0 · 안 흔들림 → null. 번호가 곧 세기다 —
 * 원작 모델에 애니 세 벌이 들어 있고 큰 번호가 크게 흔든다
 */
export function shakeAnimation(shakes: number): number | null {
  if (shakes === 3) return 2
  if (shakes === 2) return 1
  if (shakes === 1) return 0
  return null
}

/** 꿀을 바를 때 굴리는 세 값. 부르는 쪽이 `LCRNG_RandMod(100)` 셋을 준다 */
interface SlatherRolls {
  /** 같은 나무에 연달아 바를 때의 90% 판정 */
  keep: number
  group: number
  slot: number
  shakes: number
}

/**
 * 꿀을 바른다 (`HoneyTree_SlatherTree`).
 *
 * ⚠️ **같은 나무를 연달아 바르면 무리를 다시 안 뽑는다** — 90%로 그대로다.
 * 그때는 자리와 흔들림만 새로 뽑고 표 번호도 안 건드린다. 이걸 빼면 좋은
 * 무리가 붙은 나무를 이어 갈 수가 없다.
 *
 * ⚠️ **아무것도 안 붙으면 남은 분이 0으로 되돌아간다** — 바르자마자 맨
 * 나무다. 그래서 여섯 시간 뒤에 가 보면 아무 일도 없다
 */
export function slatherTree(
  state: HoneyTreesState, treeId: number, munchlax: boolean, rolls: SlatherRolls,
): HoneyTreesState {
  const before = state.trees[treeId]
  if (!before) return state
  const trees = [...state.trees]

  if (state.lastSlathered === treeId && rolls.keep < 90) {
    trees[treeId] = {
      ...before,
      minutesRemaining: SLATHER_MINUTES,
      slot: rollTreeSlot(rolls.slot),
      shakes: rollTreeShakes(before.group, rolls.shakes),
    }
    // ⚠️ 이 가지는 `lastSlathered`를 **안 고친다.** 원작이 그 자리에서
    // 곧바로 return 해서 `SetLastSlatheredTreeId`에 안 닿는다 — 같은
    // 나무라 값이 어차피 같다
    return { ...state, trees }
  }

  const group = rollTreeGroup(munchlax, rolls.group)
  const next: HoneyTreeState = group === TREE_GROUP.none
    ? { minutesRemaining: 0, group, slot: 0, table: 0, shakes: rollTreeShakes(group, rolls.shakes) }
    : {
      minutesRemaining: SLATHER_MINUTES,
      group,
      slot: rollTreeSlot(rolls.slot),
      table: tableOfGroup(group),
      shakes: rollTreeShakes(group, rolls.shakes),
    }
  trees[treeId] = next
  return { trees, lastSlathered: treeId }
}

/** 붙은 것을 떼어 낸다 (`HoneyTree_Unslather`). 배틀이 시작할 때 돈다 */
export function unslatherTree(state: HoneyTreesState, treeId: number): HoneyTreesState {
  const before = state.trees[treeId]
  if (!before || before.minutesRemaining === 0) return state
  const trees = [...state.trees]
  trees[treeId] = { ...before, minutesRemaining: 0 }
  return { ...state, trees }
}

// ── 붙는 마리 ────────────────────────────────────────────────────────────────

/** 표 세 벌의 차례. `encountersEx.honeyTree`의 키와 같다 */
const HONEY_TABLES = ['common', 'uncommon', 'rare'] as const

/** 그 나무에 붙은 종족 (`HoneyTree_GetSpecies`) */
export function honeyTreeSpecies(
  tree: HoneyTreeState, tables: Record<string, readonly number[]>,
): number {
  const table = tables[HONEY_TABLES[tree.table] ?? 'common']
  return table?.[tree.slot] ?? 0
}

/** 레벨 범위 (`CreateWildMon_HoneyTree` — `5 + LCRNG_RandMod(15 - 5 + 1)`) */
export const HONEY_LEVELS = { min: 5, max: 15 } as const

/**
 * 붙은 마리의 레벨.
 *
 * ⚠️ **선두의 특성이 레벨을 끌어올린다** — 의욕·의기양양·프레셔가 있으면
 * 절반의 확률로 **무조건 최고 레벨**이다. 야생 조우의 「레벨 밀기」와 같은
 * 규칙이고 여기서도 돈다 (`encounterLead`)
 *
 * @param roll 0~10 (`LCRNG_RandMod(11)`)
 * @param boost 선두가 의욕·의기양양·프레셔인가 (`encounterLead.pushesLevel`)
 * @param boostRoll 0 또는 1 (`LCRNG_RandMod(2)`). **1일 때만** 밀어 올린다
 */
export function honeyTreeLevel(roll: number, boost: boolean, boostRoll: number): number {
  const level = HONEY_LEVELS.min + roll
  return boost && boostRoll !== 0 ? HONEY_LEVELS.max : level
}

