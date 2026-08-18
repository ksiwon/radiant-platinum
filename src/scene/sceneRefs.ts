// 씬 오브젝트 레지스트리 — 엔진(순수 TS)과 R3F 씬 사이의 얇은 다리
// R3F 컴포넌트가 마운트 시 ref를 등록하고, EngineDriver가 매 프레임 변환을 쓴다
import type { Object3D } from 'three'
import type { Rig } from '../engine/actor/locomotion'

export const sceneRefs: {
  player: Object3D | null
  /** 절차적 보행용 리그. 모델이 로드되면 PlayerModel이 채운다 */
  playerRig: Rig | null
  /** 자전거. 주인공 그룹의 자식이고, 안 탈 때는 `visible`만 꺼 둔다 */
  bike: Object3D | null
} = {
  player: null,
  playerRig: null,
  bike: null,
}

// 성능 계측 스냅샷 (PerfOverlay가 폴링)
export const perfSnapshot = {
  fps: 0,
  frameMs: 0,
  drawCalls: 0,
  triangles: 0,
  backend: '?',
  /**
   * 이번 판에 터진 스크립트 수와 마지막 한 줄 (`engine/script/field`).
   *
   * ⚠️ **개발 HUD에만 뜬다.** 배포판은 이 수를 세기만 하고 화면에 아무것도
   * 안 띄운다 — 원작에 없는 창을 만들지 않는다 (CODEMAP §2.6). 세이브에도
   * 안 적는다: 리포트 스키마를 건드리면 `SAVE_VERSION`이 오른다
   */
  scriptErrors: 0,
  lastScriptError: null as string | null,
}
