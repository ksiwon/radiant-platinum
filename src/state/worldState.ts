// 프레임 상태 — React를 절대 건드리지 않는 mutable 싱글톤 (PLAN §3.2 ③)
import { Vector2, Vector3 } from 'three'

export const worldState = {
  player: {
    position: new Vector3(0, 0, 0),
    prevPosition: new Vector3(0, 0, 0), // 렌더 보간용
    velocity: new Vector3(),
    facing: 0,
    grounded: true,
    /**
     * 턱을 넘는 중. `t`가 0에서 1까지 가는 동안 입력도 충돌도 안 본다 —
     * 원작도 뛰는 동안은 조작이 안 먹는다 (`actor/ledge`)
     */
    hop: { active: false, t: 0, fromX: 0, fromZ: 0, toX: 0, toZ: 0 },
  },
  camera: {
    position: new Vector3(0, 6, 9),
    target: new Vector3(),
    /**
     * 1인칭 시선의 좌우. **0이 북쪽(−Z)**이고 오른쪽으로 돌면 커진다.
     *
     * 3인칭은 안 본다 — 원작처럼 카메라가 북쪽에 고정이다
     */
    yaw: 0,
    /** 1인칭 시선의 위아래. 위가 양수고 `PITCH_LIMIT`까지만 열린다 */
    pitch: 0,
    distance: 8,
    height: 4,
    /**
     * 3인칭인가 1인칭인가.
     *
     * 조작이 갈린다. 3인칭은 원작대로 방향키가 **월드 축**을 가리키고, 1인칭은
     * **시선이 기준**이다 — 눈이 캐릭터 안에 있는데 W가 늘 북쪽이면 서쪽을 보며
     * 앞으로 가려다 옆으로 걷는다
     */
    mode: 'third' as 'third' | 'first',
  },
  time: { elapsed: 0, gameHour: 12 },
  // `interact`가 원작의 A, `cancel`이 B다. 대사창은 둘 다로 넘어가고
  // (`ScriptContext_CheckABPress`) 예/아니오는 B가 "아니오"로 간다
  input: { move: new Vector2(), run: false, interact: false, cancel: false },
}

export type WorldState = typeof worldState
