// 3인칭 추적 카메라 — 크리티컬 댐프드 추적 (PLAN §6.2 필드 프리셋)
import { Vector3 } from 'three'
import { worldState } from '../../state/worldState'

const PRESET = { distance: 8, height: 4, damping: 5 }

const goal = new Vector3()

export const cameraSystem = {
  update(delta: number) {
    const cam = worldState.camera
    const p = worldState.player.position

    goal.set(p.x, p.y + PRESET.height, p.z + PRESET.distance)
    const t = 1 - Math.exp(-PRESET.damping * delta)
    cam.position.lerp(goal, t)
    cam.target.lerp(p, t)
  },
}
