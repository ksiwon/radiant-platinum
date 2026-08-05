// 배틀 재생기 — 박자 목록을 프레임 위에서 돌린다.
//
// 박자를 만드는 것은 `engine/battle/playback.ts`고 여기는 그것을 시간에 얹기만
// 한다. 한 박자의 계약은 **글 → 화면 → 쉼** 세 걸음이고 이 파일이 그 순서를 지킨다.
//
// 글자 인쇄기는 필드 대사창이 쓰는 것을 그대로 쓴다. 글자 속도와 A로 빨리 감기가
// 이미 원작대로 맞춰져 있다.
//
// 원작은 `WaitButtonABTime`이라 **A를 안 눌러도 스스로 넘어간다.** 그래서 배틀이
// 저 혼자 흘러가고 A는 빨리 감기일 뿐이다 — 줄마다 눌러야 하는 것이 아니다.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BattleEvent } from '../../engine/battle/events'
import type { Beat } from '../../engine/battle/playback'
import { MessagePrinter, printedText, TEXT_SPEED } from '../../engine/script/printer'
import { MessageSlots } from '../../engine/script/text'

/** 배틀 글은 인쇄기가 스스로 버튼을 묻지 않는다. 빨리 감기는 `advance`가 시킨다 */
const OPTIONS = { speed: TEXT_SPEED.normal, canSkip: true, autoScroll: false }

export interface Playback {
  /** 지금 찍힌 만큼 */
  text: string
  /** 박자를 다 소화했는가. 명령 메뉴는 이때만 뜬다 */
  caughtUp: boolean
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

/** 프레임을 ms로. 원작은 60fps다 */
const FRAME_MS = 1000 / 60

interface Runner {
  /** 지금 박자 */
  at: number
  printer: MessagePrinter | null
  /** 이 박자의 사건을 이미 접었는가 */
  applied: boolean
  /** 남은 쉼 프레임 */
  wait: number
}

/**
 * 박자를 흘린다.
 *
 * `apply`는 사건을 뷰에 접는 함수다(스토어). 박자마다 **글을 다 찍은 뒤에** 부른다 —
 * 이 한 줄이 "메시지보다 체력이 먼저 닳는" 문제를 막는 자리다.
 */
export function useBattlePlayback(
  beats: readonly Beat[],
  apply: (events: readonly BattleEvent[]) => void,
): Playback {
  const [text, setText] = useState('')
  const [caughtUp, setCaughtUp] = useState(true)
  const [holdMs, setHoldMs] = useState(0)
  const runner = useRef<Runner>({ at: 0, printer: null, applied: false, wait: 0 })
  const slots = useRef(new MessageSlots())

  // 프레임 루프가 최신 값을 봐야 한다. 의존성으로 걸면 루프가 매번 다시 선다
  const latest = useRef({ beats, apply, text })
  latest.current = { beats, apply, text }

  useEffect(() => {
    let raf = 0
    const frame = (): void => {
      raf = requestAnimationFrame(frame)
      const r = runner.current
      const { beats: list, apply: fold } = latest.current
      const beat = list[r.at]
      if (!beat) { setCaughtUp((c) => (c ? c : true)); return }
      setCaughtUp((c) => (c ? false : c))

      // ① 글. 다 찍기 전에는 화면이 안 바뀐다
      if (!r.applied) {
        if (beat.text !== null && r.printer === null) {
          r.printer = new MessagePrinter(beat.text, slots.current, OPTIONS)
        }
        const p = r.printer
        if (p !== null) {
          p.tick({ pressed: false, held: false })
          const now = printedText(p)
          if (now !== latest.current.text) setText(now)
          if (!p.finished) return
          r.printer = null
        }
        // ② 화면. 체력바 전환 길이를 같은 렌더에 실어 보낸다
        setHoldMs(beat.hold * FRAME_MS)
        fold(beat.events)
        r.applied = true
        r.wait = beat.hold
        return
      }

      // ③ 쉼
      if (r.wait > 0) { r.wait--; return }
      r.at++
      r.applied = false
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf) }
  }, [])

  const advance = useCallback(() => {
    const r = runner.current
    const p = r.printer
    if (p !== null && !p.finished) {
      // 찍는 중이면 먼저 다 채운다. 화면은 다음 프레임에 바뀐다
      p.finish()
      setText(printedText(p))
      return
    }
    r.wait = 0
  }, [])

  return { text, caughtUp, holdMs, advance }
}
