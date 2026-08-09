// Import Worker 메시지 계약 (IMPORT.md §6)
//
// ⚠️ **`NdsFileSystem`을 그대로 보낼 수 없다.** 그 안에는 `read()`·`arm9()` 같은
// 함수와 그 함수가 붙들고 있는 `ByteSource` 클로저가 있고, structured clone은
// 함수를 못 복제한다 (`DataCloneError`). 그래서 **Worker가 파일시스템을 자기
// 안에서 짓고 계속 들고 있는다.** 메인으로는 직렬화되는 것만 건너간다.
//
// 그 대가로 상태가 Worker 쪽에 생긴다 — 그래서 모든 메시지가 `job`을 단다.
// 취소하고 새로 시작한 작업의 늦은 응답이 새 작업 것으로 보이면 안 된다.
//
// ⚠️ **큰 바이트는 transferable로 보낸다.** 복사하면 청크 하나에 수십 MB가
// 두 벌이 된다. 넘긴 뒤 Worker 쪽 버퍼는 분리(detach)되므로 **보내고 나서
// 다시 쓰지 않는다**.
import type { Release, Validation } from '../platinum/validate'
import type { BdspScan } from '../bdsp/scan'

export type JobId = number

/** `Validation`에서 함수(`fs`)를 뺀 것. 이것만 건너간다 */
export type ValidationReport =
  | {
      ok: true
      release: Release
      locales: string[]
      measured: { files: number; overlays: number; samples: Record<string, number> }
    }
  | Extract<Validation, { ok: false }>

export type ToWorker =
  /**
   * ⚠️ **`File`이 아니라 `Blob`이다.** `File`은 이름을 달고 다니는데 Worker는
   * 바이트만 있으면 된다 — 부르는 쪽이 `file.slice()`로 이름을 떼고 넘긴다.
   * 안 떼도 새어 나갈 데는 없지만, 필요 없는 것은 애초에 안 건네는 편이
   * 나중에 로그를 붙이는 사람이 실수할 자리를 없앤다 (COPYRIGHT.md §2)
   */
  | { kind: 'validate'; job: JobId; file: Blob }
  /** 폴더 핸들은 structured clone이 된다. 폴백은 `File` 목록으로 온다 */
  | { kind: 'scanBdsp'; job: JobId; handle?: FileSystemDirectoryHandle; files?: File[] }
  | { kind: 'convert'; job: JobId; group: string }
  | { kind: 'cancel'; job: JobId }

export type FromWorker =
  | { kind: 'validated'; job: JobId; report: ValidationReport }
  | { kind: 'scanned'; job: JobId; scan: BdspScan }
  | { kind: 'step'; job: JobId; step: string }
  | { kind: 'progress'; job: JobId; done: number; total: number }
  /** 산출물 하나. `bytes`는 transferable로 건너온다 */
  | { kind: 'produced'; job: JobId; group: string; path: string; bytes: ArrayBuffer }
  | { kind: 'converted'; job: JobId; group: string }
  | { kind: 'cancelled'; job: JobId }
  | { kind: 'failed'; job: JobId; name: string; message: string }

/** `Worker`와 `MessagePort`가 공통으로 주는 것만. 시험이 포트로 같은 코드를 돌린다 */
export interface Port {
  postMessage(value: unknown, transfer?: Transferable[]): void
  addEventListener(type: 'message', fn: (e: { data: unknown }) => void): void
}

/**
 * 오류를 직렬화한다.
 *
 * ⚠️ `Error`는 structured clone이 되지만 **커스텀 클래스는 `Error`로 납작해진다** —
 * `Cancelled`인지 `MartError`인지가 사라진다. 이름을 값으로 실어 보낸다
 */
export function describeError(e: unknown): { name: string; message: string } {
  if (e instanceof Error) return { name: e.name, message: e.message }
  return { name: 'Error', message: String(e) }
}
