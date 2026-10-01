// 체력 게이지가 줄어드는 길 — **공통 연출 시계 위에서** 센다.
//
// 예전에는 CSS `transition: width var(--drain) linear` 하나였다. 그러면 게이지만
// **벽시계**로 달린다: 탭을 숨겨도 흐르고, 프레임 하나가 1초가 돼도 `MAX_STEP_MS`를
// 모른다. 재생기가 서 있는 동안 체력만 마저 줄어드는 자리가 거기였다
// (`engine/battle/presentationClock`의 머리말 — 글·게이지·몸·입자·볼이 한 시간축).
//
// 그래서 여기서는 **표시 체력과 목표 체력을 나눈다.** 목표는 뷰가 주고
// (`view.active[slot].hp`), 표시는 이 모듈이 시계에서 셈한다.
//
// 체력판이 미끄러져 들어오고 나가는 것(`HealthBox_Scroll`)도 같은 시계다 — 아래 `slideAt`.
import { useEffect, useLayoutEffect, useRef } from 'react'
import { FRAME_SECONDS, battleClock } from '../../engine/battle/presentationClock'
import { hpColor } from '../../engine/battle/healthbar'
import { ballOpen } from '../../scene/battle/stageRefs'

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
 * 목표의 앞 값으로 잡으면 게이지가 한 번 되튄다 — 보이던 자리에서 이어야 한다.
 *
 * `restart`는 **빈 게이지에서 다시 차는** 자리다 — 경험치 바가 레벨을 넘으면
 * 1까지 찬 뒤 0으로 돌아가 남은 몫을 채운다 (`Healthbox_DrawExpBar`). 그 자리에서
 * 보이던 값(1)에서 이으면 게이지가 거꾸로 줄어든다
 */
export function nextDrain(d: Drain, to: number, secs: number, now: number, restart = false): Drain {
  if (restart) return { from: 0, to, at: now, secs }
  if (to === d.to) return d
  return { from: drainAt(d, now), to, at: now, secs }
}

/**
 * 게이지가 보이는 비율에서 읽는 **체력 숫자**.
 *
 * 원작은 게이지가 한 칸씩 움직일 때 숫자도 같이 내려간다 — `Task_UpdateHPGauge`가
 * 프레임마다 `HealthBox_DrawCurrentHP`를 부른다 (`healthbox.c` 675). 목표값을 곧바로
 * 찍으면 맞자마자 숫자가 끝값이 되고 바만 1초 가까이 따라 내려간다
 */
export function shownHp(ratio: number, maxHp: number): number {
  return Math.max(0, Math.min(maxHp, Math.round(ratio * maxHp)))
}

/**
 * 게이지가 보이는 비율에서 고르는 **색**. 픽셀 수로 가른다 (`App_BarColor` ·
 * `engine/battle/healthbar`).
 *
 * ⚠️ 목표 체력으로 고르면 바가 아직 초록 길이인데 색이 먼저 빨강이 된다
 */
export function shownColor(ratio: number, maxHp: number): ReturnType<typeof hpColor> {
  return hpColor(shownHp(ratio, maxHp), maxHp)
}

/**
 * 게이지 하나를 시계에 붙인다. 돌려주는 ref를 채울 요소에 건다.
 *
 * `paint`는 **같은 비율**로 같은 프레임에 불린다 — 숫자와 색이 폭과 따로 놀지
 * 않게 한 값에서 셋을 다 그린다. `epoch`가 바뀌면 빈 게이지에서 다시 찬다
 * (`nextDrain`의 `restart`).
 *
 * ⚠️ **React 상태로 안 올린다.** 게이지는 프레임마다 바뀌는데 그걸 상태로 두면
 * 배틀 내내 카드가 다시 그려진다. 폭만 직접 쓴다
 */
export function useDrain(
  target: number, holdMs: number, paint?: (ratio: number) => void, epoch = 0,
): React.RefObject<HTMLDivElement | null> {
  const el = useRef<HTMLDivElement | null>(null)
  const shot = useRef<Drain>({ from: target, to: target, at: battleClock.now(), secs: 0 })
  const seenEpoch = useRef(epoch)
  // 렌더 중에 시계를 읽기만 한다 — 미는 쪽은 재생기 하나다
  shot.current = nextDrain(shot.current, target, holdMs / 1000, battleClock.now(), epoch !== seenEpoch.current)
  seenEpoch.current = epoch
  const painter = useRef(paint)
  painter.current = paint

  /**
   * ⚠️ **폭을 쓰는 쪽은 하나여야 한다.** 예전에는 `style={{ width }}`가 목표
   * 비율을 같이 그렸다. 그러면 사건이 접히는 프레임에 React가 **목표 폭으로
   * 한 번 튕기고** 다음 프레임부터 이 훅이 출발 값에서 다시 내려왔다 — 실측
   * 2026-09-20의 자취에 `0.9838 → 0 → 0.9016 → …`으로 그 한 프레임이 찍혔다.
   * 그래서 폭은 여기서만 쓴다. 렌더 직후에도 곧바로 제자리를 잡아 준다 —
   * 첫 그림과 멈춘 시계에서도 숫자·색이 이 자리에서 선다
   */
  useLayoutEffect(() => {
    const at = drainAt(shot.current, battleClock.now())
    if (el.current) el.current.style.width = `${at * 100}%`
    painter.current?.(at)
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
      painter.current?.(at)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf) }
  }, [])

  return el
}

/**
 * 체력판이 미끄러지는 프레임 수 — `HEALTHBOX_SCROLL_OUT_OFFSET 160 /
 * HEALTHBOX_SCROLL_SPEED 24`를 올림한 7이다 (DATA.md §2 기다리는 길이 표 ·
 * `Healthbox_Task_Scroll`이 프레임마다 24씩 옮기고 160을 넘으면 멈춘다)
 */
export const SLIDE_FRAMES = Math.ceil(160 / 24)

/**
 * 체력판이 **얼마나 밖에 나가 있는가** (0 제자리 · 1 화면 밖).
 *
 * - 들어올 때: `enterAt`까지 밖에 있다가 `SLIDE_FRAMES` 동안 들어온다
 * - 나갈 때(`leaveAt`가 있으면): 그때부터 `SLIDE_FRAMES` 동안 나간다
 *
 * 시계만 본다 — 재생기가 서면 판도 선다
 */
export function slideAt(now: number, enterAt: number, leaveAt: number | null): number {
  const span = SLIDE_FRAMES * FRAME_SECONDS
  const k = leaveAt !== null ? (now - leaveAt) / span : 1 - (now - enterAt) / span
  return Math.max(0, Math.min(1, k))
}

/**
 * 체력판 하나를 미끄럼에 붙인다. 돌려주는 ref를 판에 건다.
 *
 * 원작 차례는 `PokemonSendOut / WaitTime 72 / HealthBoxSlideIn`
 * (`subscript_switch_pokemon.s` _045)이고, 여는 등판은 `WaitTime 96`·`112`, 야생 조우는
 * `WaitTime 122` 뒤다 (`subscript_start_encounter.s`). 그 기다림이 곧 판이 붙은 박자의
 * 쉼이라(`playback`의 `HOLD_SEND_OUT` 등) `enterDelayMs`로 받는다. 볼이 아직 안 열렸으면
 * (`stageRefs.ballOpen`) 그것도 기다린다.
 *
 * 쓰러지면(`present`가 거짓) `HealthBoxSlideOut`처럼 제 쪽 바깥으로 나간다
 * (`subscript_switch_pokemon.s` _020)
 *
 * ⚠️ **판마다 처음 서는 순간을 따로 잡는다.** 마리가 바뀌면 판이 새로 서야 하므로
 * 부르는 쪽이 판의 `key`를 마리 키로 둔다 (`BattleScreen`의 `MonCard`)
 */
export function useSlide(
  present: boolean, enterDelayMs: number, slot: string, toward: -1 | 1,
): React.RefObject<HTMLDivElement | null> {
  const el = useRef<HTMLDivElement | null>(null)
  const born = useRef<number | null>(null)
  born.current ??= battleClock.now()
  const enterAt = useRef<number | null>(null)
  // ⚠️ **처음 선 그 프레임 안에서만 쉼을 읽는다.** 쉼(`holdMs`)은 React 상태고 뷰는 스토어라
  // 같은 걸음에 와도 다른 렌더에 닿을 수 있다 — 시계가 아직 안 갔으면 같은 박자다. 그 뒤의
  // 박자가 쉼을 바꿔도 들어올 시각은 안 움직인다
  if (battleClock.now() === born.current) enterAt.current = born.current + enterDelayMs / 1000
  const leaveAt = useRef<number | null>(null)
  if (!present && leaveAt.current === null) leaveAt.current = battleClock.now()
  if (present && leaveAt.current !== null) {
    leaveAt.current = null
    enterAt.current = battleClock.now()
  }

  useLayoutEffect(() => {
    paintSlide(el.current, slideAt(battleClock.now(), openAt(enterAt.current, slot), leaveAt.current), toward)
  })

  useEffect(() => {
    let raf = 0
    let painted = -1
    const frame = (): void => {
      raf = requestAnimationFrame(frame)
      const k = slideAt(battleClock.now(), openAt(enterAt.current, slot), leaveAt.current)
      if (k === painted) return
      painted = k
      paintSlide(el.current, k, toward)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf) }
  }, [slot, toward])

  return el
}

/** 들어올 시각 — 판이 붙은 박자의 쉼이 끝나고, 볼도 열린 뒤다 */
function openAt(enterAt: number | null, slot: string): number {
  return Math.max(enterAt ?? 0, ballOpen[slot] ?? 0)
}

function paintSlide(node: HTMLDivElement | null, k: number, toward: -1 | 1): void {
  if (!node) return
  // 판 폭만큼 + 여백. 원작의 160은 256폭 화면에서 판을 통째로 밖에 내는 값이다
  node.style.transform = k === 0 ? '' : `translateX(calc(${String(toward * k)} * (100% + 48px)))`
  node.style.visibility = k >= 1 ? 'hidden' : ''
}
