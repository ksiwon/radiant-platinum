// 씬 오브젝트 레지스트리 — 엔진(순수 TS)과 R3F 씬 사이의 얇은 다리
// R3F 컴포넌트가 마운트 시 ref를 등록하고, EngineDriver가 매 프레임 변환을 쓴다
import type { Object3D } from 'three'
import type { Rig } from '../engine/actor/locomotion'

export const sceneRefs: {
  player: Object3D | null
  /** 절차적 보행용 리그. 모델이 로드되면 PlayerModel이 채운다 */
  playerRig: Rig | null
} = {
  player: null,
  playerRig: null,
}

// 성능 계측 스냅샷 (PerfOverlay가 폴링)
export const perfSnapshot = {
  fps: 0,
  frameMs: 0,
  drawCalls: 0,
  triangles: 0,
  backend: '?',
}
