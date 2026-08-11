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
import type { Beat, LearnPrompt } from '../../engine/battle/playback'
import { MessagePrinter, printedText } from '../../engine/script/printer'
import { MessageSlots } from '../../engine/script/text'
import { battlePaceScale, textSpeedFrames } from '../../state/optionsStore'

/**
 * 배틀 글은 인쇄기가 스스로 버튼을 묻지 않는다. 빨리 감기는 `advance`가 시킨다.
 *
 * 속도는 **글을 띄울 때마다** 물어본다 — 여기서 값을 붙잡아 두면 설정에서
 * 바꿔도 배틀만 옛 속도로 남는다
 */
const options = () => ({ speed: textSpeedFrames(), canSkip: true, autoScroll: false })

export interface Playback {
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
  /** 물음에 답했다. 재생기를 다시 굴린다 */
  resolve: () => void
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
  /** 묻는 박자에서 답을 받았는가. 받으면 그 박자를 넘긴다 */
  answered: boolean
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
  const [ask, setAsk] = useState<LearnPrompt | null>(null)
  const runner = useRef<Runner>({ at: 0, printer: null, applied: false, wait: 0, answered: false })
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
      // 글도 쉼도 없는 박자는 이 프레임 안에서 이어서 접는다. 한 박자에 두
      // 프레임씩 쓰면 `turn`·`request`처럼 화면에 아무 일도 안 일어나는 자리가
      // 눈에 보이는 지연이 된다.
      //
      // ⚠️ **합치는 일은 여기서만 한다.** 박자를 만드는 쪽에서 합치면 뒤에 사건이
      // 붙을 때 이미 틀어 버린 박자가 커져서, 그 안에 들어간 사건이 통째로
      // 안 틀린다 (`engine/battle/playback`의 머리말)
      for (;;) {
        const beat = list[r.at]
        if (!beat) { setCaughtUp((c) => (c ? c : true)); return }
        setCaughtUp((c) => (c ? false : c))

        // ① 글. 다 찍기 전에는 화면이 안 바뀐다
        if (!r.applied) {
          if (beat.text !== null && r.printer === null) {
            r.printer = new MessagePrinter(beat.text, slots.current, options())
          }
          const p = r.printer
          if (p !== null) {
            p.tick({ pressed: false, held: false })
            const now = printedText(p)
            if (now !== latest.current.text) setText(now)
            if (!p.finished) return
            r.printer = null
          }
          // ② 화면. 체력바 전환 길이를 같은 렌더에 실어 보낸다.
          //
          // 쉼에만 설정의 빠르기를 곱한다 — `beat.hold`는 원작이 정한 프레임 수고
          // (`playback.ts`) 그 값은 자료라서 안 건드린다. 0으로 접히지 않게 1프레임은
          // 남긴다: 0이면 체력바 전환 시간이 사라져 게이지가 순간이동한다
          const hold = beat.hold === 0 ? 0 : Math.max(1, Math.round(beat.hold * battlePaceScale()))
          setHoldMs(hold * FRAME_MS)
          fold(beat.events)
          r.applied = true
          r.wait = hold
          // 쉬거나 글을 띄운 박자는 여기서 이 프레임을 끝낸다. 아무것도 안 남긴
          // 박자만 다음 것으로 이어 붙는다
          if (hold > 0 || beat.text !== null) return
        }

        // ③ 쉼
        if (r.wait > 0) { r.wait--; return }

        // ④ 물음. 답이 올 때까지 여기서 선다 — 프레임은 계속 도므로 화면은 살아 있다
        if (beat.ask !== undefined && !r.answered) {
          setAsk((a) => (a === beat.ask ? a : beat.ask ?? null))
          return
        }
        if (r.answered) { r.answered = false; setAsk(null) }

        r.at++
        r.applied = false
      }
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

  const resolve = useCallback(() => {
    runner.current.answered = true
  }, [])

  return { text, caughtUp, holdMs, ask, advance, resolve }
}
