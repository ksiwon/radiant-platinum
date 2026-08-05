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
export type TextSpeed = 0 | 1 | 2
/** 13·14번 — 본다 · 보지 않는다 */
export type BattleScene = 0 | 1
/** 15·16번 — 교체 · 토너먼트 */
export type BattleRule = 0 | 1
/** 17·18번 — 스테레오 · 모노 */
export type SoundMode = 0 | 1
/** 3인칭 · 1인칭. 원작에 없는 우리 항목이다 */
export type ViewMode = 0 | 1

export interface Options {
  speed: TextSpeed
  battleScene: BattleScene
  battleRule: BattleRule
  sound: SoundMode
  /** 카메라 시점. 원작에 없다 — 3D로 옮기면서 생긴 자리다 */
  view: ViewMode
}

/**
 * 설정의 속도 → 인쇄기의 글자당 프레임.
 *
 * `include/text.h`의 값이다. 원작 기본값이 "보통"이고 그것이 4프레임이다
 */
export const SPEED_FRAMES: readonly number[] = [TEXT_SPEED.slow, TEXT_SPEED.normal, TEXT_SPEED.fast]

const DEFAULTS: Options = { speed: 1, battleScene: 0, battleRule: 0, sound: 0, view: 0 }

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
  const { speed, battleScene, battleRule, sound, view } = o
  try {
    localStorage.setItem(KEY, JSON.stringify({ speed, battleScene, battleRule, sound, view }))
  } catch { /* 사생활 보호 모드면 못 쓴다. 이번 판만 유지된다 */ }
}

/** 인쇄기에 넘길 글자 속도. 화면 여러 곳이 같은 값을 봐야 한다 */
export function textSpeedFrames(): number {
  return SPEED_FRAMES[useOptionsStore.getState().speed] ?? TEXT_SPEED.normal
}
