// 포켓치를 세계에 이어 붙인다 (PARITY §7.3)
//
// 규칙은 `engine/world/poketch`에 있고, 여기서는 **누가 언제 손대는가**만 정한다:
//
//   스크립트가 준다   → 켜고, 앱을 등록한다 (`ScrCmd_RegisterPoketchApp`)
//   한 걸음 걸었다    → 만보기가 하나 는다 (`Poketch_SetStepCount`)
//   포켓몬을 얻었다   → 이력에 뒤로 붙는다 (`Poketch_PokemonHistoryEnqueue`)
//   스크립트가 감춘다 → `HidePoketch` · `ShowPoketch`
import { usePoketchStore } from '../state/poketchStore'
import { useSaveStore } from '../state/saveStore'
import {
  isAppRegistered, historyEnqueue, registerApp, setStepCount, type PoketchHistoryEntry,
} from '../engine/world/poketch'

/** 포켓치를 받는다 (`Poketch_Enable`). 축복시티의 사장이 준다 */
export function poketchEnable(): void {
  const p = useSaveStore.getState().poketch
  if (p.enabled) return
  useSaveStore.setState({ poketch: { ...p, enabled: true } })
}

export function poketchEnabled(): boolean {
  return useSaveStore.getState().poketch.enabled
}

/** 앱 하나를 등록한다. 이미 있으면 거짓 — 스크립트가 그 결과로 갈린다 */
export function poketchRegister(app: number): boolean {
  const p = useSaveStore.getState().poketch
  const next = registerApp(p, app)
  if (next === p) return false
  useSaveStore.setState({ poketch: next })
  return true
}

export function poketchHasApp(app: number): boolean {
  return isAppRegistered(useSaveStore.getState().poketch, app)
}

/**
 * 한 걸음 걸었다.
 *
 * ⚠️ **만보기를 받기 전에는 안 쌓인다** (`Poketch_SetStepCount`가 앞에서 막는다).
 * 그래서 만보기를 늦게 받아도 「0부터」다 — 걸어 온 걸음이 소급되지 않는다
 */
export function poketchStep(): void {
  const p = useSaveStore.getState().poketch
  if (!p.pedometerEnabled) return
  const next = setStepCount(p, p.stepCount + 1)
  if (next !== p) useSaveStore.setState({ poketch: next })
}

/** 손에 넣은 포켓몬을 이력에 붙인다 */
export function poketchGotMon(entry: PoketchHistoryEntry): void {
  const p = useSaveStore.getState().poketch
  useSaveStore.setState({ poketch: historyEnqueue(p, entry) })
}

/** `ScrCmd_HidePoketch` · `ScrCmd_ShowPoketch` — 연출 동안 잠깐 치운다 */
export function poketchShow(show: boolean): void {
  usePoketchStore.getState().setView(show ? 'small' : 'hidden')
}

// ── 지도 위의 지금 자리 ──────────────────────────────────────────────────────
//
// ⚠️ **밖에 있을 때만 새로 적는다.** 동굴·건물 안의 좌표는 신오 지도 위에 뜻이
// 없다 — 원작도 본 행렬을 벗어나면 `ExitLocation`(마지막으로 밖에 있던 자리)을
// 대신 본다 (`PoketchMap_GetPlayerLocation`). 우리는 그 자리를 따로 안 적어
// 두므로 **마지막으로 본 칸**을 여기 남긴다. 뜻이 같고, 안 남기면 굴 안에서
// 점이 지도 왼쪽 위 구석으로 튄다.

let lastCell: { x: number, y: number } | null = null

/** 밖을 걷는 동안 부른다. 본 행렬이 아니면 아무 일도 안 한다 */
export function poketchMarkCell(cell: { x: number, y: number } | null): void {
  if (cell) lastCell = cell
}

/** 지도에 찍을 칸. 아직 밖에 한 번도 안 나갔으면 `null`이다 */
export function poketchLastCell(): { x: number, y: number } | null {
  return lastCell
}

/** 새 판을 열면 잊는다 — 앞 판의 자리가 남으면 엉뚱한 마을에 점이 선다 */
export function resetPoketchCell(): void {
  lastCell = null
}
