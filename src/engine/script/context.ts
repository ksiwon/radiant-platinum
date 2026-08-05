// 스크립트 VM (DATA.md §2.10) — `src/field_script_context.c`를 옮긴 것.
//
// 원작의 실행 모형이 특이하다. 한 프레임에 명령을 **여러 개** 돌리고, 명령이
// "나 기다린다"고 말할 때까지 멈추지 않는다:
//
//   while (true) {
//     opcode = readHalfWord()
//     if (table[opcode](ctx) === true) break   // 이 프레임은 여기까지
//   }
//
// 그래서 `SetFlag` 백 개는 한 프레임에 다 돌고, `Message` 하나를 만나면 거기서
// 끊긴다. 이걸 "명령 하나에 한 프레임"으로 바꾸면 맵 진입 스크립트가 눈에 띄게
// 느려진다 — 조건 분기만 수십 개짜리가 흔하다.
//
// 기다림은 콜백 하나로 표현한다. `pause(fn)`을 부르면 다음 프레임마다 `fn`을
// 물어보고 참이 될 때까지 그 자리에 선다.
import type { ScriptCommand } from '../../data/schema'
import type { VarStore } from './vars'
import type { FieldWorld } from './world'

/** 원작의 스택 크기. 넘치면 `Call`이 조용히 무시된다 */
const STACK_SIZE = 20

export type ScriptState = 'stopped' | 'running' | 'waiting'

/** 참을 돌려주면 이번 프레임은 거기서 끝난다 */
export type CommandFn = (ctx: ScriptContext) => boolean
/** 참이 될 때까지 기다린다 */
export type ResumeFn = (ctx: ScriptContext) => boolean

export interface ScriptHost {
  vars: VarStore
  /** 명령 하나가 감당할 수 없는 일을 바깥에 맡긴다 (대화창·이동·배틀) */
  readonly world: FieldWorld
  readonly commands: ReadonlyMap<number, CommandFn>
}

/**
 * `Compare`의 결과. 원작 그대로 0 작다 · 1 같다 · 2 크다.
 *
 * `GoToIf`가 이 값을 조건표의 열로 쓴다
 */
export function compare(a: number, b: number): 0 | 1 | 2 {
  if (a < b) return 0
  return a === b ? 1 : 2
}

/**
 * 조건표 (`scrcmd.c`의 `sConditionTable`).
 *
 * 행이 조건(`GoToIfEq`의 1 같은 것), 열이 위 `compare` 결과다.
 * 이 표를 손으로 다시 만들면 `<=`와 `>=`를 뒤집기 딱 좋아서 그대로 옮겼다.
 */
const CONDITION: readonly (readonly boolean[])[] = [
  //  <      ==     >
  [true, false, false], // 0  <
  [false, true, false], // 1  ==
  [false, false, true], // 2  >
  [true, true, false], //  3  <=
  [false, true, true], //  4  >=
  [true, false, true], //  5  !=
]

export function conditionHolds(condition: number, result: number): boolean {
  return CONDITION[condition]?.[result] ?? false
}

export class ScriptContext {
  state: ScriptState = 'stopped'
  /** `compare`의 결과. 조건 분기가 이걸 본다 */
  comparisonResult: 0 | 1 | 2 = 1
  /**
   * 명령이 다음 프레임으로 값을 넘길 때 쓰는 칸 (원작의 `u32 data[4]`).
   *
   * 부호 없는 32비트여야 한다 — 남은 프레임을 여기서 깎는 명령이 있는데,
   * 0에서 한 번 더 깎으면 원작은 42억이 되지 뭉개져서 음수가 되지 않는다
   */
  readonly scratch = new Uint32Array(4)

  /** 지금 도는 스크립트 파일 전체 */
  private view: DataView
  /** 파일 안 읽기 위치. `null`이면 멈춘 것이다 */
  private at: number | null = null
  private readonly stack: number[] = []
  private resume: ResumeFn | null = null

  constructor(readonly host: ScriptHost, readonly bytes: Uint8Array, readonly file: number) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  // ── 읽기 ───────────────────────────────────────────────────────────────────

  get pointer(): number | null {
    return this.at
  }

  readByte(): number {
    const v = this.view.getUint8(this.at!)
    this.at! += 1
    return v
  }

  readHalfWord(): number {
    const v = this.view.getUint16(this.at!, true)
    this.at! += 2
    return v
  }

  readWord(): number {
    const v = this.view.getInt32(this.at!, true)
    this.at! += 4
    return v
  }

  /**
   * 다음 u16을 변수 번호로 읽고 그 값을 준다.
   *
   * 번호가 0x4000 미만이면 **그 번호가 곧 값이다**. 원작의 `TryGetVar`가 그렇고,
   * 그래서 `AddVar VAR_0x8004, 1`의 1이 상수 1로 들어간다
   */
  readVar(): number {
    return this.host.vars.get(this.readHalfWord())
  }

  // ── 흐름 ───────────────────────────────────────────────────────────────────

  start(at: number): void {
    this.at = at
    this.state = 'running'
  }

  stop(): void {
    this.at = null
    this.state = 'stopped'
  }

  /**
   * 명령을 부른 **뒤에** 상태를 다시 본다.
   *
   * 게터로 두는 이유는 타입 좁히기 때문이다 — `this.state`를 직접 비교하면
   * 위쪽 대입을 보고 `'running'`으로 좁혀 버려서, 핸들러가 `pause()`로 바꾼
   * 것을 못 본 것으로 친다
   */
  private get isWaiting(): boolean {
    return this.state === 'waiting'
  }

  /** 참이 될 때까지 이 자리에 선다 */
  pause(until: ResumeFn): void {
    this.state = 'waiting'
    this.resume = until
  }

  jump(to: number): void {
    this.at = to
  }

  /**
   * 스택이 꽉 차면 **되돌아올 자리를 안 밀고 그냥 뛴다**.
   * 원작이 그렇다 — 그 상태로 `Return`을 만나면 스크립트가 끝난다
   */
  call(to: number): void {
    if (this.stack.length + 1 < STACK_SIZE) this.stack.push(this.at!)
    this.at = to
  }

  return_(): void {
    this.at = this.stack.pop() ?? null
  }

  /** 상대 오프셋의 기준은 **그 필드 바로 뒤**다 (`\label-.-4`) */
  readTarget(): number {
    const offset = this.readWord()
    return this.at! + offset
  }

  // ── 실행 ───────────────────────────────────────────────────────────────────

  /**
   * 한 프레임 분량을 돌린다.
   *
   * **상한이 이 안에 있어야 한다.** 이 반복문은 명령이 "기다린다"고 할 때까지
   * 안 멈추므로, 뒤로 뛰는 `GoTo` 고리에 들어가면 바깥에서 셀 기회가 없다.
   * 원작은 그런 고리에 반드시 대기 명령이 끼어 있어서 문제가 안 되지만, 우리는
   * 아직 대기를 구현 안 한 명령을 건너뛰기 때문에 고리가 그대로 닫힌다.
   *
   * @returns 아직 살아 있으면 참
   */
  step(budget = 1_000_000): boolean {
    if (this.state === 'stopped') return false
    if (this.state === 'waiting') {
      if (this.resume !== null) {
        if (this.resume(this)) {
          this.resume = null
          this.state = 'running'
        }
        return true
      }
      this.state = 'running'
    }

    for (let n = 0; ; n++) {
      if (n >= budget) {
        throw new ScriptError(`명령 ${budget}개를 넘겼다 — 되돌아 도는 중이다`, this)
      }
      if (this.at === null) {
        this.state = 'stopped'
        return false
      }
      if (this.at + 2 > this.view.byteLength) {
        throw new ScriptError(`0x${this.at.toString(16)}: 파일 끝을 넘어갔다`, this)
      }
      const opcode = this.readHalfWord()
      const handler = this.host.commands.get(opcode)
      if (handler === undefined) {
        throw new ScriptError(`opcode 0x${opcode.toString(16)}에 핸들러가 없다`, this)
      }
      if (handler(this)) return true
      // `pause`를 부른 명령은 거짓을 돌려줘도 여기서 멈춘다 — 안 그러면
      // 기다리라고 해 놓고 다음 명령을 바로 먹는다
      if (this.isWaiting) return true
    }
  }
}

export class ScriptError extends Error {
  constructor(message: string, readonly ctx: ScriptContext) {
    super(`스크립트 #${ctx.file}: ${message}`)
    this.name = 'ScriptError'
  }
}

/** 명령표의 피연산자 폭. `"1 4*"` → u8 하나 + 상대 오프셋 하나 */
export function argWidths(spec: ScriptCommand['args']): { size: number, rel: boolean }[] {
  if (spec === '') return []
  return spec.split(' ').map((s) => ({ size: Number(s[0]), rel: s.endsWith('*') }))
}
