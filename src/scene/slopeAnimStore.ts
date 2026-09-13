// 자전거 진흙 비탈이 **한 번 흐르는** 자리 (PARITY §1.9 · DATA §2.31)
//
// 소품 303·304의 클립 둘은 **저절로 안 돈다.** 목차가 그 둘에만
// `isBicycleSlope`를 세워 두고, 적재기가 그 자리에서 `paused = TRUE` ·
// `loopCount = 1`을 박는다 (`overlay005/map_prop_animation.c` 223줄).
// 트는 것은 필드가 매 틱 도는 일 하나다 (`ov5_021EE768`):
//
//   ① 주인공의 **칸이 바뀌었는가.** 안 바뀌었으면 그대로 돌아간다
//   ② 그 칸의 거동값이 비탈 아래(0xDA)면 클립 **0**, 위(0xD9)면 클립 **1**
//   ③ 그 자리에 **걸리는 소품**을 찾아(`FindCollidingLoadedMapPropByModelIDs`,
//      모델 후보가 `bike_muddy_slope`·`bike_dungeon_muddy_slope` 둘뿐이다)
//      첫 프레임으로 돌리고 `paused = FALSE` · `StartLoop` (`ov5_021D4D78`)
//   ④ 한 바퀴가 끝나면 매니저가 그 애니를 렌더 오브젝트에서 **뗀다**
//      (`BicycleSlopeAnimation_ResetFinishedAnimations`) — 곧 기본 자세로 돌아간다
//
// ⚠️ **자전거를 탔는지는 안 묻는다.** 그 함수에 `PlayerAvatar_IsCycling`이 없다 —
// 걸어서 비탈 아래 칸을 밟아도 흙이 한 번 흐른다. 오르는 규칙(전속력만)은
// 움직임 쪽이 따로 든다 (`engine/actor/bikeTerrain`).
//
// ⚠️ **소품 자리는 늘 「아래 칸」이다.** 원작은 상자를 만들어 찾지만, 이 자료에서는
// 짝과 소품이 **열일곱 대 열일곱으로 정확히 맞고** 소품이 전부 아래 칸에 앉아
// 있다 (실측 `.audit/probe/slopeProps.mjs` — 오버월드 14 · 실내 75번 격자 3,
// 모든 짝에서 소품 칸 − 위 칸 = (0, +1)). 그래서 위 칸을 밟으면 z+1, 아래 칸을
// 밟으면 그 칸이 소품 자리다.
import { create } from 'zustand'

/** 지금 한 번 흐르고 있는 비탈 하나 */
interface SlopePlay {
  /** 소품이 놓인 칸 */
  x: number
  z: number
  /** 몇 번째 클립인가 — 0이 아래(`cy_slope_botm`) · 1이 위(`cy_slope_top`) */
  clip: number
  /** 튼 시각 (`performance.now()`). 지난 프레임 수를 여기서 센다 */
  since: number
}

interface SlopeAnimStore {
  /** `"x,z"` → 그 소품의 재생. **끝난 것도 남는다** (아래 주석) */
  plays: Record<string, SlopePlay>
  play: (x: number, z: number, clip: number) => void
  clear: () => void
}

const key = (x: number, z: number): string => `${String(x)},${String(z)}`

/**
 * 비탈 소품과 R3F 메시 사이의 상태 다리 (`scene/doorVisualStore`와 같은 자리).
 *
 * ⚠️ **끝난 재생을 굳이 안 지운다.** 클립의 첫 프레임이 곧 기본 자세라
 * (실측: 두 클립 다 V가 0에서 −128로 흐르고 frame 0이 0이다) 다 흐른 뒤에는
 * 그리는 쪽이 스스로 프레임 0으로 앉는다 — 지우는 타이머를 두면 그 타이머가
 * 화면과 어긋나는 순간이 새로 생긴다. 남는 것은 맵 하나에 많아야 열일곱 줄이고,
 * 맵을 옮길 때 통째로 비운다 (`scene/MapStreamer`)
 */
export const useSlopeAnimStore = create<SlopeAnimStore>()((set) => ({
  plays: {},
  play: (x, z, clip) => {
    set((state) => ({
      plays: { ...state.plays, [key(x, z)]: { x, z, clip, since: performance.now() } },
    }))
  },
  clear: () => { set({ plays: {} }) },
}))

/** 그 칸의 소품이 지금 돌고 있는 것. 없으면 null */
export function slopePlayAt(
  plays: Readonly<Record<string, SlopePlay>>, x: number, z: number,
): SlopePlay | null {
  return plays[key(x, z)] ?? null
}
