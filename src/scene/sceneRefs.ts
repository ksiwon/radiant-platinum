// 씬 오브젝트 레지스트리 — 엔진(순수 TS)과 R3F 씬 사이의 얇은 다리
// R3F 컴포넌트가 마운트 시 ref를 등록하고, EngineDriver가 매 프레임 변환을 쓴다
import type { Camera, Object3D, Scene } from 'three'
import type { Rig } from '../engine/actor/locomotion'

export const sceneRefs: {
  player: Object3D | null
  /** 절차적 보행용 리그. 모델이 로드되면 PlayerModel이 채운다 */
  playerRig: Rig | null
  /**
   * 지금 구운 클립이 주인공의 뼈를 몰고 있는가 (`engine/actor/heroClips`).
   *
   * ⚠️ **켜져 있으면 절차형이 손을 뗀다.** 둘 다 같은 뼈에 쓰는데 `EngineDriver`가
   * 나중(우선순위 1)이라, 안 비키면 낚싯대를 던지는 동안에도 팔이 걷는 자세로
   * 덮인다. 클립이 없는 설치본에서는 늘 false라 절차형이 그대로 돈다
   */
  playerClip: boolean
  /** 자전거. 주인공 그룹의 자식이고, 안 탈 때는 `visible`만 꺼 둔다 */
  bike: Object3D | null
  /**
   * **지금 실제로 그리는** 카메라·씬·렌더러. `EngineDriver`가 프레임마다
   * 바뀌었을 때만 채운다.
   *
   * ⚠️ **`worldState.camera`와 다르다.** 그쪽은 우리가 **원하는** 시점이고,
   * 여기 있는 것은 `gl.render(scene, camera)`에 실제로 들어가는 그것이다.
   * 둘이 어긋난 적이 있다 — R3F가 만든 둘째 카메라의 `aspect`가 0이라
   * 첫 화면이 통째로 비었다(§41). 그때 밖에서 그것을 잴 길이 없었다.
   *
   * ⚠️ **읽기만 하는 자리다.** `player`·`bike`와 같다 — 여기 값을 넣어
   * 게임을 움직일 길은 없다
   */
  stage: { camera: Camera | null, scene: Scene | null, gl: unknown }
} = {
  player: null,
  playerRig: null,
  playerClip: false,
  bike: null,
  stage: { camera: null, scene: null, gl: null },
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
  /**
   * **실제로 나간 프레임 수.** `EngineDriver`가 `render()`가 돌아온 뒤에 센다.
   *
   * ⚠️ **`fps`로는 「이 상태가 화면에 나갔는가」를 못 잰다.** 씬에 무엇을 붙인
   * 뒤 그것이 눈에 보이려면 프레임이 한 장 더 나가야 하는데, 밖에서는 그
   * 한 장을 셀 길이 없어 검사가 **고정 시간을 기다리고** 있었다
   * (`scene/terrainMark`가 이 수로 기다림을 상태로 바꾼다)
   */
  frames: 0,
}
