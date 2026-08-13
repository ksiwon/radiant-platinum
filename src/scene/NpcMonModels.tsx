// 오버월드에 서 있는 **포켓몬**을 실제 모델로 세운다 (DATA.md §2.16)
//
// 사람은 `NpcModels`가 BDSP 등신 모델로 세우고, 그 짝이 없는 사람은
// `NpcSprites`가 원작 그림 그대로 판때기로 세운다. 포켓몬만 여기서 맡는다 —
// 배틀에 쓰는 그 모델이 이미 있어서 **새로 지어내지 않고** 세울 수 있는
// 유일한 갈래이기 때문이다.
//
// ⚠️ **없는 것을 그럴듯하게 채우지 않는다.** 한때 이 자리에 사람은 캡슐,
// 바위·나무·기계는 도형으로 세우는 층이 있었다. 색이 `hash(그림이름)`에서
// 나와서 원작 팔레트와 아무 상관이 없었고, 화면에는 얼굴 없는 마네킹이
// 늘어섰다 — 원작 그림을 그대로 쓰는 판때기보다 **못한** 것으로 바꾼 셈이다.
// 정식 모델이 없으면 판때기로 남긴다.
//
// ⚠️ **모델이 실제로 도착한 뒤에만 그 배치를 가져간다.** 받는 동안 미리
// 가져가면 판때기도 안 서고 모델도 아직 없어서 그 자리가 **빈다**
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
import type { MapGrid } from '../engine/map/grid'
import { npcActors, type NpcActor } from '../engine/actor/npcs'
import { npcSprite } from '../engine/actor/sprites'
import { overworldMon } from '../engine/actor/overworldMon'
import { DIR_STEP } from '../engine/script/movement'
import { worldState } from '../state/worldState'
import { world } from '../engine/map/world'
import { groundYAt } from './distortion'
import { loadMonModel, makeBody, play, type MonBody } from './battle/monModel'

/** 동시에 세우는 수. 사람 모델(24)보다 적다 — 한 마리가 사람보다 무겁다 */
const MAX = 12
/** 그리는 거리(타일). 판때기(48)보다 짧다 */
const RANGE = 24
/** 오버월드에 세울 때의 키 상한(m). 이보다 크면 줄여서 길을 안 막는다 */
const TALL_CAP = 2.6

interface Slot {
  outer: Group
  body: MonBody | null
  disposed: boolean
}

interface Props {
  grid: MapGrid
  layer: number
  /** 사람 모델이 이미 가져간 배치. 겹쳐 세우지 않는다 */
  taken?: ReadonlySet<NpcActor>
  /** 모델이 **실제로 선** 배치. 판때기가 이 사람들을 건너뛴다 */
  onStanding: (standing: ReadonlySet<NpcActor>) => void
}

export function NpcMonModels({ grid, layer, taken, onStanding }: Props) {
  const groupRef = useRef<Group>(null)
  const slots = useMemo(() => new Map<NpcActor, Slot>(), [])
  /** 지난번에 알린 집합. 안 바뀌었으면 다시 안 알린다 — 매 프레임 새 Set이면 무한 렌더다 */
  const told = useRef<ReadonlySet<NpcActor>>(new Set())

  useEffect(() => () => {
    const group = groupRef.current
    for (const slot of slots.values()) {
      slot.disposed = true
      group?.remove(slot.outer)
    }
    slots.clear()
  }, [slots])

  useFrame((_, delta) => {
    const group = groupRef.current
    if (group === null) return
    const player = worldState.player.position
    const seen = new Set<NpcActor>()
    const up = new Set<NpcActor>()
    let count = 0

    for (const actor of npcActors.list) {
      if (count >= MAX) break
      if (!actor.visible || taken?.has(actor) === true) continue
      if (Math.abs(actor.x - player.x) > RANGE || Math.abs(actor.z - player.z) > RANGE) continue
      const sprite = npcSprite(actor.gfx)
      if (sprite === null) continue
      const ref = overworldMon(sprite.name)
      if (ref === null) continue

      let slot = slots.get(actor)
      if (slot === undefined) {
        slot = { outer: new Group(), body: null, disposed: false }
        slots.set(actor, slot)
        group.add(slot.outer)
        const mine = slot
        void loadMonModel(ref[0], ref[1]).then((loaded) => {
          if (mine.disposed || loaded === null) return
          const body = makeBody(loaded)
          if (body.tall > TALL_CAP) body.root.scale.setScalar(TALL_CAP / body.tall)
          mine.outer.add(body.root)
          mine.body = body
          play(body, 'wait')
        }).catch(() => { /* 못 받으면 판때기가 계속 그 자리를 맡는다 */ })
      }
      count++
      seen.add(actor)

      const y = groundYAt(grid, world.mapId, actor.x + 0.5, actor.z + 0.5, layer, actor.y)
      slot.outer.position.set(actor.x + 0.5, y, actor.z + 0.5)
      const step = DIR_STEP[actor.dir & 3]!
      slot.outer.rotation.y = Math.atan2(step.x, step.z)
      slot.outer.visible = true
      if (slot.body !== null) {
        slot.body.mixer.update(delta)
        up.add(actor)
      }
    }

    for (const [actor, slot] of slots) {
      if (!seen.has(actor)) slot.outer.visible = false
    }

    // 바뀐 프레임에만 알린다
    if (up.size !== told.current.size || [...up].some((a) => !told.current.has(a))) {
      told.current = up
      onStanding(up)
    }
  })

  return <group ref={groupRef} />
}
