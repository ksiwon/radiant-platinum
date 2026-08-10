// Worker를 부리는 쪽 (IMPORT.md §6)
//
// ⚠️ **OPFS 커밋은 메인 스레드가 한다.** Worker가 직접 쓸 수도 있지만, 그러면
// 저널·매니페스트를 쓰는 곳이 둘이 되고 어느 쪽이 마지막인지 알 수 없게 된다.
// Worker는 바이트만 만들어 넘기고, 무엇을 언제 확정할지는 한 군데서 정한다.
//
// ⚠️ **작업 번호가 지난 응답을 거른다.** 취소하고 다시 시작하면 옛 작업의
// 진행률과 산출물이 여전히 날아온다 — 번호가 다르면 버린다. 이게 없으면
// 취소한 설치의 파일이 새 설치본에 섞인다.
import type { Produced } from '../platinum/convert'
import type { BdspScan } from '../bdsp/scan'
import type { FromWorker, JobId, ToWorker, ValidationReport } from './protocol'

export interface ConvertHooks {
  onProgress?: (done: number, total: number) => void
  onWrote?: (path: string, bytes: number) => void
  /**
   * 산출물 하나를 **도착하는 대로** 받는다.
   *
   * ⚠️ **모델 그룹은 Map으로 못 받는다.** 포켓몬 493마리가 406MB고 무대까지
   * 580MB인데, `convert()`가 끝날 때까지 메인 스레드가 그것을 다 들고 있으면
   * 탭이 죽는다. 이걸 주면 Map에 안 담고 그때그때 넘긴다 — 설치기가 받아서
   * 바로 OPFS에 쓴다
   */
  onFile?: (path: string, data: Uint8Array) => void
}

export class WorkerFailed extends Error {
  constructor(name: string, message: string) { super(message); this.name = name }
}

export class WorkerCancelled extends Error {
  constructor() { super('취소했다'); this.name = 'Cancelled' }
}

export interface ImportClient {
  validate(file: Blob, onStep?: (step: string) => void): Promise<ValidationReport>
  scanBdsp(input: { handle?: FileSystemDirectoryHandle; files?: File[] }): Promise<BdspScan>
  convert(group: string, hooks?: ConvertHooks): Promise<Produced>
  /**
   * 지금 도는 작업을 취소한다. 오류가 아니라 취소다.
   *
   * **협조적 취소가 먼저다.** Worker가 숨 쉬는 자리에서 신호를 보고 스스로
   * 접는다 — 그래야 판정해 둔 파일시스템이 살아남아 다시 시작할 때 128MB를
   * 또 안 읽는다. `hardAfterMs` 안에 대답이 없으면 **스레드를 끊는다.**
   * 즉시 멈추는 대신 Worker가 들고 있던 것이 다 사라지므로 롬부터 다시 고른다.
   *
   * 끊는 갈래가 필요한 이유는 협조가 원리적으로 보장이 아니어서다 — 숨을 안
   * 쉬는 루프가 하나라도 들어오면 취소 버튼이 먹통이 된다. 그때 사용자에게
   * 남는 수단이 탭을 닫는 것뿐이면 안 된다
   */
  cancel(opts?: { hardAfterMs?: number }): void
  /** Worker를 끝낸다. 화면을 닫을 때 반드시 부른다 — 안 부르면 스레드가 남는다 */
  close(): void
  /** 스레드가 끊겼는가. 끊겼으면 이 클라이언트로는 아무것도 못 한다 */
  readonly dead: boolean
}

/** 협조적 취소를 이만큼 기다린 뒤 스레드를 끊는다 */
export const HARD_CANCEL_MS = 2_000

/** 진짜 Worker를 띄운다. Vite가 `new URL(...)`을 보고 청크를 만든다 */
export function spawnImportWorker(): ImportClient {
  const worker = new Worker(new URL('./importWorker.ts', import.meta.url), { type: 'module' })
  const kill = (): void => { worker.terminate() }
  return attachImportClient(worker, kill, kill)
}

/**
 * 포트 하나에 클라이언트를 붙인다.
 *
 * `Worker`와 `MessagePort`가 같은 모양이라 시험이 `MessageChannel`로 **같은
 * 코드**를 돌린다 — 진짜 structured clone과 진짜 transferable을 지난다
 */
export function attachImportClient(
  port: {
    postMessage(value: unknown): void
    addEventListener(type: 'message', fn: (e: { data: unknown }) => void): void
  },
  close: () => void,
  /** 스레드를 끊는 법. 안 주면 협조적 취소만 쓴다 (`MessageChannel` 시험) */
  hardCancel?: () => void,
): ImportClient {
  let nextJob: JobId = 1
  let live: JobId | null = null
  let dead = false
  let hardTimer: ReturnType<typeof setTimeout> | null = null

  interface Waiting {
    job: JobId
    settle: (msg: FromWorker) => void
    onStep?: (step: string) => void
    hooks?: ConvertHooks
    produced: Produced
  }
  let waiting: Waiting | null = null

  port.addEventListener('message', (e) => {
    const msg = e.data as FromWorker
    // 취소했거나 이미 끝난 작업의 늦은 소식은 버린다
    if (!waiting || msg.job !== waiting.job) return
    switch (msg.kind) {
      case 'step': waiting.onStep?.(msg.step); return
      case 'progress': waiting.hooks?.onProgress?.(msg.done, msg.total); return
      case 'produced': {
        const data = new Uint8Array(msg.bytes)
        // `onFile`을 준 쪽은 바로 받아 간다. 안 주면 Map에 쌓아 뒀다가 끝에 넘긴다
        if (waiting.hooks?.onFile) waiting.hooks.onFile(msg.path, data)
        else waiting.produced.set(msg.path, data)
        waiting.hooks?.onWrote?.(msg.path, msg.bytes.byteLength)
        return
      }
      default: waiting.settle(msg)
    }
  })

  const send = (msg: ToWorker): void => { port.postMessage(msg) }

  /** 협조적 취소를 기다리다 만 자리. 스레드를 끊고 기다리던 쪽을 깨운다 */
  const killNow = (): void => {
    hardTimer = null
    if (dead || !hardCancel) return
    dead = true
    hardCancel()
    // 끊긴 스레드는 답을 못 보낸다 — 기다리는 쪽을 여기서 접는다
    if (waiting) waiting.settle({ kind: 'cancelled', job: waiting.job })
  }

  const stopHardTimer = (): void => {
    if (hardTimer !== null) { clearTimeout(hardTimer); hardTimer = null }
  }

  async function ask<T>(
    make: (job: JobId) => ToWorker,
    take: (msg: FromWorker, produced: Produced) => T,
    extra: Pick<Waiting, 'onStep' | 'hooks'> = {},
  ): Promise<T> {
    if (dead) throw new WorkerFailed('Terminated', '스레드를 끊었습니다. 롬부터 다시 골라 주세요.')
    const job = nextJob++
    live = job
    const done = new Promise<FromWorker>((resolve) => {
      waiting = { job, settle: resolve, produced: new Map(), ...extra }
    })
    send(make(job))
    const msg = await done
    stopHardTimer()
    const produced = waiting?.produced ?? new Map()
    waiting = null
    if (live === job) live = null
    if (msg.kind === 'cancelled') throw new WorkerCancelled()
    if (msg.kind === 'failed') throw new WorkerFailed(msg.name, msg.message)
    return take(msg, produced)
  }

  return {
    validate: (file, onStep) => ask(
      // 이름을 떼고 바이트만 넘긴다 (`protocol.ts`). `slice()`는 복사가 아니다
      (job) => ({ kind: 'validate', job, file: file.slice() }),
      (msg) => {
        if (msg.kind !== 'validated') throw new Error(`뜻밖의 응답: ${msg.kind}`)
        return msg.report
      },
      { onStep },
    ),

    scanBdsp: (input) => ask(
      (job) => ({ kind: 'scanBdsp', job, ...input }),
      (msg) => {
        if (msg.kind !== 'scanned') throw new Error(`뜻밖의 응답: ${msg.kind}`)
        return msg.scan
      },
    ),

    convert: (group, hooks) => ask(
      (job) => ({ kind: 'convert', job, group }),
      (msg, produced) => {
        if (msg.kind !== 'converted') throw new Error(`뜻밖의 응답: ${msg.kind}`)
        return produced
      },
      { hooks },
    ),

    cancel(opts) {
      if (live === null || dead) return
      send({ kind: 'cancel', job: live })
      // 협조가 원리적으로 보장이 아니라서 시한을 건다. 대답이 오면 `ask`가 끈다
      if (hardCancel && hardTimer === null) {
        hardTimer = setTimeout(killNow, opts?.hardAfterMs ?? HARD_CANCEL_MS)
      }
    },

    close() {
      stopHardTimer()
      dead = true
      close()
    },

    get dead() { return dead },
  }
}
