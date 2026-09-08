// 세이브가 가리키는 세계를 세우는 동안 (REPAIR §42 · 야간 실행서 N1)
//
// ⚠️ **「불러오기가 맞는가」를 재는 자리가 아니다.** 그건 저장 스키마와
// `journey`의 ⑭가 잰다. 여기가 쥐는 것은 **그 사이의 틈**이다 — 세계를 세우는
// 데 걸리는 동안 사람이 무엇을 보고 무엇을 누를 수 있는가.
//
// ⚠️ **화면 페이드로는 이 일을 못 한다.** `coverScreen()`으로 덮어 놓아도
// 그다음 `enter()` 안의 `enterMap()`이 `resetFade()`를 부르면서 덮개를 걷는다
// (`engine/script/field.ts`·`engine/script/fade.ts`). 실제로 복원 중 덮개는
// 첫 `enter`에서 곧바로 사라지고 있었고, 사람은 **저장한 곳이 아닌 기본
// 스폰**을 보고 있었다. 그래서 로딩 화면의 책임을 스크립트 페이드에서 떼어
// 이 상태로 옮긴다.
//
// ⚠️ **세대(generation)가 있어야 한다.** 격자를 받는 것은 비동기고, React는
// 이 경계의 effect를 정리했다가 다시 부른다(Suspense·StrictMode·GPU 재마운트).
// 세대를 안 보면 **먼저 나간 요청의 늦은 응답이 지금 요청의 잠금을 푼다** —
// `rendererStore`의 `stale`과 같은 자리다.
import { create } from 'zustand'
import { markRestoring } from '../app/sceneMark'
import { worldState } from './worldState'

/**
 * ```text
 * idle → loading → ready
 *          │  ▲
 *          ▼  │ retry
 *        failed
 * ```
 *
 * ⚠️ **`failed`에서도 발은 묶여 있다.** 못 받은 것을 조용히 기본 스폰으로
 * 풀어 주면 사람은 저장한 곳이 아닌 데서 걷게 되고, 거기서 저장하면 리포트가
 * 덮인다. 실패는 실패로 보이고, 고를 것을 준다
 */
type RestorePhase = 'idle' | 'loading' | 'ready' | 'failed'

interface RestoreState {
  phase: RestorePhase
  /**
   * 지금 살아 있는 복원 요청의 번호.
   *
   * 늦게 온 응답은 이 번호로 거른다. `mapId` 비교로는 못 가른다 — 같은 맵으로
   * 돌아온 세대는 번호가 달라도 `mapId`가 같다
   */
  generation: number
  /** 왜 못 세웠나. 우리가 지어낸 말이 아니라 던져진 오류의 글이다 */
  reason: string | null

  /** 새 요청을 연다. 자기 세대 번호를 돌려준다 — 응답은 이것을 들고 온다 */
  begin: () => number
  /** 목적지가 다 섰다. 발을 풀어 준다 */
  markReady: (generation: number) => void
  /** 못 세웠다. 발은 묶인 채로 두고 고를 것을 띄운다 */
  markFailed: (generation: number, reason: string) => void
  /**
   * 이 마운트가 끝난다(또는 복원할 것이 없다). 세대를 무효로 하고 잠금을 놓는다.
   *
   * ⚠️ **세대를 반드시 올린다.** 안 올리면 마운트를 떠난 뒤 도착한 응답이
   * 아무도 없는 화면에 `ready`를 쓴다
   */
  release: () => void
}

/** 잠금은 한 곳에서만 쓴다 — 상태와 입력 게이트가 어긋날 자리를 안 만든다 */
function lock(on: boolean, phase: RestorePhase): void {
  worldState.restoring = on
  markRestoring(on ? (phase === 'failed' ? 'failed' : 'loading') : null)
}

export const useRestoreStore = create<RestoreState>((set, get) => ({
  phase: 'idle',
  generation: 0,
  reason: null,

  begin: () => {
    const generation = get().generation + 1
    lock(true, 'loading')
    set({ phase: 'loading', generation, reason: null })
    return generation
  },

  markReady: (generation) => {
    if (generation !== get().generation) return
    lock(false, 'ready')
    set({ phase: 'ready', reason: null })
  },

  markFailed: (generation, reason) => {
    if (generation !== get().generation) return
    // ⚠️ **여기서 잠금을 안 푼다.** 실패 화면은 DOM이라 단추는 눌리고,
    // 월드 이동·상호작용·저장만 막힌 채로 남는다
    lock(true, 'failed')
    set({ phase: 'failed', reason })
  },

  release: () => {
    lock(false, 'idle')
    set({ phase: 'idle', generation: get().generation + 1, reason: null })
  },
}))

/**
 * 「다시 해 보기」를 실제로 하는 쪽 — `scene/MapStreamer`가 마운트 동안 건다.
 *
 * ⚠️ **스토어에 함수를 담지 않는다.** 담으면 씬을 모르는 쪽이 그것을 구독하게
 * 되고, 마운트가 바뀔 때마다 화면이 다시 그려진다. `distortionHooks`와 같은
 * 자리다 — 값은 스토어에, 손잡이는 이 칸에
 */
export const restoreRetry: { run: (() => void) | null } = { run: null }
