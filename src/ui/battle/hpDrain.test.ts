// 체력바도 **같은 시계**를 본다 (지시서 2026-09-20 §3-3 / R1).
//
// 예전에는 CSS `transition: width var(--drain) linear`였다. CSS 전환은 벽시계라
// 재생기가 서 있어도(탭 숨김·`MAX_STEP_MS`에 걸린 긴 프레임) 저 혼자 흘렀다 —
// 몸과 글은 멈췄는데 게이지만 마저 줄어드는 자리다.
//
// 여기서는 표시 체력을 **연출 초**로 셈하는 순수 함수를 잰다. 실제 화면 픽셀은
// 브라우저로 봐야 하고, 그것은 이 시험이 대신하지 않는다.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MAX_STEP_MS } from '../../engine/battle/presentationClock'
import { FRAME_SECONDS } from '../../engine/battle/presentationClock'
import {
  drainAt, nextDrain, shownColor, shownHp, slideAt, SLIDE_FRAMES, type Drain,
} from './hpDrain'

const CSS_SOURCE = new URL('./battleScreen.css.ts', import.meta.url)
const SCREEN_SOURCE = new URL('./BattleScreen.tsx', import.meta.url)

/** 20/20 → 0/20. 48프레임 = 800ms다 (`playback.drainFrames`) */
const KO: Drain = { from: 1, to: 0, at: 10, secs: 0.8 }

describe('표시 체력과 목표 체력을 나눈다', () => {
  it('시작 전에는 출발 값, 끝나면 목표 값이다', () => {
    expect(drainAt(KO, 10)).toBe(1)
    expect(drainAt(KO, 9)).toBe(1)
    expect(drainAt(KO, 10.8)).toBe(0)
    expect(drainAt(KO, 99)).toBe(0)
  })

  it('원작처럼 직선이다 — 프레임마다 한 칸이다', () => {
    expect(drainAt(KO, 10.2)).toBeCloseTo(0.75, 10)
    expect(drainAt(KO, 10.4)).toBeCloseTo(0.5, 10)
    expect(drainAt(KO, 10.6)).toBeCloseTo(0.25, 10)
  })

  it('시계가 멈추면 게이지도 선다 — CSS 벽시계와 갈리는 자리다', () => {
    // 탭을 숨기면 `battleClock.now()`가 그대로다. 몇 번을 읽어도 같은 값이다
    const held = 10.3
    const seen = Array.from({ length: 50 }, () => drainAt(KO, held))
    expect(new Set(seen).size).toBe(1)
    expect(seen[0]).toBeCloseTo(0.625, 10)
  })

  it('긴 프레임 하나가 게이지를 통째로 못 끝낸다', () => {
    // 시계는 한 걸음을 `MAX_STEP_MS`로 자른다. 1초를 멈춰도 게이지는 0.1초만 간다
    const step = MAX_STEP_MS / 1000
    expect(drainAt(KO, 10 + step)).toBeCloseTo(1 - step / 0.8, 10)
  })

  it('쉼이 0이면 곧바로 도착이다 — 0으로 나누지 않는다', () => {
    expect(drainAt({ from: 1, to: 0.4, at: 0, secs: 0 }, 0)).toBe(0.4)
  })
})

describe('연타로 맞으면 보이던 자리에서 이어 간다', () => {
  it('앞 이동이 끝나기 전에 새 목표가 오면 되튀지 않는다', () => {
    const first: Drain = { from: 1, to: 0.5, at: 0, secs: 0.8 }
    // 절반쯤 내려온 0.75에서 다음 타격이 온다
    const at = drainAt(first, 0.4)
    expect(at).toBeCloseTo(0.75, 10)
    const second = nextDrain(first, 0.2, 0.5, 0.4)
    expect(second.from).toBeCloseTo(0.75, 10)
    expect(drainAt(second, 0.4)).toBeCloseTo(0.75, 10)
    expect(drainAt(second, 0.9)).toBe(0.2)
  })

  it('목표가 그대로면 이동을 다시 시작하지 않는다', () => {
    const d: Drain = { from: 1, to: 0.5, at: 0, secs: 0.8 }
    expect(nextDrain(d, 0.5, 0.8, 0.4)).toBe(d)
  })
})

describe('숫자와 색도 게이지가 보이는 값을 따른다 (`HealthBox_DrawCurrentHP` · `App_BarColor`)', () => {
  /** 40/40 → 4/40. 36칸이라 36프레임이다 */
  const HIT: Drain = { from: 1, to: 0.1, at: 0, secs: 0.6 }

  it('맞자마자 숫자가 끝값으로 안 간다 — 가운데서는 가운데 숫자다', () => {
    expect(shownHp(drainAt(HIT, 0), 40)).toBe(40)
    expect(shownHp(drainAt(HIT, 0.3), 40)).toBe(22)
    expect(shownHp(drainAt(HIT, 0.6), 40)).toBe(4)
  })

  it('색은 보이는 픽셀이 고른다 — 바가 아직 길면 아직 초록이다', () => {
    // 끝값 4/40은 4픽셀이라 빨강이지만, 가운데 22/40은 26픽셀이라 초록이다
    expect(shownColor(drainAt(HIT, 0.6), 40)).toBe('red')
    expect(shownColor(drainAt(HIT, 0.3), 40)).toBe('green')
    // 노랑 구간(10~24픽셀)을 지나는 자리도 있다 — 12/40은 14픽셀
    expect(shownColor(12 / 40, 40)).toBe('yellow')
  })

  it('끝에서는 목표 체력과 정확히 같다 — 반올림이 한 칸 비껴가지 않는다', () => {
    for (const [hp, max] of [[7, 13], [1, 300], [299, 300], [0, 55]] as const) {
      expect(shownHp(hp / max, max)).toBe(hp)
    }
  })
})

describe('경험치 바는 레벨을 넘으면 빈 게이지에서 다시 찬다', () => {
  it('restart면 보이던 값(가득)에서 잇지 않는다', () => {
    const full: Drain = { from: 0.4, to: 1, at: 0, secs: 0.5 }
    const again = nextDrain(full, 0.3, 0.2, 1, true)
    expect(again.from).toBe(0)
    expect(drainAt(again, 1)).toBe(0)
    expect(drainAt(again, 1.1)).toBeCloseTo(0.15, 10)
    expect(drainAt(again, 1.2)).toBeCloseTo(0.3, 10)
  })

  it('restart가 아니면 거꾸로 줄어드는 길이 된다 — 그래서 restart가 있다', () => {
    const full: Drain = { from: 0.4, to: 1, at: 0, secs: 0.5 }
    expect(nextDrain(full, 0.3, 0.2, 1).from).toBe(1)
  })
})

describe('체력판이 미끄러진다 (`HealthBox_Scroll`)', () => {
  const span = SLIDE_FRAMES * FRAME_SECONDS

  it('160을 24씩 — 7프레임이다', () => {
    expect(SLIDE_FRAMES).toBe(7)
  })

  it('들어올 시각까지는 밖에 있고 7프레임에 걸쳐 들어온다', () => {
    expect(slideAt(0, 1.2, null)).toBe(1)
    expect(slideAt(1.2, 1.2, null)).toBe(1)
    expect(slideAt(1.2 + span / 2, 1.2, null)).toBeCloseTo(0.5, 10)
    expect(slideAt(1.2 + span, 1.2, null)).toBe(0)
    expect(slideAt(9, 1.2, null)).toBe(0)
  })

  it('쓰러지면 그 순간부터 7프레임에 나간다', () => {
    expect(slideAt(3, 0, 3)).toBe(0)
    expect(slideAt(3 + span / 2, 0, 3)).toBeCloseTo(0.5, 10)
    expect(slideAt(3 + span, 0, 3)).toBe(1)
  })

  it('시계가 서면 판도 선다', () => {
    const seen = Array.from({ length: 20 }, () => slideAt(1.25, 1.2, null))
    expect(new Set(seen).size).toBe(1)
  })
})

describe('제품이 CSS 벽시계로 안 돌아간다', () => {
  it('체력바에 width 전환이 없다', () => {
    const css = readFileSync(CSS_SOURCE, 'utf8')
    const fill = css.slice(css.indexOf('export const barFill'))
    const rule = fill.slice(0, fill.indexOf('})'))
    expect(rule).toContain('transition')
    expect(rule).not.toMatch(/transition:[^']*'[^']*width/)
  })

  it('카드가 시계에 붙은 훅을 쓴다', () => {
    const screen = readFileSync(SCREEN_SOURCE, 'utf8')
    expect(screen).toContain("from './hpDrain'")
    expect(screen).toMatch(/useDrain\(ratio, drainMs[,)]/)
    // `--drain` CSS 변수는 더 이상 쓰이지 않는다
    expect(screen).not.toContain('--drain')
  })

  it('폭을 쓰는 임자가 하나다 — style로도 같이 그리지 않는다', () => {
    // ⚠️ 둘이 쓰면 사건이 접히는 프레임에 목표 폭으로 한 번 튕긴다
    // (실측 자취 `0.9838 → 0 → 0.9016`)
    const screen = readFileSync(SCREEN_SOURCE, 'utf8')
    const bar = screen.slice(screen.indexOf('ref={bar}'))
    expect(bar.slice(0, bar.indexOf('/>'))).not.toContain('width')
  })
})
