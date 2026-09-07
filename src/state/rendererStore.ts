// 렌더러가 살아 있는가 (PLATINUM_3D_COMPLETION_PLAN §6.2 · PT-02)
//
// ⚠️ **「WebGL2 폴백이 있다」와 「장치를 잃어도 돌아온다」는 다른 일이다.**
// `WebGPURenderer`는 만들 때 WebGPU가 없으면 WebGL2로 내려앉는다. 그것은
// **처음 한 번**의 이야기고, 이미 만들어진 장치가 나중에 사라지는 것 —
// 드라이버 갱신, 절전 전환, 다른 프로그램이 GPU를 리셋, 탭이 오래 묻힘 —
// 은 아무도 안 받아 준다. 받는 자리가 없으면 화면이 검게 멎고 입력만 산다.
//
// three는 두 백엔드의 신호를 하나로 모아 준다 (`renderer.onDeviceLost`) —
// WebGPU는 `GPUDevice.lost`, WebGL2는 `webglcontextlost`다. 우리는 그 하나만
// 잡는다. **GPU API 안쪽 필드를 여기저기서 더듬지 않는다.**
//
// ⚠️ **무한 재시도를 안 한다.** 장치가 죽는 까닭은 대개 우리가 못 고치는
// 것이라, 자동으로 다시 세우기를 반복하면 같은 실패를 초당 여러 번 내면서
// 기계를 더 태운다. 자동은 **한 번**이고, 그다음은 사람이 고른다.
//
// ⚠️ **여기서 게임을 저장하지 않는다.** 장치를 잃은 순간은 배틀 중간일 수도
// 스크립트 한가운데일 수도 있고, 그것을 리포트로 굽는 것은 **원작에 없는 저장
// 시점**을 만드는 일이다. 돌아갈 곳은 이미 저장해 둔 리포트다
import { create } from 'zustand'
import { holdLoop, releaseLoop } from '../engine/loop/pause'
import { setGameActive } from '../engine/input/keys'
import { markRenderer } from '../app/sceneMark'

/**
 * ```text
 * initializing → ready → live
 *      │           │       │
 *      ▼           │       ▼
 *   failed ◄───────┴──── lost → recovering → ready → live
 * ```
 *
 * ⚠️ **`ready`와 `live`가 다르다** (기획서 §3.4·§6.2). `ready`는
 * `renderer.init()`이 끝난 것뿐이다 — 그 시점의 씬은 아직 다시 서는 중이고,
 * 로더가 걸려 있을 수도 있다. 거기서 조작을 돌려주면 사람은 **아직 안 그려진
 * 세계**를 걷는다. 실제로 한 프레임이 나간 뒤가 `live`고, 조작은 그때 돌아온다
 */
type RendererPhase = 'initializing' | 'ready' | 'live' | 'lost' | 'recovering' | 'failed'

/**
 * 자동으로 다시 세워 보는 횟수 — **한 판에 한 번**이다.
 *
 * ⚠️ **손실마다 한 번이 아니라 한 판에 한 번이다.** 손실마다로 두면 장치가
 * 계속 죽는 기계에서 「죽음 → 자동 복구 → 죽음」이 끝없이 돈다. 두 번째부터는
 * 사람이 「다시 세우기」를 눌러야 한다 — 그때는 적어도 무엇이 벌어지는지 본다
 */
export const MAX_AUTO_RECOVERY = 1

/**
 * 다시 세우기를 이만큼 기다려도 첫 프레임이 안 나오면 그만둔다.
 *
 * ⚠️ **끝나지 않는 복구가 제일 나쁘다** (기획서 §3.5). 「잠시만 기다려 주세요」가
 * 영원히 떠 있으면 사람에게는 고를 것이 하나도 없다 — 시간이 지나면 실패로
 * 옮겨서 **마지막 리포트로 돌아갈 길**을 준다
 */
export const RECOVERY_TIMEOUT_MS = 20_000

/** 무엇 때문에 못 쓰게 됐는가. 화면 글은 이 값으로 고른다 */
type RendererFault = 'init' | 'lost' | 'scene' | 'timeout'

interface RendererState {
  phase: RendererPhase
  /** 실제로 어느 길로 그리는가 (`WebGPUBackend` · `WebGLBackend`). 모르면 null */
  backend: string | null
  /** 손실 신호를 준 쪽 — three가 그렇게 적어 준다 */
  api: 'WebGPU' | 'WebGL' | null
  fault: RendererFault | null
  /** 사람에게 보일 한 줄. 롬에서 온 글이 아니라 브라우저가 준 말이다 */
  reason: string | null
  /** 이 판에서 자동으로 다시 세워 본 횟수 */
  autoRetries: number
  /**
   * Canvas를 다시 세운 횟수. **`<Canvas key>`가 이 값이다.**
   *
   * ⚠️ **영속 Canvas 원칙의 명시적 예외다** (PLAN §3.3). 정상 경로에서는 절대
   * 안 바뀐다 — 죽은 장치에 물린 렌더러는 되살릴 길이 없어서 새로 만드는
   * 수밖에 없고, R3F에게 그렇게 시키는 길이 `key`뿐이다.
   *
   * ⚠️ **세대는 늦게 오는 응답을 거르는 표이기도 하다** (기획서 §3.5). 죽은
   * 렌더러의 `init()`이 뒤늦게 풀리거나 그쪽 `onDeviceLost`가 한 박자 늦게
   * 울면, 그것이 **지금 세대의 상태를 뒤집으면 안 된다**
   */
  generation: number

  /** 렌더러가 섰다. 아직 조작은 안 돌려준다 — 씬이 한 프레임 나가야 한다 */
  markReady: (backend: string | null, generation: number) => void
  /** 그 세대가 실제로 한 프레임을 그렸다. 여기서부터 게임이 사람 손에 있다 */
  markPresented: (generation: number) => void
  /** `renderer.init()`이 터졌다 — 3D를 아예 못 연다 */
  markInitFailed: (reason: string, generation: number) => void
  /** 그리던 중에 장치를 잃었다 */
  markLost: (info: { api?: string | null, message?: string | null }, generation: number) => void
  /** React 씬이나 프레임 콜백이 터졌다. 장치는 멀쩡한데 그릴 것이 터진 것이다 */
  markSceneCrashed: (reason: string) => void
  /** 다시 세우기가 시간 안에 안 끝났다 */
  markRecoveryTimedOut: () => void
  /**
   * 다시 세운다. 자동이면 `auto`를 준다 — 상한을 넘으면 세우지 않고 실패로 간다.
   * 세우기로 했으면 `true`
   */
  retry: (auto?: boolean) => boolean
  /** 더 안 해 본다 */
  giveUp: () => void
}

/**
 * 세계를 멈춘다.
 *
 * ⚠️ **루프만 세우면 안 된다.** 고정 스텝은 멎어도 눌린 키는 그대로 남는다 —
 * 복구가 끝나는 순간 그동안 누르고 있던 방향이 한꺼번에 먹어서 주인공이 벽으로
 * 달린다. `setGameActive(false)`가 눌린 것까지 비운다 (`input/keys`).
 *
 * ⚠️ **`gameLoop.paused`에 직접 대입하지 않는다.** 탭 감시가 같은 칸에 쓰고
 * 있어서, 복구 중에 탭을 나갔다 돌아오면 이 정지가 덮였다 (`engine/loop/pause`)
 */
function freeze(): void {
  holdLoop('renderer')
  setGameActive(false)
}

/**
 * 이 값들만 화면이 읽는다. 상태를 옮길 때 **매번 전부** 적어 둔다 — 한 칸을
 * 안 지우면 복구된 화면에 지난 실패 이유가 남는다
 */
const CLEAR = { api: null, fault: null, reason: null } as const

/** 아직 못 쓰는 칸들 — 여기서는 세계가 멎어 있어야 한다 */
const DOWN = new Set<RendererPhase>(['lost', 'recovering', 'failed'])

/**
 * 상태를 옮기면서 **문서에도 적는다.**
 *
 * ⚠️ 밖에서 보면 `lost`·`recovering`·`failed`가 다 「안 움직이는 화면」이다.
 * 어느 칸인지를 못 읽으면 자동 검사도 지원 문의도 셋을 못 가른다
 * (`app/sceneMark`)
 */
export const useRendererStore = create<RendererState>((rawSet, get) => {
  const set: typeof rawSet = (next) => {
    rawSet(next as never)
    markRenderer(get().phase)
  }
  /**
   * 지난 세대가 뒤늦게 말을 거는가.
   *
   * ⚠️ **죽은 렌더러는 조용히 안 죽는다** (기획서 §3.5). 다시 세우면서 버린
   * 쪽의 `init()`이 그 뒤에 풀리기도 하고, 그쪽 `onDeviceLost`가 한 박자 늦게
   * 울기도 한다. 그것을 그대로 받으면 **막 살아난 새 세대가 다시 `lost`로**
   * 넘어가거나, 반대로 실패한 세대의 `ready`가 지금 화면을 덮는다
   */
  const stale = (generation: number): boolean => generation !== get().generation
  return {
    phase: 'initializing',
    backend: null,
    api: null,
    fault: null,
    reason: null,
    autoRetries: 0,
    generation: 0,

    markReady: (backend, generation) => {
      if (stale(generation)) return
      // ⚠️ **`autoRetries`를 여기서 안 비운다.** 비우면 죽을 때마다 자동 복구가
      // 다시 한 번씩 붙어서, 결국 무한 재시도와 같아진다 (위 `MAX_AUTO_RECOVERY`)
      //
      // ⚠️ **여기서 세계를 안 돌린다.** 렌더러가 선 것과 씬이 다시 선 것은 다른
      // 일이고, 조작을 지금 돌려주면 아직 안 그려진 세계를 걷게 된다.
      // 정지는 첫 프레임이 나갈 때(`markPresented`) 푼다 — 그때까지는 로더가
      // 걸려 있을 수도, 씬이 반만 서 있을 수도 있다
      holdLoop('renderer')
      set({ phase: 'ready', backend, ...CLEAR })
    },

    markPresented: (generation) => {
      if (stale(generation) || get().phase !== 'ready') return
      set({ phase: 'live' })
      releaseLoop('renderer')
    },

    markInitFailed: (reason, generation) => {
      if (stale(generation)) return
      freeze()
      set({ phase: 'failed', fault: 'init', reason, api: null, backend: null })
    },

    markLost: (info, generation) => {
      if (stale(generation)) return
      // 이미 잃은 것을 또 받는다 — WebGL은 `webglcontextlost`를 한 번만 주지만
      // WebGPU 쪽은 갈래가 둘이라 겹칠 수 있다. 처음 것만 적는다
      if (DOWN.has(get().phase)) return
      freeze()
      set({
        phase: 'lost',
        fault: 'lost',
        api: info.api === 'WebGL' ? 'WebGL' : info.api === 'WebGPU' ? 'WebGPU' : null,
        reason: info.message ?? null,
      })
    },

    markSceneCrashed: (reason) => {
      // ⚠️ **세대를 안 묻는다.** 터진 것은 렌더러가 아니라 **지금 그리고 있는
      // 나무**라, 그것을 알려 준 경계는 늘 지금 세대 안에 있다
      if (get().phase === 'failed') return
      freeze()
      set({ phase: 'failed', fault: 'scene', reason, api: null })
    },

    markRecoveryTimedOut: () => {
      const at = get().phase
      if (at !== 'recovering' && at !== 'ready') return
      freeze()
      set({
        phase: 'failed',
        fault: 'timeout',
        reason: `${String(Math.round(RECOVERY_TIMEOUT_MS / 1000))}초 안에 첫 화면이 안 나왔다`,
        api: null,
      })
    },

    retry: (auto = false) => {
      const at = get()
      if (auto && at.autoRetries >= MAX_AUTO_RECOVERY) {
        freeze()
        set({ phase: 'failed' })
        return false
      }
      freeze()
      set({
        phase: 'recovering',
        generation: at.generation + 1,
        autoRetries: at.autoRetries + (auto ? 1 : 0),
        backend: null,
      })
      return true
    },

    giveUp: () => {
      freeze()
      set({ phase: 'failed' })
    },
  }
})

/** 지금 게임을 굴려도 되는가. 복구 중에는 아무도 못 움직인다 */
export function rendererUsable(): boolean {
  return useRendererStore.getState().phase === 'live'
}
