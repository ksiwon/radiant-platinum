// 박자를 시간 위에 흘리는 알맹이.
//
// 훅(`useBattlePlayback`)에서 떼어 냈다. 훅 안에 두면 「30Hz와 144Hz에서 같은
// 시간이 걸리는가」를 **화면 없이는 못 재고**, 그 검증이 이 고침의 전부다 —
// 여기는 React도 `requestAnimationFrame`도 모르고 **흐른 ms만** 받는다.
//
// 한 박자의 계약은 `engine/battle/playback.ts`가 정한다: **글 → 화면 → 쉼**.
import type { BattleEvent } from '../../engine/battle/events'
import type { Beat, LearnPrompt } from '../../engine/battle/playback'
import { frameMs } from '../../engine/battle/presentationClock'
import { MessagePrinter, printedText } from '../../engine/script/printer'
import { MessageSlots } from '../../engine/script/text'

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
 * 박자를 만드는 쪽이 적어 준다 (`Beat.presentation`) — 기술·등판·조우·기절·볼이
 * 그렇다. 그 쉼은 무대가 도는 시간이라 「읽는 시간」이 아니다.
 *
 * ⚠️ 예전에는 여기서 `events`에 `move`가 있는지만 봤다. 그래서 공과 등판은
 * A·Z 한 번에 건너뛰어졌고, 공이 아직 흔들리는데 결과 글이 떴다
 */
function holdsPresentation(beat: Beat): boolean {
  return beat.presentation === true
}

/**
 * 이 박자의 쉼을 **A·Z가 못 줄이는가.**
 *
 * 둘이다. 연출(`presentation`)은 무대가 도는 시간이고, 게이지(`gauge`)는 체력이
 * 한 칸씩 움직이는 시간이다 (`playback.drainFrames`).
 *
 * ⚠️ **빠르기와는 다른 축이다.** 연출은 빠르기도 안 먹지만 게이지는 먹는다 —
 * 아래 `beatFrames`가 그래서 둘을 따로 본다. 게이지까지 `presentation`으로
 * 묶으면 설정의 배틀 빠르기가 체력바에 안 걸린다
 */
function holdsLocked(beat: Beat): boolean {
  return beat.presentation === true || beat.gauge === true
}

/**
 * 한 박자가 쓰는 프레임 — 게이지가 닳는 길이(`hold`)와 박자 전체 길이(`wait`).
 *
 * ⚠️ **연출이 도는 박자는 안 줄인다.** 설정의 빠르기는 「머무름·게이지·기절」에
 * 거는 값이고(`optionsStore`의 `BATTLE_PACE` 머리말), 연출 길이는 무대가 도는
 * 시간이라 여기만 줄이면 **연출이 끝나기도 전에** 게이지가 닳고 다음 글이 뜬다.
 * 기본값이 0.5라서 연출이 절반에 잘리고 있었다 — 포켓몬이
 * 아직 때리러 나가 있는데 「효과가 굉장했다!」가 떴다.
 *
 * ⚠️ **읽는 시간은 `hold`에 안 든다.** 그 값은 게이지가 닳는 길이라 원작 프레임
 * 수 그대로여야 한다. 더하는 곳은 박자의 길이뿐이다
 */
export function beatFrames(beat: Beat, scale: number): { hold: number, wait: number } {
  const hold = holdsPresentation(beat) ? beat.hold : paced(beat.hold, scale)
  const read = beat.text === null ? 0 : paced([...beat.text].length * READ_FRAMES, scale)
  return { hold, wait: hold + read }
}

/** 재생기가 바깥에 알리는 것. 훅이 상태로 받고 시험은 배열로 받는다 */
interface BeatSink {
  /** 글창에 올릴 글이 바뀌었다 */
  text: (line: string) => void
  /** 이 박자의 게이지 전환 길이(ms) */
  hold: (ms: number) => void
  /** 사건을 뷰에 접는다 */
  apply: (events: readonly BattleEvent[]) => void
  /** 사람에게 묻고 서 있다. null이면 안 묻는다 */
  ask: (prompt: LearnPrompt | null) => void
  /** 박자를 다 소화했는가 */
  caughtUp: (done: boolean) => void
}

/**
 * 한 프레임에 이어 붙일 수 있는 박자의 위끝.
 *
 * 글도 쉼도 없는 박자(`turn`·`request`)는 같은 걸음에 이어 접는다. 그래도
 * 끝이 있어야 한다 — 빈 박자만 길게 이어지면 이 루프가 한 프레임을 통째로 쓴다
 */
const CHAIN_LIMIT = 64

/**
 * 박자 목록 위를 걷는다.
 *
 * ⚠️ **프레임을 세지 않는다.** 예전에는 `requestAnimationFrame` 콜백마다 남은
 * 쉼에서 1을 뺐다. 원작의 60프레임을 **디스플레이 60회**와 같은 것으로 친
 * 구현이라 주사율이 바뀌면 연출 길이가 통째로 달라졌다 — 실측으로 120프레임짜리
 * 연출이 30Hz에서 4,033ms, 144Hz에서 840ms였다. 지금 받는 것은 **흐른 ms**다
 */
export class BeatRunner {
  /** 지금 박자 */
  private at = 0
  private printer: MessagePrinter | null = null
  /** 이 박자의 사건을 이미 접었는가 */
  private applied = false
  /** 남은 **연출** 시간(ms). A·Z로도 못 줄이는 쪽이다 */
  private holdLeft = 0
  /** 남은 **글 읽는** 시간(ms). A·Z가 이것을 0으로 만든다 */
  private readLeft = 0
  /** 이 박자의 쉼을 A·Z가 못 줄이는가 (연출이거나 게이지다) */
  private locked = false
  /** 묻는 박자에서 답을 받았는가. 받으면 그 박자를 넘긴다 */
  private answered = false
  private printed = ''
  private done = true
  /**
   * 이번 걸음에 못 쓰고 남은 ms.
   *
   * 한 걸음에 **새로 시작하는 박자는 하나**여서(아래 `return`), 박자가 바뀌는
   * 자리마다 걸음의 나머지가 버려진다. 그대로 두면 그 버림이 박자 수만큼 쌓여
   * 주사율마다 총 시간이 달라진다 — 60Hz와 120Hz가 세 박자 만에 42ms 갈렸다.
   * 남은 것은 다음 걸음으로 넘긴다
   */
  private carry = 0
  private readonly slots = new MessageSlots()

  constructor(private readonly sink: BeatSink) {}

  /** 지금 몇 번째 박자에 서 있는가. 시험과 진단이 읽는다 */
  get index(): number {
    return this.at
  }

  /**
   * 한 걸음 흘린다. `stepMs`는 **흐른 연출 시간**이다.
   *
   * ⚠️ **한 걸음을 여러 박자가 나눠 쓰지 않는다.** 긴 프레임(탭 복귀·셰이더
   * 컴파일) 하나에 「글 → 연출 → 게이지 → 다음 글」이 통째로 지나가면 안 된다
   */
  step(beats: readonly Beat[], stepMs: number, scale: number): void {
    let budget = stepMs + this.carry
    this.carry = 0
    for (let chain = 0; chain < CHAIN_LIMIT; chain++) {
      const beat = beats[this.at]
      if (!beat) { this.tellCaughtUp(true); return }
      this.tellCaughtUp(false)

      // ① 글. 통째로 올라간다
      //
      // ⚠️ **배틀 글은 버튼이 아니라 `beat.hold`가 넘긴다** — 원작이
      // `WaitButtonABTime 30`으로 정해 둔 프레임 수고 그 값이 자료다. 필드
      // 대사처럼 누름을 기다리게 하면 한 턴에 예닐곱 번을 눌러야 한다.
      // 그래서 여기서는 쪽 넘김까지 `finish()`로 다 푼다
      if (!this.applied) {
        if (beat.text !== null && this.printer === null) {
          this.printer = new MessagePrinter(beat.text, this.slots)
          this.printer.finish()
        }
        if (this.printer !== null) {
          const line = printedText(this.printer)
          if (line !== this.printed) { this.printed = line; this.sink.text(line) }
          this.printer = null
        }
        // ② 화면. 체력바 전환 길이를 같은 렌더에 실어 보낸다.
        //
        // 쉼에만 설정의 빠르기를 곱한다 — `beat.hold`는 원작이 정한 프레임 수고
        // (`playback.ts`) 그 값은 자료라서 안 건드린다
        const { hold, wait } = beatFrames(beat, scale)
        this.sink.hold(frameMs(hold))
        this.sink.apply(beat.events)
        this.applied = true
        this.locked = holdsLocked(beat)
        this.holdLeft = frameMs(hold)
        this.readLeft = frameMs(wait - hold)
        // 쉬거나 글을 띄운 박자는 여기서 이 걸음을 끝낸다. 아무것도 안 남긴
        // 박자만 다음 것으로 이어 붙는다.
        //
        // ⚠️ **한 걸음에 새로 시작하는 박자는 하나다.** 긴 프레임(탭 복귀·셰이더
        // 컴파일) 하나에 「글 → 연출 → 게이지 → 다음 글」이 통째로 지나가면 안
        // 된다. 못 쓴 시간은 버리지 말고 다음 걸음으로 넘긴다
        if (hold > 0 || beat.text !== null) { this.carry = budget; return }
      }

      // ③ 쉼. **흐른 시간만큼** 깎는다
      if (this.holdLeft > 0 || this.readLeft > 0) {
        const use = Math.min(budget, this.holdLeft + this.readLeft)
        const toHold = Math.min(use, this.holdLeft)
        this.holdLeft -= toHold
        this.readLeft = Math.max(0, this.readLeft - (use - toHold))
        budget -= use
        if (this.holdLeft > 0 || this.readLeft > 0) return
      }

      // ④ 물음. 답이 올 때까지 여기서 선다 — 프레임은 계속 도므로 화면은 살아 있다
      if (beat.ask !== undefined && !this.answered) {
        this.sink.ask(beat.ask)
        return
      }
      if (this.answered) { this.answered = false; this.sink.ask(null) }

      this.at++
      this.applied = false
      this.locked = false
    }
  }

  /**
   * A·Z. 글 읽는 시간만 줄인다.
   *
   * ⚠️ **연출도 게이지도 안 건너뛴다.** 원작에서 A로 넘기는 것은 글이고
   * (`WaitButtonABTime`), `PlayMoveAnimation`·`ThrowPokeball`은 눌러도 끝까지
   * 돈다. 여기서 재우면 포켓몬이 때리러 나가 있는 채로 게이지가 닳는다.
   * 체력이 닳는 쉼(`Beat.gauge`)도 같다 — 예전에는 이것만 안 잠겨 있어서,
   * 20→0이 48프레임(800ms)을 요청한 직후에 A를 누르면 다음 걸음 16.67ms에
   * 기절이 접혔다
   */
  advance(beats: readonly Beat[]): void {
    this.readLeft = 0
    const beat = beats[this.at]
    if (beat !== undefined && holdsLocked(beat)) return
    if (this.locked) return
    this.holdLeft = 0
  }

  /** 물음에 답했다 */
  resolve(): void {
    this.answered = true
  }

  private tellCaughtUp(now: boolean): void {
    if (now === this.done) return
    this.done = now
    this.sink.caughtUp(now)
  }
}
