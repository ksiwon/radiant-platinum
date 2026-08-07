// 씬 오브젝트 레지스트리 — 엔진(순수 TS)과 R3F 씬 사이의 얇은 다리
// R3F 컴포넌트가 마운트 시 ref를 등록하고, EngineDriver가 매 프레임 변환을 쓴다
import type { Object3D } from 'three'
import type { Rig } from '../engine/actor/locomotion'

export const sceneRefs: {
  player: Object3D | null
  /** 절차적 보행용 리그. 모델이 로드되면 PlayerModel이 채운다 */
  playerRig: Rig | null
  /**
   * 주인공 모델이 원본 키에서 줄어든 배수.
   *
   * NPC 모델이 이 값을 그대로 쓴다 — **사람 키를 우리가 정하지 않기 위해서다.**
   * 사람마다 같은 키로 맞추면 어린아이가 어른과 같아진다. 배수 하나만 공유하면
   * 사람 사이 크기 차이는 BDSP 원본 그대로 남는다
   */
  playerScale: number | null
} = {
  player: null,
  playerRig: null,
  playerScale: null,
}

// 성능 계측 스냅샷 (PerfOverlay가 폴링)
export const perfSnapshot = {
  fps: 0,
  frameMs: 0,
  drawCalls: 0,
  triangles: 0,
  backend: '?',
}
