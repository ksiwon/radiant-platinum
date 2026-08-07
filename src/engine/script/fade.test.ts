// 화면 페이드 (`fade.ts`)
//
// 조용히 틀릴 자리가 셋이다:
//
//   ① **짝/홀이 아웃/인이다.** 뒤집히면 어두워져야 할 때 밝아지고, 컷신이
//      끝난 뒤 화면이 검은 채로 남는다.
//   ② **이어 거는 페이드가 지금 진하기에서 시작한다.** 0에서 다시 시작하면
//      아웃이 끝난 검은 화면이 한 번 번쩍하고 나서 밝아진다.
//   ③ **시간이 아니라 프레임을 센다.** 벽시계로 재면 게임을 빨리 감는 자리에서
//      영영 안 끝난다 — 실제로 진입점 훑기가 그 자리에서 138개 멎었다.
import { describe, expect, it, beforeEach } from 'vitest'
import { fadeAlpha, fadeColor, fadeDone, resetFade, startFade, tickFade } from './fade'

/** `FADE_SCREEN_CMD_STEPS`. 매크로가 늘 이 값을 넣는다 */
const STEPS = 6
/** `FADE_SCREEN_SPEED_FAST` · `_MEDIUM` · `_SLOW` */
const FAST = 1, MEDIUM = 3, SLOW = 6
/** `generated/fade_types.txt` 줄 번호 */
const OUT = 0, IN = 1

/** n 프레임 굴린다 */
const run = (n: number): void => { for (let i = 0; i < n; i++) tickFade() }

describe('페이드', () => {
  beforeEach(() => { resetFade() })

  it('안 걸었으면 아무것도 안 덮여 있다', () => {
    expect(fadeAlpha()).toBe(0)
    expect(fadeDone()).toBe(true)
  })

  it('아웃은 0에서 1로, 인은 1에서 0으로 간다', () => {
    // 6단계 × 1프레임 = 6프레임
    startFade(STEPS, FAST, OUT, 0)
    expect(fadeAlpha()).toBe(0)
    run(3)
    expect(fadeAlpha()).toBeCloseTo(0.5, 6)
    expect(fadeDone()).toBe(false)
    run(3)
    expect(fadeAlpha()).toBe(1)
    expect(fadeDone()).toBe(true)

    // 이어서 인. **덮인 채로 시작한다**
    startFade(STEPS, FAST, IN, 0)
    expect(fadeAlpha()).toBe(1)
    run(3)
    expect(fadeAlpha()).toBeCloseTo(0.5, 6)
    run(3)
    expect(fadeAlpha()).toBe(0)
  })

  it('빠르기 셋이 원작 프레임 수 그대로다', () => {
    // 한 단계가 1·3·6프레임이고 단계가 6개라 6·18·36프레임이다
    for (const [speed, frames] of [[FAST, 6], [MEDIUM, 18], [SLOW, 36]] as const) {
      resetFade()
      startFade(STEPS, speed, OUT, 0)
      run(frames - 1)
      expect(fadeDone()).toBe(false)
      run(1)
      expect(fadeDone()).toBe(true)
    }
  })

  /**
   * 표가 OUT/IN을 번갈아 적어 두었다. 실측으로 필드 스크립트가 쓰는 종류는
   * 0·1·20뿐이고 20은 짝수라 아웃이다
   */
  it('짝수가 아웃, 홀수가 인이다', () => {
    for (const type of [0, 2, 4, 20]) {
      resetFade()
      startFade(STEPS, FAST, type, 0)
      run(6)
      expect(fadeAlpha()).toBe(1)
    }
    for (const type of [1, 3, 5]) {
      resetFade()
      startFade(STEPS, FAST, OUT, 0) // 먼저 덮어 두고
      run(6)
      startFade(STEPS, FAST, type, 0)
      run(6)
      expect(fadeAlpha()).toBe(0)
    }
  })

  it('색은 RGB555다 — 검정과 하양 둘만 쓰인다', () => {
    // `COLOR_BLACK` = RGB(0,0,0), `COLOR_WHITE` = RGB(31,31,31)
    expect(fadeColor(0)).toBe('rgb(0, 0, 0)')
    expect(fadeColor(0x7fff)).toBe('rgb(255, 255, 255)')
  })

  it('걷으면 덮개가 사라진다 — 맵을 옮길 때 이걸 안 하면 검은 화면이 남는다', () => {
    startFade(STEPS, SLOW, OUT, 0)
    run(36)
    expect(fadeAlpha()).toBe(1)
    resetFade()
    expect(fadeAlpha()).toBe(0)
    expect(fadeDone()).toBe(true)
  })

  it('다 끝난 뒤에 더 굴려도 넘어가지 않는다', () => {
    startFade(STEPS, FAST, OUT, 0)
    run(1000)
    expect(fadeAlpha()).toBe(1)
  })
})
