// 쓰는 탭 — 같은 브라우저 저장소를 탭 둘이 동시에 쓰지 않게 한 탭만 「쓰는 탭」으로 정한다.
//
// ⚠️ **왜 필요한가.** 탭마다 메모리 스토어가 따로라 서로의 쓰기를 모른다. 낡은 탭이 켜져 있으면 그 탭의 자동 저장이
// `report.auto`와 `*.meta`의 `savedAt`을 새로 써서 낡은 판이 「더 최근」이 되고, 이어하기가 다른 탭의 진행을 덮는다
// (`state/report.ts` `writeAutosaveVerified`). 임시 칸(`report.tmp`)도 둘이 같이 쓰면 서로의 되읽기를 깬다.
//
// **모양**: `navigator.locks`의 배타 락 하나(`LOCK_NAME`)를 탭이 뜰 때 한 번 잡고 탭이 살아 있는 동안 쥔다
// (콜백이 끝나지 않는 Promise를 돌려준다). 먼저 뜬 탭이 쓰는 탭이고, 못 잡은 탭은 **읽기 전용**이다 —
// 이어하기·불러오기·내보내기(읽기)는 되고 리포트·자동 저장·백업·지우기·가져오기 덮기(쓰기)는 거절된다.
// 못 잡은 탭은 락을 **대기로 걸어 둔다** — 쥔 탭이 닫히면 브라우저가 락을 풀고 대기 중이던 탭이 이어받는다.
//
// ⚠️ **정상 한 탭 사용이 막히면 안 된다.** 아래 어느 경우든 「쓴다」로 간주한다 (`canWrite`):
//   - `navigator.locks`가 없다(구형 · 시험 환경) — 기능 감지로 아무것도 안 건다
//   - 락 요청이 예외를 던지거나 거절된다 (보안 컨텍스트가 아님 · 샌드박스 iframe 등)
//   - 아직 `startWriterLock`을 안 불렀거나 락 판정이 나기 전이다 (`ifAvailable`은 곧바로 돌려주지만 비동기다)
//
// **HMR · 새로고침**: 브라우저는 문서가 사라지면(새로고침 · 탭 닫기 · 크래시) 그 문서가 쥔 락을 푼다. 새로고침한 새 문서가
// 옛 문서의 락 때문에 못 잡는 일은 없다 — 옛 문서가 사라지는 순간 풀리고, 새 문서의 `ifAvailable`이 그 뒤에 돈다. 혹시
// 풀리기 전에 닿아도 못 잡은 쪽이 대기로 걸려 풀리는 즉시 이어받는다. 문서를 새로 안 띄우는 모듈 단위 HMR은 이 모듈이 다시
// 평가돼도 락을 또 잡으려 하지 않게 상태를 `globalThis`에 둔다(안 그러면 같은 문서의 새 평가가 옛 평가의 락 앞에서 영영 대기).
//
// 이 모듈은 가볍게 둔다 — 타이틀 첫 청크에 얹힌다(`app/App`).

/** 락 이름. 같은 출처의 모든 탭이 같은 이름을 다툰다 */
const LOCK_NAME = 'rp-save-writer'

/** 쓰기를 거절할 때의 이유 문장 — 저장 실패의 `why`와 안내 띠가 같이 쓴다 (이 앱 껍데기의 안내는 한국어 한 벌이다) */
export const NOT_WRITER_WHY = '다른 탭에서 이미 게임이 열려 있어 이 탭에서는 저장하지 않습니다'

type Role =
  /** 락을 안 쓴다 · 아직 판정 전 · 락 요청이 실패했다 — 쓴다 */
  | 'free'
  /** 락을 쥐고 있다 — 쓴다 */
  | 'writer'
  /** 다른 탭이 쥐고 있다 — 읽기 전용 */
  | 'reader'

interface State {
  role: Role
  started: boolean
  listeners: Set<() => void>
}

const KEY = Symbol.for('rp.writerLock')
const g = globalThis as unknown as Record<symbol, State | undefined>
const state: State = g[KEY] ?? (g[KEY] = { role: 'free', started: false, listeners: new Set() })

function setRole(role: Role): void {
  if (state.role === role) return
  state.role = role
  for (const fn of [...state.listeners]) fn()
}

/** 이 탭이 지금 저장소에 써도 되는가. 락이 없거나 판정 전이면 true */
export function canWrite(): boolean {
  return state.role !== 'reader'
}

/** 읽기 전용 탭인가 (`canWrite`의 반대 — 안내 띠가 본다) */
export function isReadOnlyTab(): boolean {
  return state.role === 'reader'
}

/** 역할이 바뀔 때 부른다. 끄는 함수를 돌려준다 (`useSyncExternalStore` 모양) */
export function subscribeWriter(fn: () => void): () => void {
  state.listeners.add(fn)
  return () => { state.listeners.delete(fn) }
}

/** 락이 쥐어진 동안 끝나지 않는 Promise — 탭이 닫혀야 풀린다 */
function holdForever(): Promise<void> {
  return new Promise<void>(() => { /* 영영 끝나지 않는다 */ })
}

/**
 * 쓰는 탭 다툼에 든다. 앱이 뜰 때 한 번 부른다 (`main.tsx`) — 두 번째부터는 아무 일도 안 한다.
 * 락이 없는 환경에서는 아무것도 안 하고 계속 「쓴다」다.
 */
export function startWriterLock(): void {
  if (state.started) return
  const locks = typeof navigator === 'undefined' ? undefined : (navigator as { locks?: LockManager }).locks
  if (locks === undefined || typeof locks.request !== 'function') return
  state.started = true
  try {
    locks
      .request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, (lock) => {
        if (lock !== null) {
          setRole('writer')
          return holdForever()
        }
        // 못 잡았다 — 읽기 전용으로 두고, 쥔 탭이 닫히면 이어받도록 대기로 건다
        setRole('reader')
        try {
          locks
            .request(LOCK_NAME, { mode: 'exclusive' }, () => {
              setRole('writer')
              return holdForever()
            })
            .catch(() => { setRole('free') })
        } catch { setRole('free') }
        return undefined
      })
      .catch(() => { setRole('free') })
  } catch {
    setRole('free')
  }
}
