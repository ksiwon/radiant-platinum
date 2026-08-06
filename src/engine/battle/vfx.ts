// 기술 연출의 뼈대 (PLAN §7.3)
//
// 기술이 471개다. 하나씩 연출을 만들 수는 없고, 원작도 그렇게 안 했다 —
// 몇 가지 **틀**을 두고 타입 색만 갈아 끼운다. 우리도 그렇게 한다.
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
 * 연출이 도는 길이 (프레임, 60fps 기준).
 *
 * **틀마다 다르지 않고 하나다.** 박자(`playback`)가 이만큼 쉬고 무대가 이만큼
 * 도는데, 둘이 어긋나면 연출이 잘리거나 빈 화면이 남는다. 어긋날 여지를 아예
 * 안 만든다 — 길이를 나누려면 박자가 기술 자료를 알아야 하고, 엔진 계층은
 * 데이터 로더를 안 탄다.
 *
 * 원작은 기술마다 다르다(`PlayMoveAnimation`이 기술별 연출 파일을 돌린다).
 * 그 표를 읽으면 여기와 `playback`의 상수 하나씩만 갈아 끼우면 된다
 */
export const MOVE_FRAMES = 40
