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
import type { DataLocale } from '../data/gameData'

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
/** `LANGUAGES`의 자리. 원작에 없는 우리 항목이다 — 아래 참조 */
export type Language = 0 | 1 | 2

/**
 * 고를 수 있는 언어.
 *
 * **원작에는 이 항목이 없다.** DS 롬은 언어마다 따로 찍혀 나왔고, 그래서 게임
 * 안에서 언어를 바꿀 자리가 없었다. 우리는 롬 두 개에서 뽑은 글을 같이 싣고
 * 있으니 바꿀 수 있다 — 지어낸 번역이 아니라 **그 나라 롬에 찍힌 글**이다.
 *
 * 셋 다 뱅크가 실려 있다(`public/data/dialogue`). 일본어는 뱅크 447개 중
 * `game_corner` 하나가 일본 롬에 아예 없어서 그 맵만 글이 빈다 — 열쇠 표와
 * 항목 수 정렬이 **둘 다 없다고** 말하는 자리라 우리 실수가 아니다
 */
export const LANGUAGES: readonly DataLocale[] = ['ko', 'en', 'ja']

/** 언어 이름은 그 언어로 적는다. 어느 화면에서나 같다 */
export const LANGUAGE_NAMES: Readonly<Record<DataLocale, string>> = {
  ko: '한국어', en: 'English', ja: '日本語',
}

/**
 * 지금 **실제로 설치된** 언어.
 *
 * ⚠️ 개발판은 세 벌이 다 있어서 `LANGUAGES` 그대로다. 공개판은 사용자가 고른
 * 롬 하나에서 나온 언어뿐이다 — 설치 매니페스트가 정한다 (`app/boot.ts`).
 * 이 구별이 없으면 한국어 롬만 넣은 사람에게 영어·일본어 칸이 보이고,
 * 고르면 글이 통째로 빈다
 */
let installed: readonly DataLocale[] = LANGUAGES

export function availableLanguages(): readonly DataLocale[] {
  return installed
}

/** 설치 매니페스트가 부른다. 모르는 코드는 버린다 */
export function setAvailableLocales(locales: readonly string[]): void {
  const known = locales.filter((l): l is DataLocale => (LANGUAGES as readonly string[]).includes(l))
  // 하나도 못 알아들으면 그대로 둔다 — 언어를 0개로 만들면 화면이 아무것도 못 고른다
  installed = known.length > 0 ? known : LANGUAGES
  // ⚠️ 지금 고른 언어가 설치 목록에 없으면 첫 번째로 되돌린다. 안 그러면
  // "영어"가 선택된 채로 글이 전부 빈다
  const state = useOptionsStore.getState()
  const now = LANGUAGES[state.language]
  if (now !== undefined && !installed.includes(now)) {
    const first = LANGUAGES.indexOf(installed[0]!)
    if (first >= 0) state.set('language', first as Language)
  }
}

export interface Options {
  speed: TextSpeed
  battleScene: BattleScene
  battleRule: BattleRule
  sound: SoundMode
  /** 카메라 시점. 원작에 없다 — 3D로 옮기면서 생긴 자리다 */
  view: ViewMode
  /** 배틀 진행. 원작에 없다 — 아래 참조 */
  battlePace: BattlePace
  /** 글의 언어. 원작에 없다 — `LANGUAGES` 참조 */
  language: Language
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
  speed: 2, battleScene: 0, battleRule: 0, sound: 0, view: 0, battlePace: 1, language: 0,
}

const KEY = 'radiant-platinum.options'
/**
 * 이름을 바꾸기 전 키.
 *
 * ⚠️ **키만 갈면 이미 맞춰 둔 설정이 통째로 기본값으로 돌아간다.** 글자 속도나
 * 시점처럼 한 번 맞추고 잊는 것들이라 되돌아간 것을 눈치채기도 어렵다.
 * 처음 읽을 때 옛 키를 한 번 본다
 */
const OLD_KEY = 'pt3d.options'

function load(): Options {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY)
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
  const { speed, battleScene, battleRule, sound, view, battlePace, language } = o
  try {
    localStorage.setItem(KEY, JSON.stringify({
      speed, battleScene, battleRule, sound, view, battlePace, language,
    }))
    // 새 키로 한 번 쓰고 나면 옛 키는 헷갈리게만 한다
    localStorage.removeItem(OLD_KEY)
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

/**
 * 지금 언어의 자료 로케일.
 *
 * 자료를 부르는 자리가 스무 곳 남짓인데 전부 `'ko'`를 손으로 적고 있었다.
 * 그 자리들이 **같은 값을 봐야** 설정에서 바꾼 것이 화면 전체에 먹는다 —
 * 한 군데만 빠뜨리면 도감만 한국어로 남는 식으로 조용히 어긋난다
 */
export function gameLocale(): DataLocale {
  return LANGUAGES[useOptionsStore.getState().language] ?? 'ko'
}

/** 화면용. 언어가 바뀌면 다시 그려지고, 자료를 다시 받을 계기가 된다 */
export function useGameLocale(): DataLocale {
  return useOptionsStore((s) => LANGUAGES[s.language] ?? 'ko')
}
