// 프레임 상태 — React를 절대 건드리지 않는 mutable 싱글톤 (PLAN §3.2 ③)
import { Vector2, Vector3 } from 'three'

export const worldState = {
  player: {
    position: new Vector3(0, 0, 0),
    prevPosition: new Vector3(0, 0, 0), // 렌더 보간용
    velocity: new Vector3(),
    facing: 0,
    grounded: true,
  },
  camera: {
    position: new Vector3(0, 6, 9),
    target: new Vector3(),
    yaw: 0,
    distance: 8,
    height: 4,
    /**
     * 3인칭인가 1인칭인가.
     *
     * 조작은 둘이 같다 — 원작처럼 방향키가 **월드 축**을 가리키고 캐릭터가 그쪽을
     * 본다. 1인칭은 그 시선 위에 눈을 얹은 것이라 이동 코드가 안 갈린다
     */
    mode: 'third' as 'third' | 'first',
  },
  time: { elapsed: 0, gameHour: 12 },
  // `interact`가 원작의 A, `cancel`이 B다. 대사창은 둘 다로 넘어가고
  // (`ScriptContext_CheckABPress`) 예/아니오는 B가 "아니오"로 간다
  input: { move: new Vector2(), run: false, interact: false, cancel: false },
}

export type WorldState = typeof worldState
