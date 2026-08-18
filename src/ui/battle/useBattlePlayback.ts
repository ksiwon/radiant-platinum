// 배틀 재생기 — 박자 목록을 프레임 위에서 돌린다.
//
// 박자를 만드는 것은 `engine/battle/playback.ts`고 여기는 그것을 시간에 얹기만
// 한다. 한 박자의 계약은 **글 → 화면 → 쉼** 세 걸음이고 이 파일이 그 순서를 지킨다.
//
// 글창은 필드가 쓰는 인쇄기를 그대로 쓴다. 한 자씩 찍지 않고 통째로 올라간다
// (`engine/script/printer`).
//
// 원작은 `WaitButtonABTime`이라 **A를 안 눌러도 스스로 넘어간다.** 그래서 배틀이
// 저 혼자 흘러가고 A는 빨리 감기일 뿐이다 — 줄마다 눌러야 하는 것이 아니다.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BattleEvent } from '../../engine/battle/events'
import type { Beat, LearnPrompt } from '../../engine/battle/playback'
import { MessagePrinter, printedText } from '../../engine/script/printer'
import { MessageSlots } from '../../engine/script/text'
import { battlePaceScale } from '../../state/optionsStore'

/**
 * 글 한 자에 주는 **읽는 시간** (프레임).
 *
 * ⚠️ 원작에서 글이 화면에 머무는 시간은 **찍는 시간(글자수 × 문자속도) +
 * `WaitButtonABTime 30`** 둘을 더한 것이다. 한 자씩 찍는 길을 걷어내면서
 * (`engine/script/printer`) 앞쪽이 통째로 0이 됐고, 그러면 「효과가 굉장했다!」가
 * 250ms만 떠 있어서 읽을 수가 없다 — 찍지는 않되 **그 시간만큼 머문다**.
 *
 * 값은 원작 기본 문자속도 그대로다 (`Options_TextFrameDelay`의 보통 = 4).
 */
const READ_FRAMES = 4

/** 설정의 배틀 빠르기를 곱한다. 0은 0으로 두고 나머지는 한 프레임을 남긴다 */
const paced = (frames: number, scale: number): number =>
  (frames === 0 ? 0 : Math.max(1, Math.round(frames * scale)))

/**
 * 이 박자가 **무대의 연출을 덮고 있는가.**
 *
 * 기술 박자만 그렇다. 그 쉼은 `MOVE_FRAMES`인데 무대도 **같은 상수로** 그만큼
 * 돈다 — `BattleStage`의 `LUNGE`와 `MoveVfx`의 `DURATION`이 둘 다
 * `MOVE_FRAMES / 60`초다. 그러니 이 쉼은 「읽는 시간」이 아니라 **연출의 길이**다
 */
const animates = (beat: Beat): boolean => beat.events.some((e) => e.kind === 'move')

/**
 * 한 박자가 쓰는 프레임 — 게이지가 닳는 길이(`hold`)와 박자 전체 길이(`wait`).
 *
 * ⚠️ **연출이 도는 박자는 안 줄인다.** 설정의 빠르기는 「머무름·게이지·기절」에
 * 거는 값이고(`optionsStore`의 `BATTLE_PACE` 머리말), 연출 길이는 무대가 도는
 * 시간이라 여기만 줄이면 **연출이 끝나기도 전에** 게이지가 닳고 다음 글이 뜬다.
 * 기본값이 0.5라서 40프레임짜리 연출이 20프레임에 잘리고 있었다 — 포켓몬이
 * 아직 때리러 나가 있는데 「효과가 굉장했다!」가 떴다.
 *
 * ⚠️ **읽는 시간은 `hold`에 안 든다.** 그 값은 게이지가 닳는 길이라 원작 프레임
 * 수 그대로여야 한다. 더하는 곳은 박자의 길이뿐이다
 */
export function beatFrames(beat: Beat, scale: number): { hold: number, wait: number } {
  const hold = animates(beat) ? beat.hold : paced(beat.hold, scale)
  const read = beat.text === null ? 0 : paced([...beat.text].length * READ_FRAMES, scale)
  return { hold, wait: hold + read }
}

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

        // ① 글. 통째로 올라간다
        //
        // ⚠️ **배틀 글은 버튼이 아니라 `beat.hold`가 넘긴다** — 원작이
        // `WaitButtonABTime 30`으로 정해 둔 프레임 수고 그 값이 자료다. 필드
        // 대사처럼 누름을 기다리게 하면 한 턴에 예닐곱 번을 눌러야 한다.
        // 그래서 여기서는 쪽 넘김까지 `finish()`로 다 푼다
        if (!r.applied) {
          if (beat.text !== null && r.printer === null) {
            r.printer = new MessagePrinter(beat.text, slots.current)
            r.printer.finish()
          }
          const p = r.printer
          if (p !== null) {
            const now = printedText(p)
            if (now !== latest.current.text) setText(now)
            r.printer = null
          }
          // ② 화면. 체력바 전환 길이를 같은 렌더에 실어 보낸다.
          //
          // 쉼에만 설정의 빠르기를 곱한다 — `beat.hold`는 원작이 정한 프레임 수고
          // (`playback.ts`) 그 값은 자료라서 안 건드린다. 0으로 접히지 않게 1프레임은
          // 남긴다: 0이면 체력바 전환 시간이 사라져 게이지가 순간이동한다
          const { hold, wait } = beatFrames(beat, battlePaceScale())
          setHoldMs(hold * FRAME_MS)
          fold(beat.events)
          r.applied = true
          r.wait = wait
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
    // ⚠️ **연출은 안 건너뛴다.** 원작에서 A로 넘기는 것은 글이고
    // (`WaitButtonABTime`), `PlayMoveAnimation`은 눌러도 끝까지 돈다. 여기서
    // 재우면 포켓몬이 때리러 나가 있는 채로 게이지가 닳는다 — 빠르기 설정에서
    // 같은 자리를 이미 한 번 겪었다 (`beatFrames`의 머리말)
    const beat = latest.current.beats[r.at]
    if (beat !== undefined && animates(beat)) return
    r.wait = 0
  }, [])

  const resolve = useCallback(() => {
    runner.current.answered = true
  }, [])

  return { text, caughtUp, holdMs, ask, advance, resolve }
}
