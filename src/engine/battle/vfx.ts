// 기술 연출의 뼈대 (PLAN §7.3)
//
// **어떤 종류의 사건인가**를 다섯 틀로 가른다 — 때렸는지, 날렸는지, 쐈는지,
// 제 몸에 걸었는지, 상대에게 걸었는지.
//
// ⚠️ **「원작도 틀 몇 개로 때웠다」가 아니다.** 한동안 그렇게 적혀 있었는데
// 틀렸다 — 원작은 기술마다 전용 대본을 들고 있다 (`res/moves/<이름>/anim.s`,
// 468개 12,514줄). 그 대본이 정한 색·박자·흔들림·자리는 `moveAnimTable.ts`가
// 나르고 `scene/battle/moveElements`가 무대 단위로 옮긴다. 여기 있는 틀은
// 그 위에 **무슨 도형을 어떤 궤적으로 그릴지**만 정한다.
//
// 어느 틀을 쓸지는 **롬의 기술 데이터가 정한다.** 지어낸 분류가 아니다:
//
//   target에 0x10이 서면 자기에게 거는 기술이다. 검무·아질리티·자기회복·
//   껍질깨기·성장·굳어지기·묻어버리기 일곱이 전부 0x10이고, 전기자석파·맹독·
//   울음소리·초음파·독가루 다섯은 하나도 아니다. 오탐도 누락도 없다.
//
//   contact는 롬이 직접 들고 있는 플래그다 (기술 155개).
//
//   category는 물리 192 · 특수 109 · 변화 170이다.
import type { Move } from '../../data/schema'

/**
 * 연출 틀 다섯.
 *
 * 원작 연출을 한 컷씩 옮기는 것이 아니라 **어떤 종류의 사건인지**를 보여 준다 —
 * 때렸는지, 날렸는지, 쐈는지, 제 몸에 걸었는지, 상대에게 걸었는지
 */
export type Archetype =
  /** 붙어서 때린다. 쓴 쪽이 상대에게 달려갔다 돌아온다 */
  | 'contact-melee'
  /** 던진다. 덩어리가 날아가 맞는다 */
  | 'projectile'
  /** 쏜다. 줄기가 이어졌다가 끊긴다 */
  | 'beam'
  /** 제 몸에 건다. 발밑에서 고리가 올라온다 */
  | 'self-buff'
  /** 상대에게 건다. 상대 둘레에 점이 돈다 */
  | 'status-dot'

/**
 * 이 기술이 쓸 틀.
 *
 * 순서가 중요하다 — 자기에게 거는 것을 먼저 걸러야 검무가 상대에게 날아가지 않고,
 * 접촉을 변화기보다 뒤에 둬야 몸통박치기와 전기자석파가 안 섞인다
 */
export function archetypeFor(move: Move | null | undefined): Archetype {
  if (!move) return 'projectile'
  if ((move.target & TARGET_SELF) !== 0) return 'self-buff'
  if (move.category === 'status') return 'status-dot'
  if (move.contact) return 'contact-melee'
  if (move.category === 'special') return 'beam'
  return 'projectile'
}

/** `MOVE_TARGET_USER`. 자기에게 거는 기술 62개가 이 비트를 든다 */
export const TARGET_SELF = 0x10

/**
 * 연출이 도는 길이 (프레임, 60fps 기준) — **자료가 없을 때의 한 벌**.
 *
 * 박자(`playback`)가 이만큼 쉬고 무대가 이만큼 도는데, 둘이 어긋나면 연출이
 * 잘리거나 빈 화면이 남는다. 그래서 둘이 **같은 자리에 물어본다**
 * (`moveFramesOf`).
 *
 * 원작은 기술마다 다르다 — 대본이 `Delay`로 쉬고 `WaitForAllEmitters`로 입자가
 * 사그라지기를 기다린다. 그 길이는 `moveLength`가 내고, 여기 값은 그 자료가
 * 아직 안 왔을 때만 쓴다
 */
export const MOVE_FRAMES = 40

/**
 * 기술 번호 → 연출 프레임. 자료를 든 쪽이 채운다 (`scene/battle/moveLength`).
 *
 * ⚠️ **엔진이 자료 로더를 안 탄다.** 대본 표는 218KB짜리 동적 청크라
 * (`data/gameData`의 `loadMoveAnims`) 박자·무대가 직접 집으면 앱 셸 예산이
 * 깨진다. 그래서 배틀에 들어설 때 화면 쪽이 한 번 꽂아 주고, 안 꽂혔으면
 * 지금까지의 한 벌로 돈다
 */
let framesOf: ((move: number | null) => number) | null = null

/** 배틀에 들어설 때 한 번. 나갈 때 `null`로 되돌린다 */
export function setMoveFrames(fn: ((move: number | null) => number) | null): void {
  framesOf = fn
}

/** 이 기술의 연출이 도는 프레임 */
export function moveFramesOf(move: number | null): number {
  return framesOf?.(move) ?? MOVE_FRAMES
}
