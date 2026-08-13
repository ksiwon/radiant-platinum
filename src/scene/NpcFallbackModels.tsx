// 정식 BDSP 모델이 없는 오버월드 배치를 위한 입체 폴백.
//
// 원작 스프라이트를 평면에 붙이는 대신 사람은 저폴리 3D 몸, 포켓몬은 이미
// 추출한 실제 모델, 장애물은 종류별 입체 소품으로 세운다. 정식 모델을 나중에
// 추가하면 `NpcModels`가 먼저 그 배치를 차지하므로 이 계층은 자동으로 숨는다.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BoxGeometry, CapsuleGeometry, Color, CylinderGeometry, DodecahedronGeometry,
  Group, IcosahedronGeometry, Mesh, MeshStandardMaterial, SphereGeometry, type Material,
} from 'three'
import type { MapGrid } from '../engine/map/grid'
import { npcActors, type NpcActor } from '../engine/actor/npcs'
import { npcSprite } from '../engine/actor/sprites'
import { DIR_STEP } from '../engine/script/movement'
import { RUN_SPEED, WALK_SPEED } from '../engine/actor/player'
import { worldState } from '../state/worldState'
import { loadMonModel, makeBody, play, type MonBody } from './battle/monModel'

const MAX = 64
const RANGE = 48
const MOVING = 0.05

const HEAD = new SphereGeometry(0.24, 12, 8)
const HAIR = new SphereGeometry(0.265, 12, 8)
const TORSO = new CapsuleGeometry(0.2, 0.42, 4, 8)
const LIMB = new CapsuleGeometry(0.065, 0.34, 3, 6)
const ROCK = new DodecahedronGeometry(0.42, 0)
const BALL = new SphereGeometry(0.19, 12, 8)
const TRUNK = new CylinderGeometry(0.14, 0.2, 0.75, 8)
const CROWN = new IcosahedronGeometry(0.48, 1)
const BOX = new BoxGeometry(0.72, 0.54, 0.28)
const POST = new CylinderGeometry(0.16, 0.2, 0.8, 8)
const DISC = new CylinderGeometry(0.42, 0.42, 0.14, 16)

type PropKind = 'rock' | 'tree' | 'ball' | 'case' | 'machine'

interface HumanRig {
  root: Group
  leftArm: Group
  rightArm: Group
  leftLeg: Group
  rightLeg: Group
  phase: number
}

interface Slot {
  outer: Group
  human: HumanRig | null
  mon: MonBody | null
  lastX: number
  lastZ: number
  disposed: boolean
  materials: Material[]
}

interface Props {
  grid: MapGrid
  layer: number
  /** `NpcModels`가 정식 GLB로 세운 배치. 이 계층은 그 사람을 중복 렌더하지 않는다. */
  standing?: ReadonlySet<NpcActor>
}

export function NpcFallbackModels({ grid, layer, standing }: Props) {
  const groupRef = useRef<Group>(null)
  const slots = useMemo(() => new Map<NpcActor, Slot>(), [])

  useEffect(() => () => {
    const group = groupRef.current
    for (const slot of slots.values()) {
      slot.disposed = true
      group?.remove(slot.outer)
      for (const material of slot.materials) material.dispose()
    }
    slots.clear()
  }, [slots])

  useFrame((_, delta) => {
    const group = groupRef.current
    if (group === null) return
    const player = worldState.player.position
    const seen = new Set<NpcActor>()
    let count = 0

    for (const actor of npcActors.list) {
      if (count >= MAX) break
      if (!actor.visible || standing?.has(actor) === true) continue
      if (Math.abs(actor.x - player.x) > RANGE || Math.abs(actor.z - player.z) > RANGE) continue
      const sprite = npcSprite(actor.gfx)
      if (sprite === null) continue

      let slot = slots.get(actor)
      if (!slot) {
        slot = buildSlot(sprite.name)
        slots.set(actor, slot)
        group.add(slot.outer)
      }
      count++
      seen.add(actor)

      const y = grid.heightAtWorld(actor.x + 0.5, actor.z + 0.5, layer) ?? 0
      slot.outer.position.set(actor.x + 0.5, y, actor.z + 0.5)
      const step = DIR_STEP[actor.dir & 3]!
      slot.outer.rotation.y = Math.atan2(step.x, step.z)
      slot.outer.visible = true

      const moved = Math.hypot(actor.x - slot.lastX, actor.z - slot.lastZ)
      slot.lastX = actor.x
      slot.lastZ = actor.z
      const speed = delta > 0 ? moved / delta : 0
      if (slot.human) updateHuman(slot.human, delta, speed < MOVING ? 0 : speed)
      if (slot.mon) slot.mon.mixer.update(delta)
    }

    for (const [actor, slot] of slots) {
      if (!seen.has(actor)) slot.outer.visible = false
    }
  })

  return <group ref={groupRef} />
}

export type FallbackKind = 'human' | 'pokemon' | PropKind

/** 감사·테스트에서 모든 원작 graphicsID가 어느 입체 갈래로 가는지 확인한다. */
export function fallbackKind(name: string): FallbackKind {
  if (MON_BY_NAME[name] !== undefined) return 'pokemon'
  if (/ROCK|BOULDER/.test(name)) return 'rock'
  if (/TREE/.test(name)) return 'tree'
  if (/POKEBALL/.test(name)) return 'ball'
  if (/BRIEFCASE/.test(name)) return 'case'
  if (/(^|_)(VENT|BOLLARD|DOOR|PAINTING|SHARDS)(_|$)/.test(name)) return 'machine'
  return 'human'
}

function buildSlot(name: string): Slot {
  const outer = new Group()
  const materials: Material[] = []
  const slot: Slot = {
    outer, human: null, mon: null, lastX: 0, lastZ: 0, disposed: false, materials,
  }
  const kind = fallbackKind(name)
  if (kind === 'human') {
    const crowd = name.match(/GROUP_OF_(\d)/)?.[1]
    if (crowd) {
      const n = Number(crowd)
      for (let i = 0; i < n; i++) {
        const rig = makeHuman(`${name}_${String(i)}`, materials)
        rig.root.position.set((i % 2) * 0.42 - 0.21, 0, Math.floor(i / 2) * 0.32 - 0.16)
        outer.add(rig.root)
        if (i === 0) slot.human = rig
      }
    } else {
      slot.human = makeHuman(name, materials)
      outer.add(slot.human.root)
    }
  } else if (kind === 'pokemon') {
    makePokemon(name, slot)
  } else {
    outer.add(makeProp(kind, name, materials))
  }
  return slot
}

function makeHuman(name: string, materials: Material[]): HumanRig {
  const root = new Group()
  const seed = hash(name)
  const child = /TWIN|KID|YOUNGSTER|LASS|TUBER|NINJA_BOY/.test(name)
  const tall = child ? 0.82 : /OLD_|EXPERT/.test(name) ? 0.94 : 1
  root.scale.setScalar(tall)

  const skin = material(skinColor(seed), materials)
  const hair = material(colorFor(seed, 0.13, 0.18), materials)
  const cloth = material(colorFor(seed ^ 0x9e3779b9, 0.58, 0.44), materials)
  const dark = material(colorFor(seed ^ 0x85ebca6b, 0.34, 0.24), materials)

  const torso = mesh(TORSO, cloth)
  torso.position.y = 1.02
  torso.scale.set(1, 1, 0.78)
  root.add(torso)

  const head = mesh(HEAD, skin)
  head.position.set(0, 1.58, 0.035)
  root.add(head)
  const hairMesh = mesh(HAIR, hair)
  hairMesh.position.set(0, 1.64, -0.055)
  hairMesh.scale.set(1.02, 0.82, 0.96)
  root.add(hairMesh)

  const leftArm = limb(-0.25, 1.28, cloth)
  const rightArm = limb(0.25, 1.28, cloth)
  const leftLeg = limb(-0.105, 0.72, dark)
  const rightLeg = limb(0.105, 0.72, dark)
  root.add(leftArm, rightArm, leftLeg, rightLeg)

  return { root, leftArm, rightArm, leftLeg, rightLeg, phase: seed % 7 }
}

function limb(x: number, y: number, mat: MeshStandardMaterial): Group {
  const pivot = new Group()
  pivot.position.set(x, y, 0)
  const body = mesh(LIMB, mat)
  body.position.y = -0.22
  pivot.add(body)
  return pivot
}

function updateHuman(rig: HumanRig, delta: number, speed: number): void {
  if (speed <= 0) {
    rig.phase += delta * 1.5
    rig.root.position.y = Math.sin(rig.phase) * 0.012
    rig.leftArm.rotation.x *= Math.max(0, 1 - delta * 8)
    rig.rightArm.rotation.x *= Math.max(0, 1 - delta * 8)
    rig.leftLeg.rotation.x *= Math.max(0, 1 - delta * 8)
    rig.rightLeg.rotation.x *= Math.max(0, 1 - delta * 8)
    return
  }
  const rate = speed >= RUN_SPEED * 0.8 ? 11 : speed >= WALK_SPEED * 0.8 ? 7 : 5
  rig.phase += delta * rate
  const swing = Math.sin(rig.phase) * (speed >= RUN_SPEED * 0.8 ? 0.65 : 0.42)
  rig.leftArm.rotation.x = swing
  rig.rightArm.rotation.x = -swing
  rig.leftLeg.rotation.x = -swing
  rig.rightLeg.rotation.x = swing
  rig.root.position.y = Math.abs(Math.sin(rig.phase)) * 0.035
}

function makeProp(kind: PropKind, name: string, materials: Material[]): Group {
  const root = new Group()
  const seed = hash(name)
  if (kind === 'rock') {
    const rock = mesh(ROCK, material(new Color('#77736c'), materials))
    rock.position.y = 0.38
    rock.scale.set(1.05, 0.8, 1)
    root.add(rock)
  } else if (kind === 'tree') {
    const trunk = mesh(TRUNK, material(new Color('#76502c'), materials))
    trunk.position.y = 0.38
    const crown = mesh(CROWN, material(new Color('#3c7d3d'), materials))
    crown.position.y = 1.05
    crown.scale.set(0.88, 1.05, 0.88)
    root.add(trunk, crown)
  } else if (kind === 'ball') {
    const ball = mesh(BALL, material(new Color('#e73f45'), materials))
    ball.position.y = 0.23
    const button = mesh(new SphereGeometry(0.055, 8, 6), material(new Color('#f4f1e8'), materials))
    button.position.set(0, 0.23, 0.18)
    root.add(ball, button)
  } else if (kind === 'case') {
    const box = mesh(BOX, material(new Color('#8f5b34'), materials))
    box.position.y = 0.3
    root.add(box)
  } else {
    const post = mesh(POST, material(colorFor(seed, 0.2, 0.38), materials))
    post.position.y = 0.4
    const cap = mesh(DISC, material(colorFor(seed ^ 0x517cc1b7, 0.52, 0.46), materials))
    cap.position.y = 0.85
    root.add(post, cap)
  }
  return root
}

function makePokemon(name: string, slot: Slot): void {
  const ref = MON_BY_NAME[name]
  if (ref === undefined) return
  const loading = mesh(BALL, material(new Color('#a4c9ff'), slot.materials))
  loading.position.y = 0.25
  loading.scale.setScalar(0.45)
  slot.outer.add(loading)
  void loadMonModel(ref[0], ref[1]).then((loaded) => {
    if (slot.disposed || loaded === null) return
    slot.outer.remove(loading)
    const body = makeBody(loaded)
    if (body.tall > 2.6) body.root.scale.setScalar(2.6 / body.tall)
    slot.outer.add(body.root)
    slot.mon = body
    play(body, 'wait')
  }).catch(() => { /* 로딩 구체를 남겨 배치 자체가 사라지지는 않게 한다 */ })
}

type SharedGeometry = BoxGeometry | CapsuleGeometry | CylinderGeometry
  | DodecahedronGeometry | IcosahedronGeometry | SphereGeometry

function mesh(geometry: SharedGeometry, mat: MeshStandardMaterial): Mesh {
  const out = new Mesh(geometry, mat)
  out.castShadow = true
  out.receiveShadow = false
  return out
}

function material(color: Color, owned: Material[]): MeshStandardMaterial {
  const out = new MeshStandardMaterial({ color, roughness: 0.82, metalness: 0 })
  owned.push(out)
  return out
}

function hash(value: string): number {
  let out = 2166136261
  for (let i = 0; i < value.length; i++) {
    out ^= value.charCodeAt(i)
    out = Math.imul(out, 16777619)
  }
  return out >>> 0
}

function colorFor(seed: number, saturation: number, lightness: number): Color {
  return new Color().setHSL((seed % 360) / 360, saturation, lightness)
}

function skinColor(seed: number): Color {
  const tones = ['#f5c7a9', '#e9ad86', '#ca8662', '#8d583c']
  return new Color(tones[(seed >>> 6) % tones.length]!)
}

/** 원작 배치에서 독립 그래픽으로 쓰는 포켓몬. 폼 번호는 추출 인덱스 계약이다. */
const MON_BY_NAME: Readonly<Record<string, readonly [number, number]>> = {
  PIKACHU: [25, 0], CLEFAIRY: [35, 0], PSYDUCK: [54, 0], MACHOP: [66, 0],
  MAGIKARP: [129, 0], TORCHIC: [255, 0], SHROOMISH: [285, 0], SKITTY: [300, 0],
  STARLY: [396, 0], PACHIRISU: [417, 0], DRIFLOON: [425, 0], BUNEARY: [427, 0],
  HAPPINY: [440, 0], CROAGUNK: [453, 0], UXIE: [480, 0], MESPRIT: [481, 0],
  AZELF: [482, 0], HEATRAN: [485, 0], REGIGIGAS: [486, 0], GIRATINA_ALTERED: [487, 0],
  CRESSELIA: [488, 0], DARKRAI: [491, 0], SHAYMIN: [492, 0], ARCEUS: [493, 0],
  ROTOM_HEAT: [479, 1], ROTOM_WASH: [479, 2], ROTOM_FROST: [479, 3],
  ROTOM_FAN: [479, 4], ROTOM_MOW: [479, 5],
}
