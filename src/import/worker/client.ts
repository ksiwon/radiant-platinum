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
  /** 지금 도는 작업을 취소한다. 오류가 아니라 취소다 */
  cancel(): void
  /** Worker를 끝낸다. 화면을 닫을 때 반드시 부른다 — 안 부르면 스레드가 남는다 */
  close(): void
}

/** 진짜 Worker를 띄운다. Vite가 `new URL(...)`을 보고 청크를 만든다 */
export function spawnImportWorker(): ImportClient {
  const worker = new Worker(new URL('./importWorker.ts', import.meta.url), { type: 'module' })
  return attachImportClient(worker, () => { worker.terminate() })
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
): ImportClient {
  let nextJob: JobId = 1
  let live: JobId | null = null

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
      case 'produced':
        waiting.produced.set(msg.path, new Uint8Array(msg.bytes))
        waiting.hooks?.onWrote?.(msg.path, msg.bytes.byteLength)
        return
      default: waiting.settle(msg)
    }
  })

  const send = (msg: ToWorker): void => { port.postMessage(msg) }

  async function ask<T>(
    make: (job: JobId) => ToWorker,
    take: (msg: FromWorker, produced: Produced) => T,
    extra: Pick<Waiting, 'onStep' | 'hooks'> = {},
  ): Promise<T> {
    const job = nextJob++
    live = job
    const done = new Promise<FromWorker>((resolve) => {
      waiting = { job, settle: resolve, produced: new Map(), ...extra }
    })
    send(make(job))
    const msg = await done
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

    cancel() {
      if (live === null) return
      send({ kind: 'cancel', job: live })
    },

    close,
  }
}
