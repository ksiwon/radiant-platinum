// 저장 공간 (IMPORT.md §8 · PLAN §4.6)
//
// ⚠️ **원본 크기가 아니라 변환 결과 + 임시 여유를 본다.** 사용자가 고르는
// 입력은 롬 128MB와 BDSP 수 GB지만, 설치되는 것은 그것을 변환한 결과다.
// 개발판 실측이 630MB(PLAN §16.1)라 그 언저리 + 변환 중 임시 여유가 필요하다.
//
// ⚠️ **`persist()` 승인을 보장으로 취급하지 않는다.** 크로미움은 사용자 참여도로
// 조용히 정한다 — 거부돼도 설치는 되고, 다만 브라우저가 공간을 되찾을 때
// 지워질 수 있다. 그래서 매 리포트 `.rpsave`가 최종 보험이다 (§9).

/** 개발판 실측 630MB + 변환 중 임시 여유. 실측이 쌓이면 조인다 */
export const NEEDED_BYTES = 1_400_000_000

export interface StorageState {
  /** 추정이 되는가. 안 되면 설치를 시작하지 않는다 (IMPORT.md §3) */
  measurable: boolean
  quota: number
  usage: number
  free: number
  enough: boolean
  /** `persist()`가 이미 켜져 있는가 */
  persisted: boolean
}

export async function storageState(need = NEEDED_BYTES): Promise<StorageState> {
  const api = typeof navigator === 'undefined' ? undefined : navigator.storage
  if (!api || typeof api.estimate !== 'function') {
    return { measurable: false, quota: 0, usage: 0, free: 0, enough: false, persisted: false }
  }
  let got: StorageEstimate
  try {
    got = await api.estimate()
  } catch {
    return { measurable: false, quota: 0, usage: 0, free: 0, enough: false, persisted: false }
  }
  const quota = got.quota ?? 0
  const usage = got.usage ?? 0
  const persisted = typeof api.persisted === 'function'
    ? await api.persisted().catch(() => false)
    : false
  const free = Math.max(0, quota - usage)
  return { measurable: true, quota, usage, free, enough: free >= need, persisted }
}

/**
 * 오래 남게 해 달라고 요청한다.
 *
 * **사용자 제스처 안에서** 불러야 한다 — 버튼 클릭 핸들러 밖에서 부르면
 * 브라우저가 그냥 거절한다. 거절을 실패로 다루지 않는다
 */
export async function requestPersist(): Promise<boolean> {
  const api = typeof navigator === 'undefined' ? undefined : navigator.storage
  if (!api || typeof api.persist !== 'function') return false
  try { return await api.persist() } catch { return false }
}

export function formatBytes(n: number): string {
  if (n >= 1 << 30) return `${(n / (1 << 30)).toFixed(1)}GB`
  if (n >= 1 << 20) return `${(n / (1 << 20)).toFixed(0)}MB`
  return `${(n / 1024).toFixed(0)}kB`
}
