// 대습초원 사파리가 도는 자리 (PARITY §7.7)
//
// 규칙은 `engine/world/safari`가 들고 있고 여기는 **리포트를 잇는 일**과
// 습초원 열차를 맡는다.
//
// ⚠️ **깃발이 서 있는 동안은 배틀이 딴 것이다.** 기술도 경험치도 없고 볼·먹이·
// 진흙·도망 넷뿐이다 — 그 판정은 배틀 쪽이 이 깃발을 보고 갈린다.
import { propPlacements } from '../engine/map/propPlacement'
import { world as mapWorld } from '../engine/map/world'
import {
  endSafari, leaveSafari, safariStep, SCRIPT_SAFARI_OUT_OF_BALLS, SCRIPT_SAFARI_OUT_OF_STEPS,
  startSafari, TRAM_STOP_Z, tramMove,
} from '../engine/world/safari'
import { fieldScripts, start } from '../engine/script/field'
import { mapById } from '../engine/map/world'
import { useSaveStore } from '../state/saveStore'

/** `great_marsh_train.nsbmd`의 소품 번호 (`meson.build` 줄 번호 − 2) */
export const TRAM_MODEL = 475

/**
 * 열차가 한 타일을 가는 데 걸리는 시간.
 *
 * ⚠️ **우리가 정한 값이다.** 원작은 프레임마다 속도 단계를 올렸다 내리며
 * 움직이는데(`sRidingTramNorthMovements` 넷) 그 단계값이 그림 자료 쪽에 있다.
 * 걷는 속도(한 칸 0.25초)의 두 배로 잡아 「타고 가는」 느낌을 남긴다
 */
export const TRAM_SECONDS_PER_TILE = 0.125

/** 지금 움직이고 있는 열차. 안 움직이면 null */
let moving: { fromZ: number; toZ: number; elapsed: number; seconds: number } | null = null

/** 열차가 선 z. 안 움직일 때는 리포트의 자리다 */
function tramZ(): number {
  if (moving !== null) {
    const t = Math.min(1, moving.elapsed / moving.seconds)
    return moving.fromZ + (moving.toZ - moving.fromZ) * t
  }
  return TRAM_STOP_Z[useSaveStore.getState().safari.tram] ?? TRAM_STOP_Z[2]!
}

/** 열차 소품. 배치 기록의 x·y를 그대로 쓰고 z만 갈아 끼운다 */
export function greatMarshTramProp(): { model: number; x: number; y: number; z: number } | null {
  const grid = mapWorld.grid
  if (grid === null) return null
  const at = propPlacements(grid.meta, mapWorld.mapId, TRAM_MODEL)[0]
  if (at === undefined) return null
  return { model: TRAM_MODEL, x: at.x, y: at.y, z: tramZ() }
}

/** 프레임마다 민다. 도착하면 리포트의 자리가 이미 새 자리다 */
export function stepTram(dt: number): void {
  if (moving === null) return
  moving.elapsed += dt
  if (moving.elapsed >= moving.seconds) moving = null
}

/** 열차가 서 있는가. 스크립트가 이걸로 기다린다 */
export function tramSettled(): boolean { return moving === null }

export const safariServices = {
  setActive: (active: boolean): void => {
    const at = useSaveStore.getState().safari
    const next = active ? startSafari() : endSafari()
    // 잡은 마리는 **시작할 때** 지운다 (`TVBroadcast_ResetSafariGameData`).
    // 끝낼 때 지우면 안내원이 물어볼 수가 없다
    useSaveStore.setState({
      safari: { ...at, ...next, caught: active ? 0 : at.caught },
    })
  },

  caught: (): number => useSaveStore.getState().safari.caught,

  /**
   * ⚠️ **이미 세워져 있으면 자리를 안 건드린다.** 우리 리포트는 열차 자리를
   * 늘 들고 있으므로, 원작이 갈래 번호로 하던 판정을 「자리가 이미 있다」로 읽는다 —
   * 어차피 새 리포트가 5·6구역에서 시작한다
   */
  initTram: (): void => { moving = null },

  moveTram: (to: number, _movement: number): void => {
    const save = useSaveStore.getState()
    const from = save.safari.tram
    if (from === to) { moving = null; return }
    const plan = tramMove(from, to)
    const fromZ = TRAM_STOP_Z[from] ?? plan.destZ
    moving = {
      fromZ,
      toZ: plan.destZ,
      elapsed: 0,
      seconds: Math.abs(plan.destZ - fromZ) * TRAM_SECONDS_PER_TILE,
    }
    // 자리는 **떠나는 순간** 바뀐다 — 원작도 태스크를 걸기 전에 적어 둔다
    useSaveStore.setState({ safari: { ...save.safari, tram: to } })
  },

  tramSettled,

  tramAt: (location: number): boolean => useSaveStore.getState().safari.tram === location,
}

/**
 * 한 걸음 (`Field_UpdateSafari`).
 *
 * ⚠️ **스크립트를 거는 것이 곧 끝내는 것이다.** 볼이 떨어졌든 걸음을 다 썼든
 * 롬의 스크립트가 안내원 대사를 띄우고 `StartEndSafariGame 1`로 닫는다 —
 * 우리가 글을 지어내지 않는다
 */
export function safariFieldStep(): void {
  const save = useSaveStore.getState()
  const got = safariStep(save.safari)
  if (got.kind === 'off') return
  const mapFile = mapById(mapWorld.mapId)?.scripts ?? -1
  if (got.kind === 'noBalls') { start(SCRIPT_SAFARI_OUT_OF_BALLS, mapFile); return }
  useSaveStore.setState({ safari: { ...save.safari, ...got.state } })
  if (got.kind === 'noSteps') start(SCRIPT_SAFARI_OUT_OF_STEPS, mapFile)
}

/**
 * 놀이 밖으로 나갔다 (하늘을날기·순간이동·탈출로프).
 *
 * ⚠️ **볼과 걸음은 안 지운다** — 원작도 깃발만 내린다. 다시 들어오면 안내원이
 * 새 판을 열어 준다
 */
export function safariLeave(): void {
  const save = useSaveStore.getState()
  const next = leaveSafari(save.safari)
  if (next !== save.safari) useSaveStore.setState({ safari: { ...save.safari, ...next } })
}

/** 놀이 중인가. 배틀과 시작 메뉴가 이걸 본다 */
export function safariActive(): boolean {
  return useSaveStore.getState().safari.active
}

/** 스크립트가 열차를 아직 안 세웠을 때를 위한 초기화. 필드가 뜰 때 부른다 */
export function resetTram(): void { moving = null }

/** 변수 표가 아직 없을 때를 위한 안전장치 — 스크립트가 못 돌면 아무것도 안 한다 */
export function safariReady(): boolean { return fieldScripts.vars !== null }
