// 날이 바뀔 때 스크립트 변수·깃발에 하는 일 (`FieldSystem_HandleDailyEvents` · `unk_020559DC.c:87-117`)
//
// 씨앗을 굴리는 쪽(`daily.ts`의 `rollOver`)과 포켓러스(`pokerus.ts`)는 따로 있다. 여기는 **변수와 깃발**만 본다 —
// 원작 순서 그대로: 하루 깃발을 지우고 → 신문사 마감을 줄이고 → 오늘의 레벨을 굴리고 → 별장 손님을 뽑고 → 숨은 도구 몇 개를
// 되살린다.
//
// ⚠️ **하루 깃발이 한 번도 안 지워지고 있었다.** 그래서 한 번 받은 하루 선물·배틀그라운드의 오늘의 넷·숲의 양옥
// 로토무 같은 「오늘 한 번」이 첫날 뒤로 영영 닫혀 있었다 (COMPLETION 1단계)
import { VAR_DAILY_RANDOM_LEVEL, VAR_NEWS_PRESS_DEADLINE, rollDailyRandomLevel } from '../script/commands'
import { updateVillaVisitor } from './villa'

/** `DAILY_FLAGS_START` · `DAILY_FLAGS_END` — 이 사이를 통째로 0으로 민다 (`FieldSystem_ClearDailyFlags`) */
export const DAILY_FLAGS_START = 2720
export const DAILY_FLAGS_END = 2911

/**
 * 날마다 되살아나는 숨은 도구 (`FieldSystem_ClearDailyHiddenItemFlags` · `script_manager.c:541-580`).
 *
 * 무쇠섬의 별의조각 넷 중 둘(자리를 두 번 뽑는다 · 겹칠 수 있다)과 꽃밭의 달콤한꿀 여섯 중 둘. **그 맵에 서 있으면
 * 안 되살린다** — 보는 앞에서 도구가 생기지 않게
 */
const IRON_ISLAND_STAR_PIECES: readonly (readonly [map: number, flag: number])[] = [
  [291, 782], [292, 783], [293, 784], [293, 785],
]
const MAP_FLOAROMA_MEADOW = 256
const FLOAROMA_MEADOW_HONEY: readonly number[] = [788, 789, 949, 950, 951, 952]

interface DailyVars {
  get: (id: number) => number
  set: (id: number, value: number) => void
  checkFlag: (id: number) => boolean
  clearFlag: (id: number) => void
}

/**
 * 하루(또는 며칠)가 지났다.
 *
 * @param days 지난 날 수. 0 이하면 아무것도 안 한다 (시계를 뒤로 돌린 경우도 원작처럼 안 굴린다)
 * @param mapId 지금 서 있는 맵 — 숨은 도구를 그 맵에서는 안 되살린다
 * @param rand `rand(n)`이 0~n−1
 */
export function handleDailyEvents(
  vars: DailyVars, days: number, mapId: number, rand: (bound: number) => number,
): void {
  if (days <= 0) return
  for (let id = DAILY_FLAGS_START; id <= DAILY_FLAGS_END; id++) vars.clearFlag(id)
  const deadline = vars.get(VAR_NEWS_PRESS_DEADLINE)
  vars.set(VAR_NEWS_PRESS_DEADLINE, deadline > days ? deadline - days : 0)
  vars.set(VAR_DAILY_RANDOM_LEVEL, rollDailyRandomLevel(rand))
  updateVillaVisitor(vars, mapId, () => rand(0x10000))
  for (let i = 0; i < 2; i++) {
    const [map, flag] = IRON_ISLAND_STAR_PIECES[rand(IRON_ISLAND_STAR_PIECES.length)]!
    if (map !== mapId) vars.clearFlag(flag)
  }
  if (mapId !== MAP_FLOAROMA_MEADOW) {
    for (let i = 0; i < 2; i++) vars.clearFlag(FLOAROMA_MEADOW_HONEY[rand(FLOAROMA_MEADOW_HONEY.length)]!)
  }
}
