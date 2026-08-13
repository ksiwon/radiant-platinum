// 기술 연출의 재료 (PARITY §7.3)
//
// ⚠️ **여기 있던 값은 지어낸 것이었다.** `(id*7)%11`처럼 기술 번호를 굴려
// 크기·회전·입자 수를 흔들어 놓고 「471개가 서로 다른 서명을 갖는다」고 했다.
// 서로 다르기는 했지만 **맞지는 않았다** — 불꽃세례가 붉게 물드는 것도,
// 파괴광선이 제일 세게 흔드는 것도 그 산술에는 없다.
//
// 지금은 원작 대본(`res/moves/<이름>/anim.s`)에서 뽑은 `moveAnim.json`을 읽는다
// (`tools/extract/moveAnim.js`). 실측: 배경 물들임 108개(색 13가지) · 몸
// 물들임 153개 · 흔들림 279개 · 화면 흔들림 30개 · 달려 나감 36개 ·
// 포물선 22개 · 눌림 24개 · 사라짐 12개 · 입자 붙임 1,742자리.
import type { MoveAnim } from '../../data/schema'

export type ElementFamily =
  'neutral' | 'flame' | 'water' | 'spark' | 'frost' | 'leaf' | 'stone' | 'spirit' | 'wind' | 'venom'

/** 4세대 타입 번호를 서로 다른 3D 물질·궤적 계열로 나눈다. */
export function elementFamilyForType(type: number): ElementFamily {
  switch (type) {
    case 10:
      return 'flame'
    case 11:
      return 'water'
    case 13:
    case 8:
      return 'spark'
    case 15:
      return 'frost'
    case 12:
    case 6:
      return 'leaf'
    case 4:
    case 5:
      return 'stone'
    case 7:
    case 14:
    case 16:
    case 17:
      return 'spirit'
    case 2:
      return 'wind'
    case 3:
      return 'venom'
    default:
      return 'neutral'
  }
}

/**
 * 화면이 실제로 쓰는 한 벌.
 *
 * 대본 값은 원작 단위(픽셀·0~16 알파·프레임)라 그대로는 못 쓴다. 여기서 한 번만
 * 무대 단위로 바꿔 두고, `MoveVfx`는 바꾼 값만 본다
 */
export interface MoveVisualSignature {
  /** 화면 전체가 물드는 색. 없으면 null */
  flash: { color: string; strength: number } | null
  /** 맞는 쪽 몸이 물드는 색 */
  tint: { who: 'attacker' | 'defender' | 'both'; color: string; strength: number } | null
  /** 몸 떨림의 세기(타일)와 대상 */
  shake: { who: 'attacker' | 'defender' | 'both'; amount: number; hz: number } | null
  /** 화면 흔들림의 세기(타일) */
  camera: number
  /** 쓴 쪽이 달려 나가는 거리(타일)와 걸리는 몫(0~1) */
  lunge: { distance: number; rise: number; span: number } | null
  /** 날아가는 것이 뜨는 높이(타일). 곧게 날면 0, 대본에 없으면 기본 포물선 */
  lift: number
  /** 상대 둘레를 도는 반지름(타일). 0이면 안 돈다 */
  orbit: number
  /** 몸이 눌리는 배율. 1이면 안 눌린다 */
  squash: { who: 'attacker' | 'defender' | 'both'; x: number; y: number } | null
  /** 배경이 흑백이 되는가 */
  gray: boolean
  /** 쓴 쪽이 사라지는가 */
  vanish: boolean
  /** 입자 수. 대본이 붙인 이미터 수에서 나온다 */
  particles: number
  /** 입자가 모이는 자리 */
  anchor: 'attacker' | 'defender' | 'center'
  /** 대본이 쉬는 프레임 합. 박자를 못 바꾸므로 세기 조절에만 쓴다 */
  scriptFrames: number
}

/**
 * 원작 픽셀 → 타일.
 *
 * DS 배틀 화면에서 두 발판 사이가 대략 96픽셀이고 우리 무대에서는 4타일이다.
 * 달려 나가는 거리(`dx` 14 안팎)가 이 값으로 0.58타일이 되는데, 발판 사이의
 * 1/7쯤이라 「살짝 들이받는」 원작 느낌과 맞는다
 */
const PX_PER_TILE = 24

/** 물들임 알파는 0~16이다. 1을 넘기지 않게 나눈다 */
const ALPHA_MAX = 16

function css(rgb: readonly [number, number, number]): string {
  return `rgb(${String(rgb[0])}, ${String(rgb[1])}, ${String(rgb[2])})`
}

/** 대본이 없는 기술(표 꼬리)이 쓸 한 벌. 아무것도 안 얹는다 */
const PLAIN: MoveVisualSignature = {
  flash: null, tint: null, shake: null, camera: 0, lunge: null,
  lift: 1.1, orbit: 0, squash: null, gray: false, vanish: false,
  particles: 8, anchor: 'defender', scriptFrames: 0,
}

/** 대본 한 편을 무대 단위로 옮긴다. */
export function moveVisualSignature(anim: MoveAnim | null | undefined): MoveVisualSignature {
  if (!anim) return PLAIN

  // 이미터가 붙은 자리 중 제일 많은 쪽이 이 연출이 모이는 자리다
  const tally = { attacker: 0, defender: 0, center: 0 }
  for (const e of anim.emitters) {
    if (e.at !== 'generic') tally[e.at]++
  }
  const anchor = tally.center > tally.defender && tally.center > tally.attacker
    ? 'center'
    : tally.attacker > tally.defender ? 'attacker' : 'defender'

  return {
    flash: anim.flash === null
      ? null
      : { color: css(anim.flash.color), strength: anim.flash.alpha / ALPHA_MAX },
    tint: anim.tint === null
      ? null
      : { who: anim.tint.who, color: css(anim.tint.color), strength: anim.tint.alpha / ALPHA_MAX },
    shake: anim.shake === null
      ? null
      : {
        who: anim.shake.who,
        amount: Math.max(anim.shake.x, anim.shake.y) / PX_PER_TILE,
        // `interval`은 흔들림 사이의 프레임이다. 0이면 매 프레임 뒤집힌다
        hz: 60 / Math.max(1, anim.shake.interval) / 2,
      },
    camera: anim.camera === null
      ? 0
      : Math.max(anim.camera.x, anim.camera.y) / PX_PER_TILE,
    lunge: anim.lunge === null
      ? null
      : {
        distance: Math.abs(anim.lunge.dx) / PX_PER_TILE,
        // 원작 y는 위가 +다. 우리 무대도 그렇다
        rise: anim.lunge.dy / PX_PER_TILE,
        span: Math.max(0.05, Math.min(0.5, anim.lunge.frames / 60)),
      },
    // 포물선이 적힌 기술만 뜬다. 곧게 난다고 적혔으면 안 뜬다
    lift: anim.arc !== null
      ? Math.max(0.4, anim.arc.radius / PX_PER_TILE)
      : anim.straight ? 0 : 1.1,
    orbit: anim.orbit === null ? 0 : Math.max(anim.orbit.rx, anim.orbit.ry) / PX_PER_TILE,
    squash: anim.squash,
    gray: anim.gray,
    vanish: anim.vanish,
    // 대본이 붙인 이미터 수를 그대로 쓰면 하나짜리가 너무 허전하다. 아래끝을 둔다
    particles: Math.max(4, Math.min(18, anim.emitters.length * 2)),
    anchor,
    scriptFrames: anim.frames,
  }
}
