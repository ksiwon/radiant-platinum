// 자동 저장 · 오래 한 판 경고 — 리포트를 안 쓴 진행을 탭이 죽어도 잃지 않게 (REPAIR §149 · §153)
//
// ⚠️ **리포트 칸은 안 덮는다.** 쓰는 곳은 그 옆 자동 저장 칸이다(`state/report`의 `AUTO`). 「이어하기」는 여전히
// 리포트한 자리고, 자동 저장은 타이틀에서 그쪽이 더 최근일 때만 따로 고를 수 있다.
//
// ⚠️ **리포트를 쓸 수 없는 순간에는 자동 저장도 안 한다.** 메뉴가 안 열리는 순간(복원 중 · 스크립트 · 배틀 ·
// 필드 태스크)에 쓰면 원작에 없는 저장 시점이 생기고, 복원 중이면 저장한 곳이 아닌 자리가 적힌다
// (`ui/menu/MenuLayer`가 같은 조건으로 메뉴를 막는다). 사파리 · 깨어진 세계도 리포트 메뉴가 없거나 판 상태가
// 저장에 들어가서 뺀다. 걷는 도중(속력이 있을 때)도 미룬다.
//
// ⚠️ **이 모듈은 필드에 들어선 뒤에만 받는다** (`app/App`의 동적 import). 엔진을 끌고 오므로 타이틀 첫 청크에
// 얹히면 안 된다 (DEPLOY.md §2).
import { create } from 'zustand'
import { world } from '../engine/map/world'
import { fieldScripts } from '../engine/script/field'
import { fadeDone } from '../engine/script/fade'
import { distortionBridge } from '../engine/world/distortion'
import { frameStats } from '../engine/loop/frameStats'
import { useBattleStore } from '../state/battleStore'
import { useEvolutionStore } from '../state/evolutionStore'
import { useMenuStore } from '../state/menuStore'
import { useRendererStore } from '../state/rendererStore'
import { useSaveStore, type SaveData } from '../state/saveStore'
import { useSessionStore } from '../state/sessionStore'
import { avatarState, worldState } from '../state/worldState'
import { fieldTaskRunning } from './fieldTask'

/** 자동 저장 사이 최소 간격. 맵을 몇 번 오가도 이 안에서는 한 번이다 */
const AUTOSAVE_GAP_MS = 5 * 60_000
/** 맵이 바뀌거나 배틀이 끝난 뒤 저장할 수 있는 순간을 기다리는 상한 — 넘으면 다음 계기에 맡긴다 */
const WAIT_MS = 30_000
const POLL_MS = 1_000

/**
 * 지금 리포트를 써도 되는 순간인가 — 자동 저장 · 경고의 「리포트 쓰기」 단추가 같이 본다.
 * 까닭을 돌려준다(되면 null). 시험과 진단이 왜 미뤘는지 읽을 수 있게 한다
 */
export function whyNotSaveNow(): string | null {
  if (useSessionStore.getState().phase !== 'overworld') return '필드가 아니다'
  if (worldState.restoring) return '복원 중이다'
  if (fieldScripts.ctx !== null) return '스크립트가 돈다'
  if (useBattleStore.getState().phase !== 'off') return '배틀 중이다'
  if (fieldTaskRunning()) return '필드 태스크가 돈다'
  if (useMenuStore.getState().stack.length > 0) return '메뉴가 열려 있다'
  if (useEvolutionStore.getState().pending.length > 0) return '진화를 기다린다'
  if (fieldScripts.services.safari?.active?.() === true) return '사파리 중이다'
  if (distortionBridge.inWorld?.() === true) return '깨어진 세계다'
  if (!fadeDone()) return '화면이 바뀌는 중이다'
  if (useRendererStore.getState().phase !== 'live') return '3D가 안 섰다'
  // ⚠️ **칸 가운데로 재지 않는다.** 선 자리가 칸 가운데가 아닌 판이 있다(센터 카운터 앞 6.41 · 실측 탐침 autosaveTrip).
  // 걷는지는 속력으로 본다
  const v = worldState.player.velocity
  if (Math.hypot(v.x, v.z) > 1e-3 || worldState.player.hop.active) return '걷는 중이다'
  return null
}

/** 리포트가 적는 자리 — `SaveScreen`과 같은 모양이다 */
function reportPosition(): SaveData['position'] {
  const p = worldState.player.position
  return {
    map: world.mapId,
    matrix: world.matrix,
    x: p.x,
    z: p.z,
    facing: worldState.player.facing,
    // 깨어진 세계는 격자에 높이가 없다 (`state/save/schema`의 `position.y`)
    y: p.y,
    avatar: avatarState(),
  }
}

/** 한 번 쓴다. 스크립트가 세운 플래그를 먼저 스토어로 끌어온다(`SaveScreen`의 `write`와 같다) */
async function autosaveNow(): Promise<{ saved: boolean, why?: string }> {
  const why = whyNotSaveNow()
  if (why !== null) return { saved: false, why }
  const save = useSaveStore.getState()
  save.commitScriptState(fieldScripts.vars.saved, fieldScripts.vars.flags)
  return save.autosave(reportPosition())
}

/** 오래 한 판 경고 — 화면 구석에 한 줄 (`ui/hud/PlayNotice`) */
type NoticeKind = 'recovered' | 'slow'
interface NoticeState {
  kind: NoticeKind | null
  /** 마지막 자동 저장 시각. 경고 글에 「몇 분 전」을 적는다 */
  savedAt: number | null
  show: (kind: NoticeKind) => void
  dismiss: () => void
}
export const usePlayNotice = create<NoticeState>()((set) => ({
  kind: null,
  savedAt: null,
  show: (kind) => { set({ kind }) },
  dismiss: () => { set({ kind: null }) },
}))

/** 느려짐 — 프레임 중간값이 이만큼(ms)을 넘는 판이 연달아 셋이면 알린다(20초마다 잰다 · 60fps면 16.7) */
const SLOW_MEDIAN_MS = 40
const SLOW_STREAK = 3
const SLOW_POLL_MS = 20_000

/**
 * 자동 저장과 경고를 건다. 끄는 함수를 돌려준다.
 *
 * 계기는 둘이다 — 맵이 바뀌었을 때, 배틀이 끝나 필드로 돌아왔을 때(진 판은 빼고: 센터로 끌려가는 중이다).
 * 그때부터 저장할 수 있는 순간을 기다렸다가(`WAIT_MS`까지) 쓰고, 간격은 `AUTOSAVE_GAP_MS`를 지킨다
 */
export function installAutosave(): () => void {
  let lastSaved = 0
  let waiting: ReturnType<typeof setInterval> | null = null
  let slowStreak = 0
  let warnedSlow = false

  const trySoon = (): void => {
    if (waiting !== null) return
    if (Date.now() - lastSaved < AUTOSAVE_GAP_MS) return
    const until = Date.now() + WAIT_MS
    waiting = setInterval(() => {
      if (whyNotSaveNow() === null) {
        if (waiting !== null) clearInterval(waiting)
        waiting = null
        lastSaved = Date.now()
        void autosaveNow().then((got) => {
          if (got.saved) usePlayNotice.setState({ savedAt: Date.now() })
          else console.warn('[autosave] 자동 저장을 못 썼다', got.why)
        })
        return
      }
      if (Date.now() > until) {
        if (waiting !== null) clearInterval(waiting)
        waiting = null
      }
    }, POLL_MS)
  }

  const offMap = useSessionStore.subscribe((s, prev) => {
    if (s.mapId === prev.mapId || s.mapId < 0 || prev.mapId < 0) return
    if (worldState.restoring) return
    // ⚠️ 맵 이동 횟수로는 더 안 알린다 — 맵을 오가며 쌓이던 GPU 메모리를 놓게 됐다(REPAIR §149). 실제로 느려졌을 때만 알린다
    trySoon()
  })
  const offBattle = useBattleStore.subscribe((s, prev) => {
    if (prev.phase === 'off' || s.phase !== 'off') return
    if (prev.outcome === 'loss' || s.outcome === 'loss') return
    trySoon()
  })
  const offRenderer = useRendererStore.subscribe((s, prev) => {
    // 장치를 잃었다가 스스로 다시 섰다 — 곧 또 잃을 수 있으니 리포트를 권한다
    if (s.phase === 'live' && (prev.phase === 'recovering' || prev.phase === 'ready') && s.autoRetries > 0) {
      usePlayNotice.getState().show('recovered')
    }
  })
  const slowTimer = setInterval(() => {
    if (warnedSlow || frameStats.count < 300 || useBattleStore.getState().phase !== 'off') return
    slowStreak = frameStats.percentile(0.5) > SLOW_MEDIAN_MS ? slowStreak + 1 : 0
    if (slowStreak >= SLOW_STREAK) {
      warnedSlow = true
      usePlayNotice.getState().show('slow')
    }
  }, SLOW_POLL_MS)

  return () => {
    offMap()
    offBattle()
    offRenderer()
    clearInterval(slowTimer)
    if (waiting !== null) clearInterval(waiting)
  }
}
