// 설정 (PLAN §3.2) — 원작의 `Options` 구조.
//
// 항목도 고를 값도 우리가 정한 것이 아니다. `options_menu` 뱅크(us#220)에 여섯
// 항목과 그 값이 그대로 적혀 있고, 이 파일은 그 번호를 담을 뿐이다.
//
// 리포트와 달리 설정은 **바뀌는 즉시 저장한다.** 원작도 설정은 세이브 블록이
// 아니라 따로 있는 값이라 리포트를 안 써도 남는다. 그래서 `localStorage`로
// 충분하다 — 타입드 배열이 없어서 JSON으로 나가도 잃는 것이 없다.
import { create } from 'zustand'
import { TEXT_SPEED } from '../engine/script/printer'

/** `options_menu`의 10·11·12번 — 느리게 · 보통 · 빠르게 */
export type TextSpeed = 0 | 1 | 2 | 3
/** 13·14번 — 본다 · 보지 않는다 */
export type BattleScene = 0 | 1
/** 15·16번 — 교체 · 토너먼트 */
export type BattleRule = 0 | 1
/** 17·18번 — 스테레오 · 모노 */
export type SoundMode = 0 | 1
/** 3인칭 · 1인칭. 원작에 없는 우리 항목이다 */
export type ViewMode = 0 | 1
/** 배틀이 흐르는 빠르기. 원작에 없는 우리 항목이다 */
export type BattlePace = 0 | 1 | 2

export interface Options {
  speed: TextSpeed
  battleScene: BattleScene
  battleRule: BattleRule
  sound: SoundMode
  /** 카메라 시점. 원작에 없다 — 3D로 옮기면서 생긴 자리다 */
  view: ViewMode
  /** 배틀 진행. 원작에 없다 — 아래 참조 */
  battlePace: BattlePace
}

/**
 * 설정의 속도 → 인쇄기의 글자당 프레임.
 *
 * 앞 셋은 `Options_TextFrameDelay`가 주는 그대로다 — 느림 8 · 보통 4 · 빠름 1.
 * 원작 기본값이 "보통"이고 화면에 뜨는 것도 이 셋뿐이다.
 *
 * **네 번째는 우리가 연 자리다.** 값 자체는 지어낸 것이 아니라 `include/text.h`의
 * `TEXT_SPEED_INSTANT`(0)이고, 원작도 알림창 같은 데서 쓴다 — 설정 화면에만
 * 안 걸려 있었다. 대기 없이 프레임마다 한 자씩이라 60자/초다
 */
export const SPEED_FRAMES: readonly number[] = [
  TEXT_SPEED.slow, TEXT_SPEED.normal, TEXT_SPEED.fast, TEXT_SPEED.instant,
]

/**
 * 배틀 박자의 쉼에 곱하는 값.
 *
 * `engine/battle/playback`이 내는 길이는 **원작 그대로**다 — 글 하나에
 * `WaitButtonABTime 30`, 게이지는 `UpdateGauge`가 프레임마다 한 칸. 그 숫자는
 * 자료라서 안 건드린다. 대신 화면에 접을 때 여기서 곱한다.
 *
 * 원작이 느리다는 말은 오래된 불평이고 사실이다. 재 보면 후반 한 턴이 13.7초인데
 * 그중 11초가 글이다 — 게이지가 아니라 **글자 찍기와 줄마다 30프레임 머무름**이
 * 대부분이다. 그래서 이 곱은 머무름·게이지·기절에 다 걸린다
 */
export const BATTLE_PACE: readonly number[] = [1, 0.5, 0.25]

// 기본 글자 속도를 "빠름"으로 둔다. 원작 기본은 "보통"이지만 그건 원작이 느리다고
// 오래 비판받은 바로 그 값이고, 셋 다 원작이 내놓는 값이라 무엇을 기본으로 삼든
// 지어낸 속도는 아니다. 원작대로 보고 싶으면 설정에서 한 칸 왼쪽이다
const DEFAULTS: Options = {
  speed: 2, battleScene: 0, battleRule: 0, sound: 0, view: 0, battlePace: 1,
}

// ⚠️ localStorage 키다. 바꾸면 이미 맞춰 둔 설정이 통째로 기본값으로 돌아간다
const KEY = 'pt3d.options'

function load(): Options {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    // 모르는 항목은 기본값으로 둔다. 옛 설정이 남아 있어도 화면이 안 깨진다
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Options>) }
  } catch {
    return DEFAULTS
  }
}

interface OptionsStore extends Options {
  set: <K extends keyof Options>(key: K, value: Options[K]) => void
  reset: () => void
}

export const useOptionsStore = create<OptionsStore>()((set, get) => ({
  ...load(),

  set: (key, value) => {
    set({ [key]: value } as Partial<Options>)
    save(get())
  },

  reset: () => {
    set(DEFAULTS)
    save(DEFAULTS)
  },
}))

function save(o: Options): void {
  const { speed, battleScene, battleRule, sound, view, battlePace } = o
  try {
    localStorage.setItem(KEY, JSON.stringify({
      speed, battleScene, battleRule, sound, view, battlePace,
    }))
  } catch { /* 사생활 보호 모드면 못 쓴다. 이번 판만 유지된다 */ }
}

/** 인쇄기에 넘길 글자 속도. 화면 여러 곳이 같은 값을 봐야 한다 */
export function textSpeedFrames(): number {
  return SPEED_FRAMES[useOptionsStore.getState().speed] ?? TEXT_SPEED.normal
}

/** 배틀 박자의 쉼에 곱할 값 */
export function battlePaceScale(): number {
  return BATTLE_PACE[useOptionsStore.getState().battlePace] ?? 1
}
