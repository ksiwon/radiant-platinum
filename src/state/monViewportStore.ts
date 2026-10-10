// 메뉴 창 안의 3D 포켓몬 구멍 (`ui/common/MonViewport`, SYSTEM §2.4).
//
// 3D 쪽(`scene/MonViewportStage` · `scene/monViewportPass`)은 DOM을 모른다 — 이 스토어가 둘 사이의 다리다.
// DOM 쪽이 **구멍(요소)과 그릴 종**을 올리고, 3D 쪽이 **지금 몸이 서 있는지**를 돌려준다.
//
// ⚠️ **구멍은 한 번에 하나다.** 둘째가 오면 경고하고 나중 것이 이긴다. 시저 패스가 한 프레임에 그릴 수 있는 것이
// 하나라서가 아니라(셋도 그릴 수 있다) 예산(§2.4: 몸 하나 · 판 하나)이 하나를 전제로 서 있기 때문이다.
//
// ⚠️ **캔버스 밖에 둔다.** 장치를 잃어 `<Canvas key>`가 통째로 다시 서도 구멍은 그대로이고, 새 무대가 이 스토어를 읽어
// 다시 붙는다 — DOM 쪽이 다시 올릴 필요가 없다.
//
// 떨어지기(2D 앞모습) 판정은 순수 함수 `viewportMode`다. 화면이 그것을 읽어 구멍을 낼지 그림을 그릴지 고른다.
import { create } from 'zustand'

export type MonGender = 'male' | 'female' | 'none'

/** 그릴 몸 */
export interface MonViewportSpec {
  species: number
  form: number
  gender: MonGender
  shiny: boolean
}

/** 몸 하나를 가리키는 열쇠. 3D 쪽이 보고한 것과 DOM 쪽이 원하는 것이 같은 몸인지 이것으로 가른다 */
export function specKey(spec: MonViewportSpec): string {
  return `${String(spec.species)}|${String(spec.form)}|${spec.gender}|${spec.shiny ? 'shiny' : 'normal'}`
}

/** 3D 쪽이 그 몸에 대해 아는 것. `loading`은 기록이 없는 것과 같아서 따로 안 둔다 */
export type BodyState = 'ready' | 'none'

interface Hole {
  /** 이 구멍을 올린 쪽의 표. 놓을 때 이것이 맞아야 놓인다 */
  token: number
  /** 구멍 요소 — 3D 쪽이 프레임마다 `getBoundingClientRect()`로 읽는다 */
  el: HTMLElement
  /** 이 구멍이 놓인 창 요소. 창 얼굴의 그러데이션에서 뒷배경 색을 따올 때 쓴다. 못 찾았으면 null */
  win: HTMLElement | null
  spec: MonViewportSpec
}

interface MonViewportState {
  hole: Hole | null
  /** 3D 쪽이 마지막으로 보고한 것 */
  shown: { key: string, state: BodyState } | null
  /** 시저 패스가 던졌다 — 3D를 다시 안 시도한다(2D로 선다). 구멍을 새로 올리면 다시 시험한다 */
  broken: boolean
  /** 올 때마다 오르는 수. 3D 몸이 울음 동작을 한 번 한다 (Z로 울 때) */
  cryNonce: number

  claim: (el: HTMLElement, win: HTMLElement | null, spec: MonViewportSpec) => number
  /** 같은 구멍의 종이 바뀌었다 */
  retarget: (token: number, spec: MonViewportSpec) => void
  release: (token: number) => void
  report: (key: string | null, state?: BodyState) => void
  markBroken: () => void
  cry: () => void
}

let nextToken = 1

export const useMonViewportStore = create<MonViewportState>()((set, get) => ({
  hole: null,
  shown: null,
  broken: false,
  cryNonce: 0,

  claim: (el, win, spec) => {
    const token = nextToken++
    const had = get().hole
    if (had && had.el !== el) {
      console.warn('[monViewport] 구멍이 이미 하나 있다 — 나중 것이 이긴다')
    }
    // `broken`은 이 판 안에서 안 풀린다 — 한 번 던진 길을 구멍을 새로 올린다고 다시 가지 않는다
    set({ hole: { token, el, win, spec } })
    return token
  },

  retarget: (token, spec) => {
    const hole = get().hole
    if (hole?.token !== token || specKey(hole.spec) === specKey(spec)) return
    set({ hole: { ...hole, spec } })
  },

  release: (token) => {
    if (get().hole?.token !== token) return
    set({ hole: null, shown: null })
  },

  report: (key, state = 'ready') => {
    const now = get().shown
    if (key === null) {
      if (now !== null) set({ shown: null })
      return
    }
    if (now?.key === key && now.state === state) return
    set({ shown: { key, state } })
  },

  markBroken: () => { set({ broken: true }) },

  cry: () => { set((s) => ({ cryNonce: s.cryNonce + 1 })) },
}))

/** `viewportMode`의 입력 */
export interface ViewportModeInput {
  /** 그릴 종. 안 본 칸이면 null */
  spec: MonViewportSpec | null
  /** 렌더러가 `live`인가 (`rendererStore`) */
  rendererLive: boolean
  /** 그리다 터졌는가 — 렌더러 쪽(`fault === 'scene'`)이든 이 패스 쪽(`broken`)이든 */
  crashed: boolean
  /** 3D 쪽의 마지막 보고 */
  shown: { key: string, state: BodyState } | null
}

export type ViewportMode = 'model' | 'sprite' | 'unseen'

/**
 * 구멍에 무엇이 서는가 (SYSTEM §2.4 「떨어지기」).
 *
 *   model    3D 몸이 구멍을 채운다
 *   sprite   2D 앞모습(`{key}_front.png`)을 도트 3배로 그린다. 그러는 경우는 셋이다:
 *              ① 이 종의 모델이 없다 (`state: 'none'`)
 *              ② 아직 오는 중이다 — 보고가 없거나 다른 몸의 보고다. 2D를 먼저 그리고 몸이 오면 갈아 낀다
 *              ③ 렌더러가 `live`가 아니거나 그리다 터졌다
 *   unseen   안 본 칸이다 (④) — 「?」
 */
export function viewportMode(input: ViewportModeInput): ViewportMode {
  if (input.spec === null) return 'unseen'
  if (!input.rendererLive || input.crashed) return 'sprite'
  const shown = input.shown
  if (shown === null || shown.key !== specKey(input.spec) || shown.state !== 'ready') return 'sprite'
  return 'model'
}
