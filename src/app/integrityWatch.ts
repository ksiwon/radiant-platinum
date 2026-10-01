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
//
// ⚠️ **잰 결과는 한 자리에 둔다** (`integrityFinding`). 타이틀의 뒷검사와 설정의
// 「에셋 확인」이 같은 것을 재는데, 결과를 각자 들고 있으면 설정에서 찾은 손상이
// 타이틀에 안 닿는다 — 고칠 단추(「어긋난 에셋 다시 만들기」)는 타이틀에만 있어서
// 그 사람은 깨진 것을 알고도 고칠 길을 못 만난다
import { installedStore } from './boot'
import type { Broken } from '../import/install/integrity'

interface WatchResult {
  ok: number
  broken: Broken[]
  groups: string[]
}

/** 마지막으로 잰 것. 깨진 것이 없으면 `broken`이 비어 있다 */
interface IntegrityFinding {
  broken: Broken[]
  groups: string[]
}

let running: { aborted: boolean } | null = null

/** `null`이면 아직 끝까지 잰 적이 없다 — 「깨끗하다」와 다른 상태다 */
let latest: IntegrityFinding | null = null
const listeners = new Set<() => void>()
/**
 * 잰 차례. **늦게 시작한 쪽이 이긴다.**
 *
 * ⚠️ 설치 화면을 닫고 다시 재는 동안 먼저 시작한 뒷검사가 늦게 끝날 수 있다 —
 * 그러면 고치기 **전**의 결과가 고친 뒤의 결과를 덮어 경고가 도로 선다
 */
let started = 0
let shown = 0

function publish(turn: number, got: WatchResult): void {
  if (turn < shown) return
  shown = turn
  latest = { broken: got.broken, groups: got.groups }
  for (const fn of listeners) fn()
}

/** 마지막으로 잰 결과 (`useSyncExternalStore`의 스냅숏). 바뀌기 전에는 같은 객체다 */
export function integrityFinding(): IntegrityFinding | null {
  return latest
}

/** 새 결과가 들어오면 부른다. 돌려준 함수로 끊는다 */
export function subscribeIntegrity(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

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
    const turn = ++started
    void store.verifyAll(undefined, signal)
      .then((got) => {
        // ⚠️ **끊긴 것은 안 싣는다.** 중간에 멈춘 결과는 「여기까지는 온전」일 뿐이다
        if (signal.aborted) return
        const done = { ...got, groups: store.corruptGroups() }
        publish(turn, done)
        onDone?.(done)
      })
      .finally(() => { if (running === signal) running = null })
  })

  return () => { signal.aborted = true; if (running === signal) running = null }
}

/**
 * 설정 화면의 "전부 확인" 버튼, 그리고 타이틀이 설치 화면을 닫은 뒤의 재검사.
 * 진행률을 준다. 결과는 `integrityFinding`에도 싣는다
 */
export async function verifyEverything(
  onProgress?: (done: number, total: number) => void,
): Promise<WatchResult | null> {
  const store = installedStore()
  if (!store) return null
  const turn = ++started
  const got = await store.verifyAll(onProgress)
  const done = { ...got, groups: store.corruptGroups() }
  publish(turn, done)
  return done
}
