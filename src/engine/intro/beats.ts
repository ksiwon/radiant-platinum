// 인트로 박자 — 마박사의 말부터 주인공이 작아져 떠나기까지.
//
// 원작에서 이 장면은 필드 스크립트가 아니라 따로 도는 응용 프로그램이다
// (`applications/rowan_intro/rowan_intro_app.c`). 그래서 바이트코드가 없고,
// 상태 기계를 여기 옮긴다. **원작의 글은 한 자도 짓지 않는다** — 전부
// `rowan_intro` 뱅크(us#389)의 45줄이고 이 파일은 그 번호만 든다.
//
// 차례는 원작 상태 기계 그대로다. `rowan_intro_app.c`에서 글을 띄우는 자리만
// 뽑으면 이 순서다 (`RowanIntro_DisplayMessage` 호출 차례):
//
//   HelloThere → MyNameRowan → [되묻기] → WidelyInhabited → HavePokeBall →
//   LiveAlongsidePokemon → AboutYourself → 성별 → 이름 →
//   **SoYoure** → 라이벌 이름 → **EndDialogue**
//
// ⚠️ **`SoYoure`와 `EndDialogue`가 특히 중요하다.**
// `SoYoure`(「…라고 하는가! 여기 있는 이 소년은 자네의 친구였지?」)가 **라이벌을
// 화면에 세우는 말**이다. 이 줄이 없으면 용식이가 아무 소개 없이 툭 나타난다.
// `EndDialogue`는 마박사가 마지막으로 하는 말이고, 이 줄이 없으면 라이벌 이름을
// 정하자마자 화면이 끊긴다 — 실제로 한동안 둘 다 없어서 그렇게 보였다.
//
// 우리 인사(`welcomeText.ts`)만 원작에 없는 것이고 맨 앞에 한 번 든다 — 이 세계가
// 무엇이고 누가 만들었으며 어디로 가면 그 사람을 볼 수 있는지를 말하는 자리다.
import { INTRO_TEXT } from '../../data/uiText'

/** 한 박자가 무엇을 하는가 */
export type IntroStep =
  /** 글 한 줄. `line`은 `rowan_intro` 뱅크의 자리다 */
  | { kind: 'say'; line: number }
  /** **우리 글**. 뱅크가 아니라 `welcomeText.ts`에서 온다 */
  | { kind: 'ours' }
  /** 무엇을 더 알고 싶은지 (조작 · 모험 · 괜찮다) */
  | { kind: 'infoMenu' }
  /** 몬스터볼을 누르는 자리. 클릭하면 열린다 */
  | { kind: 'pokeBall' }
  /** 남자인가 여자인가 */
  | { kind: 'gender' }
  /** 이름을 짓는다. `who`가 누구 것인지 */
  | { kind: 'name'; who: 'player' | 'rival' }
  /** 마지막 말 뒤 — 마박사가 사라지고 주인공이 작아진다 (`outroLook`) */
  | { kind: 'outro' }
  /** 끝. 필드로 넘어간다 */
  | { kind: 'done' }

/**
 * 곧게 흐르는 부분.
 *
 * 되묻는 자리(조작 설명·성별·이름)는 답에 따라 갈리므로 여기 안 넣고 화면이
 * 다룬다. 이 목록은 "무엇을 어떤 순서로"만 정한다.
 */
export const INTRO: readonly IntroStep[] = [
  // 우리 인사 하나로 시작한다 (`welcomeText`) — 여기만 원작에 없다
  { kind: 'ours' },
  // RI_STATE_DIALOGUE_HELLO · RI_STATE_DIALOGUE_MY_NAME
  { kind: 'say', line: INTRO_TEXT.hello },
  { kind: 'say', line: INTRO_TEXT.myName },
  // RI_STATE_INFO_* — 조작 · 모험 · 괜찮다
  { kind: 'infoMenu' },
  // RI_STATE_DIALOGUE_WIDELY_INHABITED
  { kind: 'say', line: INTRO_TEXT.widelyInhabited },
  // RI_STATE_PKBL_* — 볼을 누르면 이어롭이 나온다
  { kind: 'pokeBall' },
  // RI_STATE_PKBL_DIALOGUE_LIVE_ALONGSIDE · RI_STATE_DIALOGUE_ABOUT_YOURSELF
  { kind: 'say', line: INTRO_TEXT.liveAlongside },
  { kind: 'say', line: INTRO_TEXT.aboutYourself },
  // RI_STATE_GENDR_*
  { kind: 'gender' },
  // RI_STATE_NAME_*
  { kind: 'name', who: 'player' },
  // RI_STATE_DIALOGUE_SO_YOURE — ⚠️ **여기서 라이벌이 화면에 선다**
  { kind: 'say', line: INTRO_TEXT.soYoure },
  // RI_STATE_RIVAL_NAME_*
  { kind: 'name', who: 'rival' },
  // RI_STATE_DIALOGUE_END — 마박사의 마지막 말
  { kind: 'say', line: INTRO_TEXT.end },
  // RI_STATE_FADE_OUT_ROWAN_END … RI_STATE_AVATAR_SHRINK_ANIMATION · RI_STATE_END
  { kind: 'outro' },
  { kind: 'done' },
]

/** 되묻는 자리에서 고를 것 하나 */
export interface IntroChoice {
  /** 뱅크 자리 */
  line: number
  value: number
}

/** "그 밖에 알고 싶은 건 무엇인가?"의 세 갈래 */
export const INFO_CHOICES: readonly IntroChoice[] = [
  { line: INTRO_TEXT.choiceControls, value: 0 },
  { line: INTRO_TEXT.choiceAdventure, value: 1 },
  { line: INTRO_TEXT.choiceNoInfo, value: 2 },
]

/** 「조작 방법이란?」 — 뱅크가 아니라 우리 키를 말한다 */
export const INFO_CONTROLS = 0

/**
 * 고른 갈래가 들려주는 **원작 뱅크** 줄. "괜찮다!"는 빈 목록이다.
 *
 * ⚠️ **조작 설명(0)은 여기 없다.** 원작 2~5번이 십자키와 터치스크린 이야기라
 * 우리 화면에서는 거짓이다 — `intro/controlText`가 실제로 묶인 키로 만든다
 */
export function infoLines(choice: number): readonly number[] {
  if (choice === 1) return INTRO_TEXT.adventure
  return []
}

/**
 * 라이벌 이름 후보.
 *
 * 원작은 여덟 중 하나를 고르거나 "스스로 결정한다!"로 직접 짓는다. 주인공에게는
 * 이 목록이 없다 — 원작도 바로 자판으로 간다
 */
export const RIVAL_NAME_CHOICES: readonly number[] = INTRO_TEXT.rivalChoices

// ── 닫는 박자 ───────────────────────────────────────────────────────────────
//
// 마지막 말을 넘기면 원작은 곧장 필드로 가지 않는다 (`rowan_intro_app.c`):
//
//   RI_STATE_DIALOGUE_END        말이 끝나는 순간 `Sound_FadeOutBGM(0, 50)`
//   RI_STATE_FADE_OUT_ROWAN_END  마박사가 사라지고(BG1 알파) 대사창을 지운다(BG0)
//   RI_STATE_DELAY_BEFORE_END_1  빈 화면
//   RI_STATE_LOAD_MINI_AVATAR    고른 성별의 주인공 그림을 얹는다
//   RI_STATE_FADE_IN_AVATAR_END  주인공이 떠오른다
//   RI_STATE_DELAY_BEFORE_END_2  선 채로 머문다
//   RI_STATE_AVATAR_SHRINK_ANIMATION  그림 넷으로 줄어든다
//   RI_STATE_END                 `RowanIntro_Main`이 밝기 페이드를 검게 건다
//
// ⚠️ **전부 프레임 수다.** 원작 함수가 상태 하나를 한 프레임에 한 번 부르므로
// 아래 수는 그 함수를 부르는 횟수를 센 것이다.

/** 닫는 박자의 마디 길이 (60분의 1초) */
export const OUTRO = {
  /**
   * `RowanIntro_FadeBgLayer` 한 번: INIT 1 + 알파 16단 + 0을 본 프레임 1 + END 1.
   * 알파는 INIT 다음 프레임부터 한 칸씩 움직인다
   */
  layerFade: 19,
  /** `RowanIntro_Delay(30)`: 서른 번 세고 서른한 번째에 넘어간다 */
  delay: 31,
  /** `RI_STATE_LOAD_MINI_AVATAR` — 그림만 얹고 다음 프레임에 넘어간다 */
  load: 1,
  /**
   * `RowanIntro_AnimateAvatarShrink`의 그림 하나가 서는 프레임: 그림을 갈아 끼우는
   * 프레임 1 + `animDelayUpdateCounter` 8
   */
  shrinkStep: 9,
  /** 줄어드는 그림 넷 + 끝 표지(0xff)를 만나는 프레임 1 */
  shrink: 37,
  /** `RI_STATE_END` — 다음 앱을 세우고 밝기 페이드를 건다 */
  end: 1,
  /** `StartScreenFade(…, COLOR_BLACK, 6, 1, …)` — 6단 × 1프레임 */
  black: 6,
  /** `Sound_FadeOutBGM(0, 50)` — 마지막 말을 넘기는 순간 건다 */
  music: 50,
} as const

/** 마박사가 다 사라진 뒤 주인공 그림이 처음 서는 프레임 (페이드 인 INIT) */
const AVATAR_IN = OUTRO.layerFade + OUTRO.delay + OUTRO.load
/** 줄어들기 시작하는 프레임 */
const SHRINK_AT = AVATAR_IN + OUTRO.layerFade + OUTRO.delay
/** 검은 페이드를 거는 프레임 (`RI_STATE_END`) */
const BLACK_AT = SHRINK_AT + OUTRO.shrink

/** 닫는 박자 전체. 이만큼 지나면 필드로 넘어간다 */
export const OUTRO_FRAMES = BLACK_AT + OUTRO.end + OUTRO.black

/**
 * 줄어드는 그림의 키 (픽셀). 0번이 다 큰 그림이다.
 *
 * 원작은 크기를 숫자로 안 갖고 **그림을 갈아 끼운다** — 남자 `intro.narc` 9 → 42 ·
 * 43 · 44 · 45, 여자 14 → 46 · 47 · 48 · 49 (`maleSpriteIDs` · `femaleSpriteIDs`).
 * 그래서 그 타일을 배치 23번으로 깔아 비지 않은 픽셀의 테두리 높이를 쟀다.
 * 너비도 같은 비로 준다(남자 59 → 46 → 30 → 24 → 17).
 *
 * ⚠️ **원작 그림은 줄면서 22픽셀(키의 19%)쯤 위로 뜬다.** 2D 그림이라 바닥이
 * 없어서다. 우리 주인공은 바닥 원 위에 서 있으므로 **발을 붙인 채** 줄인다 —
 * 뜨게 두면 작아지는 게 아니라 떠오르는 것으로 읽힌다
 */
export const SHRINK_HEIGHTS: Readonly<Record<'boy' | 'girl', readonly number[]>> = {
  boy: [116, 96, 66, 43, 23],
  girl: [116, 98, 69, 45, 24],
}

/** 닫는 박자의 한 프레임에 화면이 어떤가 */
export interface OutroLook {
  /** 마박사의 진하기 0~1 */
  rowan: number
  /** 주인공의 진하기 0~1. 아직 그림을 안 얹었으면 null */
  avatar: number | null
  /** 주인공의 크기. 다 큰 그림이 1이다 */
  scale: number
  /** 대사창이 남아 있는가 — 마박사가 다 사라지는 프레임에 지운다 */
  box: boolean
  /** 화면을 덮는 검정 0~1 */
  black: number
}

/** BG 알파 16단. `k`는 `RowanIntro_FadeBgLayer`를 부른 차례(0이 INIT)다 */
const alphaStep = (k: number): number => Math.max(0, Math.min(16, k)) / 16

/**
 * 닫는 박자를 시작한 지 `frame`프레임째의 화면.
 *
 * 0프레임이 `RI_STATE_FADE_OUT_ROWAN_END`의 첫 프레임이다
 */
export function outroLook(frame: number, gender: 'boy' | 'girl'): OutroLook {
  const f = Math.max(0, Math.floor(frame))
  const heights = SHRINK_HEIGHTS[gender]
  // 그림 차례: 줄기 전 0, 줄기 시작한 프레임부터 9프레임마다 하나씩, 넷째에서 멈춘다
  const shrinkIndex = f < SHRINK_AT
    ? 0
    : Math.min(heights.length - 1, 1 + Math.floor((f - SHRINK_AT) / OUTRO.shrinkStep))
  return {
    rowan: f < OUTRO.layerFade ? alphaStep(16 - f) : 0,
    avatar: f < AVATAR_IN ? null : alphaStep(f - AVATAR_IN),
    scale: (heights[shrinkIndex] ?? heights[0]!) / heights[0]!,
    // END 프레임(`layerFade - 1`)에 `Bg_ClearTilemap(BG_LAYER_MAIN_0)`
    box: f < OUTRO.layerFade - 1,
    black: Math.max(0, Math.min(1, (f - BLACK_AT) / OUTRO.black)),
  }
}

/**
 * 닫는 박자의 시계. −1이면 닫는 중이 아니다.
 *
 * 화면(`ui/intro/IntroScreen`)이 시계를 쥐고 3D(`scene/IntroStage`)가 매 프레임
 * 읽는다 — 둘이 따로 세면 마박사가 사라지는 때와 대사창이 지워지는 때가 어긋난다
 */
export const introOutro = { frame: -1 }
