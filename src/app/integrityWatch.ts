// 타이틀에 닿은 뒤, 한가할 때 조용히 훑는다 (IMPORT.md §15)
//
// ⚠️ **부팅에서 하지 않는다.** 설치본 전체를 다시 해싱하면 첫 화면이 몇 초씩
// 늦고, 그러면 "한 번만 고르면 된다"가 "켤 때마다 기다린다"가 된다. 부팅은
// 매니페스트 한 장만 읽는다 (`installReady`).
//
// 그렇다고 안 보면 브라우저가 말없이 되찾아 간 파일을 게임이 만나게 된다.
// 그래서 셋으로 나눈다:
//
//   읽을 때   그 파일만. 세션에 한 번 (`verifiedPackStore`)
//   한가할 때 여기. 타이틀에 닿은 뒤 뒤에서 전부
//   손으로    설정 화면 버튼. 사용자가 부를 때 (`verifyAll`)
//
// ⚠️ **Worker를 안 만든다.** `crypto.subtle.digest`는 이미 메인 스레드 밖에서
// 돌고, 여기서 새 Worker를 띄우면 "정상 설치에서는 변환기 Worker를 만들지
// 않는다"는 계약을 재는 E2E가 그 Worker를 보게 된다. 파일 사이에서 양보하는
// 것으로 충분하다 — 실측으로 프레임을 안 먹는다
import { installedStore } from './boot'
import type { Broken } from '../import/install/integrity'

interface WatchResult {
  ok: number
  broken: Broken[]
  groups: string[]
}

let running: { aborted: boolean } | null = null

/** 브라우저에 `requestIdleCallback`이 없으면(사파리) 타이머로 흉내 낸다 */
function whenIdle(run: () => void): void {
  const idle = (globalThis as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  }).requestIdleCallback
  if (idle) idle(run, { timeout: 10_000 })
  else setTimeout(run, 2_000)
}

/**
 * 뒤에서 전부 확인한다. 이미 돌고 있으면 아무것도 안 한다.
 *
 * 깨진 것이 나와도 화면을 안 막는다 — `corruptGroups()`에 표시가 남고, 그
 * 그룹을 실제로 읽으려는 순간 `AssetCorrupt`가 난다. 그때 그 그룹만 다시 만든다
 */
export function watchIntegrity(onDone?: (got: WatchResult) => void): () => void {
  const store = installedStore()
  // 개발판은 설치 기록이 없다. 확인할 근거가 없으면 안 한다
  if (!store || running) return () => {}

  const signal = { aborted: false }
  running = signal
  whenIdle(() => {
    if (signal.aborted) { running = null; return }
    void store.verifyAll(undefined, signal)
      .then((got) => {
        if (!signal.aborted) onDone?.({ ...got, groups: store.corruptGroups() })
      })
      .finally(() => { if (running === signal) running = null })
  })

  return () => { signal.aborted = true; if (running === signal) running = null }
}

/** 설정 화면의 "전부 확인" 버튼. 진행률을 준다 */
export async function verifyEverything(
  onProgress?: (done: number, total: number) => void,
): Promise<WatchResult | null> {
  const store = installedStore()
  if (!store) return null
  const got = await store.verifyAll(onProgress)
  return { ...got, groups: store.corruptGroups() }
}
