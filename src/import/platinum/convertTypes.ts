// 변환기가 함께 쓰는 것 (IMPORT.md §6)
//
// `convert.ts`가 그룹 표고, 그룹 하나하나는 자기 파일에 산다. 그 둘이 서로를
// 부르면 순환 import가 되므로 **양쪽이 쓰는 것만** 여기 둔다 — 문맥·취소·숨쉬기.
import type { NdsFileSystem } from './nds'
import type { Release } from './validate'

/** 한 그룹이 만드는 것 — 논리 경로 → 바이트 */
export type Produced = Map<string, Uint8Array>

/**
 * BDSP 폴더를 읽는 길. **`scan`이 찾은 뿌리 기준의 상대 경로**로 묻는다.
 *
 * ⚠️ **`DirSource`를 그대로 넘기지 않는다.** 그쪽은 사용자가 **고른** 폴더
 * 기준이라 `AssetAssistant`가 몇 겹 아래일 수 있다. 그룹이 그 차이를 알아야
 * 하면 뿌리를 다루는 코드가 그룹 수만큼 늘어난다
 */
export interface BdspSource {
  /** 뿌리 아래 상대 경로 전부 (POSIX) */
  list(): Promise<readonly string[]>
  read(path: string): Promise<Uint8Array | null>
}

export interface ConvertContext {
  fs: NdsFileSystem
  locale: string
  /**
   * 판정된 지역판. ARM9 표 자리처럼 **지역판마다 다른 것**을 여기서 읽는다
   * (`marts.ts`) — 코드에 세 벌을 박으면 판이 늘 때마다 갈라진다
   */
  release: Release
  /**
   * BDSP 폴더. **BDSP 그룹에만 있다** — 사용자가 그 폴더를 고르기 전에는 없다.
   * 그룹이 `requireBdsp(ctx)`로 집어서 없으면 그 자리에서 죽는다
   */
  bdsp?: BdspSource
  /**
   * 산출물 하나를 **바로 내보낸다.**
   *
   * ⚠️ **모델 그룹은 `Produced`에 다 담을 수가 없다.** 포켓몬 493마리가 406MB고
   * 무대까지 580MB인데, 그것을 Map에 모았다가 한꺼번에 넘기면 Worker와 메인이
   * 각각 그만큼을 든다. 있으면 만드는 즉시 흘려보내고 Map에는 안 담는다.
   * 없으면(로컬 parity 시험) 부르는 쪽이 Map으로 받는다
   */
  emit?: (path: string, data: Uint8Array) => void
  /** 몇 개 중 몇 개째인지. 화면이 이걸로 진행을 그린다 */
  onProgress?: (done: number, total: number) => void
  /** 취소 신호. 그룹마다 **자주** 본다 — 한 그룹이 몇 초씩 걸린다 */
  signal?: { aborted: boolean }
  /** 몇 번째 숨인가. `breathe`가 센다 — 넷에 한 번은 타이머여야 한다 */
  breaths?: number
}

export class Cancelled extends Error {
  constructor() { super('취소했다'); this.name = 'Cancelled' }
}

export const check = (ctx: ConvertContext): void => {
  if (ctx.signal?.aborted) throw new Cancelled()
}

/**
 * BDSP 폴더가 있어야만 도는 그룹용.
 *
 * ⚠️ **없을 때 조용히 빈 산출물을 내지 않는다.** 그러면 필수 그룹이 "됐다"로
 * 기록되고, 3D가 통째로 빈 설치본이 `ready`가 된다 (`install/required.ts`)
 */
export function requireBdsp(ctx: ConvertContext): BdspSource {
  if (!ctx.bdsp) throw new Error('BDSP 폴더를 먼저 골라야 합니다')
  return ctx.bdsp
}

/**
 * 산출물 하나를 내보낸다. `emit`이 있으면 그리로, 없으면 Map에 담는다.
 *
 * 돌려주는 것은 담은 Map 자신이라, 그룹이 `return out`으로 끝낼 수 있다
 */
export function put(ctx: ConvertContext, out: Produced, path: string, data: Uint8Array): void {
  if (ctx.emit) ctx.emit(path, data)
  else out.set(path, data)
}

/**
 * `scheduler.yield()`가 있으면 그것. 없으면 null이고 늘 타이머로 간다.
 *
 * 표준에 없는 API라 타입에 없다. Node 18+에도 전역 `scheduler`가 있어서
 * (`setImmediate` 상당) 시험도 이 갈래를 지난다
 */
const yieldFn: (() => Promise<void>) | null = (() => {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler
  return typeof s?.yield === 'function' ? s.yield.bind(s) : null
})()

/** 이만큼마다 한 번 숨을 쉰다. 471개면 여덟 번이라 취소가 곧 먹는다 */
export const BREATH = 64
/** 그 숨 중 이만큼마다 한 번은 **반드시** 타이머다 — 아래 ⚠️ 참고 */
const TIMER_EVERY = 4

/**
 * 메시지를 받을 틈을 낸다.
 *
 * ⚠️ **마이크로태스크로는 안 된다.** 취소는 Worker 바깥에서 `postMessage`로
 * 오고, 그것은 **태스크**로 큐에 들어간다 — `await Promise.resolve()`로는
 * 그 큐가 안 돌아서 신호가 영영 안 보인다. 진짜 포트로 시험을 돌렸을 때
 * 취소가 한 번도 안 먹은 것이 그 증거였고, 같은 스레드에서 함수를 직접
 * 부르던 시험은 이걸 못 잡았다 (시험이 직접 `aborted`를 켰기 때문이다).
 *
 * ⚠️ **`scheduler.yield()`만으로는 안 된다.** 중첩 `setTimeout(0)`은 4ms로
 * 늘어나서 느리지만, `scheduler.yield()`의 재개는 다른 태스크보다 **먼저**
 * 실행되도록 우선순위가 붙는다 — 그러면 취소 메시지를 계속 앞질러서 이 함수가
 * 고치려던 버그가 그대로 돌아온다. 그래서 둘을 섞는다: 평소에는 싼 쪽으로
 * 양보하고, `TIMER_EVERY`번에 한 번은 반드시 타이머로 큐를 비운다.
 * 브라우저에서 실제로 취소가 먹는지는 `tools/e2e/run.mjs`가 잰다
 */
export async function breathe(ctx: ConvertContext): Promise<void> {
  ctx.breaths = (ctx.breaths ?? 0) + 1
  if (ctx.breaths % TIMER_EVERY === 0 || !yieldFn) {
    await new Promise<void>((done) => { setTimeout(done, 0) })
  } else {
    await yieldFn()
  }
  check(ctx)
}

export const encoder = new TextEncoder()

/**
 * 산출물 한 벌.
 *
 * ⚠️ **노드 쪽 `writeJson`과 같은 모양이어야 한다** — 키 순서와 들여쓰기까지.
 * parity를 바이트로 재려면 직렬화도 같아야 하기 때문이다
 */
export const json = (value: unknown): Uint8Array => encoder.encode(JSON.stringify(value))

export interface GroupSpec {
  name: string
  /** 이 그룹이 만드는 논리 경로들 (진단·저널용) */
  outputs: string[]
  /**
   * 변환기 판. **고치면 올린다** — 설치 기록에 남아서, 올라간 그룹만 다시 만든다.
   * 이게 없으면 변환기를 고쳐도 옛 산출물이 온전하다는 이유로 그대로 남는다
   */
  converter: number
  /** 구현됐으면 변환 함수, 아직이면 왜 막혔는지 */
  convert?: (ctx: ConvertContext) => Promise<Produced>
  blockedBy?: string
}
