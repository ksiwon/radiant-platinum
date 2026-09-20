// 체력 게이지가 줄어드는 길 — **공통 연출 시계 위에서** 센다.
//
// 예전에는 CSS `transition: width var(--drain) linear` 하나였다. 그러면 게이지만
// **벽시계**로 달린다: 탭을 숨겨도 흐르고, 프레임 하나가 1초가 돼도 `MAX_STEP_MS`를
// 모른다. 재생기가 서 있는 동안 체력만 마저 줄어드는 자리가 거기였다
// (`engine/battle/presentationClock`의 머리말 — 글·게이지·몸·입자·볼이 한 시간축).
//
// 그래서 여기서는 **표시 체력과 목표 체력을 나눈다.** 목표는 뷰가 주고
// (`view.active[slot].hp`), 표시는 이 모듈이 시계에서 셈한다.
import { useEffect, useLayoutEffect, useRef } from 'react'
import { battleClock } from '../../engine/battle/presentationClock'

/** 게이지 한 번의 이동. 시작 시각은 **연출 초**다 */
export interface Drain {
  /** 출발 비율 (0~1) */
  from: number
  /** 도착 비율 (0~1) */
  to: number
  /** 시작한 연출 초 */
  at: number
  /** 걸리는 연출 초. 0이면 곧바로 도착이다 */
  secs: number
}

/**
 * 지금 **보이는** 비율.
 *
 * 원작 게이지는 프레임마다 한 칸씩 움직인다(`HealthBar_Update`) — 직선이다.
 * 시계가 멈춰 있으면 `now`가 안 늘어나므로 여기도 안 움직인다
 */
export function drainAt(d: Drain, now: number): number {
  if (d.secs <= 0) return d.to
  const k = (now - d.at) / d.secs
  if (k <= 0) return d.from
  if (k >= 1) return d.to
  return d.from + (d.to - d.from) * k
}

/**
 * 목표가 바뀔 때마다 **지금 보이는 값에서** 다시 출발한다.
 *
 * ⚠️ 연타로 맞으면 앞 이동이 끝나기 전에 다음 목표가 온다. 그때 `from`을
 * 목표의 앞 값으로 잡으면 게이지가 한 번 되튄다 — 보이던 자리에서 이어야 한다
 */
export function nextDrain(d: Drain, to: number, secs: number, now: number): Drain {
  if (to === d.to) return d
  return { from: drainAt(d, now), to, at: now, secs }
}

/**
 * 체력바 하나를 시계에 붙인다. 돌려주는 ref를 채울 요소에 건다.
 *
 * ⚠️ **React 상태로 안 올린다.** 게이지는 프레임마다 바뀌는데 그걸 상태로 두면
 * 배틀 내내 카드가 다시 그려진다. 폭만 직접 쓴다
 */
export function useDrain(target: number, holdMs: number): React.RefObject<HTMLDivElement | null> {
  const el = useRef<HTMLDivElement | null>(null)
  const shot = useRef<Drain>({ from: target, to: target, at: battleClock.now(), secs: 0 })
  // 렌더 중에 시계를 읽기만 한다 — 미는 쪽은 재생기 하나다
  shot.current = nextDrain(shot.current, target, holdMs / 1000, battleClock.now())

  /**
   * ⚠️ **폭을 쓰는 쪽은 하나여야 한다.** 예전에는 `style={{ width }}`가 목표
   * 비율을 같이 그렸다. 그러면 사건이 접히는 프레임에 React가 **목표 폭으로
   * 한 번 튕기고** 다음 프레임부터 이 훅이 출발 값에서 다시 내려왔다 — 실측
   * 2026-09-20의 자취에 `0.9838 → 0 → 0.9016 → …`으로 그 한 프레임이 찍혔다.
   * 그래서 폭은 여기서만 쓴다. 렌더 직후에도 곧바로 제자리를 잡아 준다
   */
  useLayoutEffect(() => {
    if (el.current) el.current.style.width = `${drainAt(shot.current, battleClock.now()) * 100}%`
  })

  useEffect(() => {
    let raf = 0
    /** 마지막으로 쓴 폭. 안 바뀌었으면 DOM을 안 건드린다 */
    let painted = -1
    const frame = (): void => {
      raf = requestAnimationFrame(frame)
      // 시계가 멈춰 있으면 `now`가 그대로라 값도 그대로다 — 멈춤이 공짜로 따라온다
      const at = drainAt(shot.current, battleClock.now())
      if (at === painted) return
      painted = at
      if (el.current) el.current.style.width = `${at * 100}%`
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf) }
  }, [])

  return el
}
