// 배틀 재생기 — 박자 목록을 **시간** 위에서 돌린다.
//
// 박자를 만드는 것은 `engine/battle/playback.ts`고, 그것을 걷는 알맹이는
// `beatRunner.ts`다. 여기가 하는 일은 셋뿐이다: 공통 연출 시계를 밀고
// (`engine/battle/presentationClock`), 걸음마다 알맹이를 한 번 부르고, 알맹이가
// 알려 오는 것을 React 상태로 옮긴다.
//
// 글창은 필드가 쓰는 인쇄기를 그대로 쓴다. 한 자씩 찍지 않고 통째로 올라간다
// (`engine/script/printer`).
//
// 원작은 `WaitButtonABTime`이라 **A를 안 눌러도 스스로 넘어간다.** 그래서 배틀이
// 저 혼자 흘러가고 A는 빨리 감기일 뿐이다 — 줄마다 눌러야 하는 것이 아니다.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BattleEvent } from '../../engine/battle/events'
import type { Beat, LearnPrompt } from '../../engine/battle/playback'
import { battleClock, watchVisibility } from '../../engine/battle/presentationClock'
import { battlePaceScale } from '../../state/optionsStore'
import { BeatRunner, type LevelPanelShot } from './beatRunner'

export { beatFrames } from './beatRunner'

interface Playback {
  /** 지금 찍힌 만큼 */
  text: string
  /** 박자를 다 소화했는가. 명령 메뉴는 이때만 뜬다 */
  caughtUp: boolean
  /**
   * 지금 사람에게 묻고 서 있는 자리. null이면 안 묻고 있다.
   *
   * 이 값이 있으면 **재생기가 멈춰 있다** — `resolve()`를 불러야 다음 박자로 간다
   */
  ask: LearnPrompt | null
  /**
   * 물음에 답했다. 재생기를 다시 굴린다. `after`는 답 뒤에 이어 찍을 박자다 —
   * 그것까지 다 돈 뒤에 박자 목록의 다음으로 간다 (`BeatRunner.resolve`)
   */
  resolve: (after?: readonly Beat[]) => void
  /** 누름을 기다리고 서 있는가 (`Beat.press`). 글창의 ▼는 이때만 뜬다 */
  waitingPress: boolean
  /** 지금 A·Z가 무엇이든 줄이는가. 「Z 넘기기」는 이때만 뜬다 */
  skippable: boolean
  /** 지금 박자가 띄우는 레벨업 능력치 창. 없으면 null */
  levelPanel: LevelPanelShot | null
  /**
   * 방금 접은 박자의 쉼 길이(ms). 체력바가 이 시간 동안 줄어든다.
   *
   * 원작 게이지는 프레임당 한 칸씩 움직여서 많이 맞을수록 오래 걸린다.
   * CSS 전환 길이를 고정해 두면 그 차이가 사라진다
   */
  holdMs: number
  /** A. 찍는 중이면 다 찍고, 쉬는 중이면 곧바로 다음 박자로 */
  advance: () => void
}

/**
 * 박자를 흘린다.
 *
 * `apply`는 사건을 뷰에 접는 함수다(스토어). 박자마다 **글을 다 찍은 뒤에** 부른다 —
 * 이 한 줄이 "메시지보다 체력이 먼저 닳는" 문제를 막는 자리다.
 */
/** 재생기가 말한 「다 소화했다」와 **지금 박자 수**를 같이 본다 — 선 자리가 박자 수보다 앞이면 아직이다 */
export function caughtUpNow(said: boolean, at: number, beats: number): boolean {
  return said && at >= beats
}

export function useBattlePlayback(
  beats: readonly Beat[],
  apply: (events: readonly BattleEvent[]) => void,
  cue?: (beat: Beat) => void,
): Playback {
  const [text, setText] = useState('')
  const [caughtUp, setCaughtUp] = useState(true)
  const [holdMs, setHoldMs] = useState(0)
  const [ask, setAsk] = useState<LearnPrompt | null>(null)
  const [waitingPress, setWaitingPress] = useState(false)
  const [skippable, setSkippable] = useState(false)
  const [levelPanel, setLevelPanel] = useState<LevelPanelShot | null>(null)

  // 프레임 루프가 최신 값을 봐야 한다. 의존성으로 걸면 루프가 매번 다시 선다
  const latest = useRef({ beats, apply, cue })
  latest.current = { beats, apply, cue }

  const runner = useRef<BeatRunner | null>(null)
  runner.current ??= new BeatRunner({
    text: setText,
    hold: setHoldMs,
    apply: (events) => { latest.current.apply(events) },
    ask: setAsk,
    caughtUp: setCaughtUp,
    cue: (beat) => { latest.current.cue?.(beat) },
    waitingPress: setWaitingPress,
    skippable: setSkippable,
    panel: setLevelPanel,
  })

  useEffect(() => {
    // ⚠️ **시계를 미는 쪽은 여기 하나다.** 무대는 읽기만 한다 — 둘이 같이 밀면
    // 연출 시간이 두 배로 간다 (`presentationClock`의 머리말)
    const token = Symbol('battle playback')
    battleClock.reset()
    battleClock.claim(token)
    const unwatch = watchVisibility()
    let raf = 0
    const frame = (stamp: number): void => {
      raf = requestAnimationFrame(frame)
      // 흐른 **연출 시간**. 프레임 수가 아니다. 한 걸음의 위끝은 시계가 자른다 —
      // 탭을 숨겼다 돌아왔을 때 몇 초가 한 번에 물려 오면 그 사이의 박자가
      // 통째로 지나가고 마지막 장면만 남는다
      const stepMs = battleClock.tick(stamp) * 1000
      runner.current?.step(latest.current.beats, stepMs, battlePaceScale())
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      unwatch()
      battleClock.release(token)
    }
  }, [])

  const advance = useCallback(() => {
    runner.current?.advance(latest.current.beats)
  }, [])

  const resolve = useCallback((after?: readonly Beat[]) => {
    runner.current?.resolve(after)
  }, [])

  // ⚠️ **새 박자가 온 그 렌더에 벌써 「아직」이다.** 재생기는 다음 프레임에야 한 걸음 밟으므로, 상태만 보면 박자가 막 들어온
  // 한두 프레임 동안 「다 소화했다」가 남는다 — 배틀이 열리는 그 틈에 명령 메뉴가 등판 글보다 먼저 떴다(실측 300ms)
  return {
    text, caughtUp: caughtUpNow(caughtUp, runner.current?.index ?? 0, beats.length), holdMs, ask, advance, resolve,
    waitingPress, skippable, levelPanel,
  }
}
