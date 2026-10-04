// 시퀀스의 역할(0 쓴 쪽 · 1 맞는 쪽)을 무대의 자리(슬롯)에 잇는 맥락 — `BdspSequence`가 `SeqContext`로 건넨다.
//
// 역할은 둘뿐이다. 더블에서 여럿을 맞히는 기술(`cast.to`가 하나이거나 없는 전체기)도 시퀀스는 한 번 돌고, 맞는 쪽은
// `MoveVfx`가 고른 한 자리다(대상 없는 줄은 맞은편 첫 자리). 쓴 쪽이 없는 시퀀스(내보내기 · 기절)는 역할 0이 `null`이다
import type { SeqAnchor, Role, SeqContext, bodyAt } from '../../../engine/battle/fx/sequence'
import { slotAnchor } from './seqAnchors'

type RoleSlots = readonly [string | null, string | null]
export type RoleContext = Pick<SeqContext, 'anchor' | 'home' | 'mine' | 'rest'>

/**
 * @param spotAt 그 자리의 발판 (x, z)
 * @param offsetOf 그 자리 몸을 **이 시퀀스가** 옮겨 둔 만큼(무대 좌표). 없으면 `undefined` — `rest`가 그만큼 되돌린다
 */
export function roleContext(
  roles: RoleSlots,
  spotAt: (slot: string) => [number, number],
  offsetOf: (slot: string) => readonly number[] | undefined,
): RoleContext {
  return {
    anchor: (role: Role, node: number): SeqAnchor | null => {
      const slot = roles[role]
      return slot ? slotAnchor(slot, node, spotAt(slot)) : null
    },
    home: (role: Role): SeqAnchor | null => {
      const slot = roles[role]
      if (!slot) return null
      const [x, z] = spotAt(slot)
      return { pos: [x, 0, z], yaw: slotAnchor(slot, 0, [x, z]).yaw }
    },
    // 그 역할이 내 쪽(p1)인가. 자리가 없으면 반대 역할의 반대 — 쓴 쪽이 없는 시퀀스에서 쓴 쪽은 맞는 쪽의 반대 편이다
    mine: (role: Role): boolean => {
      const slot = roles[role]
      if (slot) return slot.startsWith('p1')
      const other = roles[role === 0 ? 1 : 0]
      return other ? !other.startsWith('p1') : role === 0
    },
    rest: (role: Role, node: number): SeqAnchor | null => {
      const slot = roles[role]
      if (!slot) return null
      const a = slotAnchor(slot, node, spotAt(slot))
      const off = offsetOf(slot)
      if (off) { a.pos[0] -= off[0]!; a.pos[1] -= off[1]!; a.pos[2] -= off[2]! }
      return a
    },
  }
}

type Pose = ReturnType<typeof bodyAt>

/** 한 몸에 걸린 두 역할의 값 — 옮김 · 떨림 · 돌기는 더하고, 크기는 곱하고, 감추기는 어느 한쪽이라도, 동작은 늦게 시킨 쪽 */
export function mergePose(a: Pose, b: Pose): Pose {
  const motion = !a.motion ? b.motion : !b.motion ? a.motion : b.motion.at >= a.motion.at ? b.motion : a.motion
  return {
    offset: [a.offset[0] + b.offset[0], a.offset[1] + b.offset[1], a.offset[2] + b.offset[2]],
    scale: [a.scale[0] * b.scale[0], a.scale[1] * b.scale[1], a.scale[2] * b.scale[2]],
    visible: a.visible && b.visible,
    glow: b.glow ?? a.glow,
    turn: a.turn + b.turn,
    shake: [a.shake[0] + b.shake[0], a.shake[1] + b.shake[1], a.shake[2] + b.shake[2]],
    motion,
    motionSpeed: Math.min(a.motionSpeed, b.motionSpeed),
    intro: a.intro || b.intro,
  }
}
