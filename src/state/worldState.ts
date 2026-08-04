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
  },
  time: { elapsed: 0, gameHour: 12 },
  input: { move: new Vector2(), run: false, interact: false },
}

export type WorldState = typeof worldState
