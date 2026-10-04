// BDSP 배틀 이펙트 하나를 무대에 세운다 (BATTLE_FX §4).
//
// 시뮬레이션은 `engine/battle/fx`(유니티 좌표 · 1/60초 고정 걸음)이고 여기는 그것을
// GPU에 얹는 일만 한다 — 렌더러 하나 = 인스턴스 메시 하나. 그리는 차례는 유니티의
// 투명 정렬을 흉내 낸다: 렌더 큐 → `sortingFudge`(낮을수록 나중에, 즉 위에) →
// `sortingOrder` → 나무 차례.
//
// ⚠️ **시계는 연출 시계다.** 기본은 `battleClock`의 차이만 먹는다(`SplParticles`와
// 같은 방식). `clock`을 주면 그 값(재생 뒤 초)으로 **정확히 그 걸음까지** 간다 —
// 뒤로 가면 처음부터 다시 돌려 거기까지 간다. 시험대(`/fxlab?t=`)와 트레일러의
// 가상 시계가 같은 그림을 얻는 길이다.
//
// ⚠️ **X를 뒤집는다.** 받는 자리·회전은 우리 장면 좌표다. 유니티 쪽으로는
// `S·P·S`(S = diag(−1,1,1))로 옮겨 넘기고, 돌아올 때는 `engine/battle/fx/instances`가
// 다시 S를 씌운다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute, DataTexture, DynamicDrawUsage, InstancedInterleavedBuffer, InterleavedBufferAttribute,
  InstancedBufferGeometry, Quaternion, Euler, RGBAFormat, type Mesh, type PerspectiveCamera, type Texture,
} from 'three'
import type { MeshBasicNodeMaterial } from 'three/webgpu'
import { battleClock, ClockReader } from '../../../engine/battle/presentationClock'
import { FxEffect } from '../../../engine/battle/fx/effect'
import {
  makeInstances, renderModeOf, RenderMode, writeInstances, type FxCamera, type FxInstances,
} from '../../../engine/battle/fx/instances'
import { materialKey, readMaterial } from '../../../engine/battle/fx/material'
import type { FxMesh, FxPrefab } from '../../../engine/battle/fx/schema'
import type { FxSlot } from '../../../engine/battle/fx/effect'
import { buildFxMaterial } from './fxMaterial'
import { loadFxPrefab, loadFxTexture } from './fxAssets'

/** 무거운 프레임 뒤 한 번에 따라잡는 위끝 (초) — 연출 시계도 0.1초로 자른다 */
const MAX_CATCH_UP = 0.25

type Vec3 = readonly [number, number, number]

interface BdspEffectProps {
  /** 프리팹 이름 (`eb001_capture`) */
  name: string
  position?: Vec3
  /** 오일러 (라디안, three XYZ) — 우리 장면 좌표 */
  rotation?: Vec3
  scale?: number | Vec3
  seed?: number
  /** 다 끝나면 처음부터 다시 */
  loop?: boolean
  /** 재생 뒤 몇 초인가를 직접 준다. 안 주면 `battleClock`을 따른다 */
  clock?: () => number
  /** 이 문자열이 경로에 든 렌더러만 그린다 (시험대 `&only=`) */
  only?: string
  /** 걸음마다 부른다 — 시험대가 상태를 적는다 */
  onStep?: (effect: FxEffect) => void
  onDone?: () => void
}

/** 렌더러 하나의 GPU 물건 */
interface Rig {
  slot: FxSlot
  geometry: InstancedBufferGeometry
  material: MeshBasicNodeMaterial
  inst: FxInstances
  /** 인스턴스 값 한 덩어리 — vec4 여덟 칸 (`LANES`) */
  packed: Float32Array
  buffer: InstancedInterleavedBuffer
  order: Uint16Array
  renderOrder: number
}

/**
 * 인스턴스 값의 칸 (vec4 하나씩):
 *   iL0 가운데.xyz + 이펙트 시각 · iL1~3 축 X·Y·Z · iL4 정점색 · iL5 C0 · iL6 C1 · iL7 그림 칸 UV
 */
const LANES = ['iL0', 'iL1', 'iL2', 'iL3', 'iL4', 'iL5', 'iL6', 'iL7'] as const
const STRIDE = LANES.length * 4

/** 따로 적힌 인스턴스 값을 한 덩어리로 엮는다 */
function pack(inst: FxInstances, out: Float32Array, n: number, time: number): void {
  for (let k = 0; k < n; k++) {
    const o = k * STRIDE
    const a = k * 3
    const b = k * 4
    out[o] = inst.center[a]!; out[o + 1] = inst.center[a + 1]!; out[o + 2] = inst.center[a + 2]!; out[o + 3] = time
    out[o + 4] = inst.axisX[a]!; out[o + 5] = inst.axisX[a + 1]!; out[o + 6] = inst.axisX[a + 2]!
    out[o + 8] = inst.axisY[a]!; out[o + 9] = inst.axisY[a + 1]!; out[o + 10] = inst.axisY[a + 2]!
    out[o + 12] = inst.axisZ[a]!; out[o + 13] = inst.axisZ[a + 1]!; out[o + 14] = inst.axisZ[a + 2]!
    for (let c = 0; c < 4; c++) {
      out[o + 16 + c] = inst.color[b + c]!
      out[o + 20 + c] = inst.c0[b + c]!
      out[o + 24 + c] = inst.c1[b + c]!
      out[o + 28 + c] = inst.rect[b + c]!
    }
  }
}

/** 재질은 이펙트 이름 + 노드 경로로 나눠 쓴다 (같은 이펙트가 둘 서도 한 벌) */
const materials = new Map<string, MeshBasicNodeMaterial>()

let white: Texture | null = null
function whiteTexture(): Texture {
  if (!white) {
    white = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat)
    white.needsUpdate = true
  }
  return white
}

/**
 * 유니티 꼭짓점을 우리 좌표로: X를 뒤집고 삼각형 차례도 뒤집는다 (머리말).
 * 판은 유니티 판(가로 x · 세로 y, UV 왼쪽 아래 0)을 같은 규칙으로 옮긴 것이다
 */
function meshGeometry(mesh: FxMesh | { name: string; builtin?: string } | null | undefined, mode: RenderMode): InstancedBufferGeometry | null {
  const g = new InstancedBufferGeometry()
  let pos: number[]
  let uvs: number[]
  let idx: number[]
  if (mode !== RenderMode.Mesh) {
    pos = [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]
    uvs = [0, 0, 1, 0, 1, 1, 0, 1]
    // 유니티 판은 −Z(카메라 쪽)를 본다 — 그쪽에서 시계 방향
    idx = [0, 2, 1, 0, 3, 2]
  } else if (mesh && 'positions' in mesh && mesh.positions.length >= 9) {
    pos = Array.from(mesh.positions)
    uvs = mesh.uvs && mesh.uvs.length >= (pos.length / 3) * 2 ? Array.from(mesh.uvs) : new Array<number>((pos.length / 3) * 2).fill(0)
    idx = Array.from(mesh.indices)
  } else if (mesh && 'builtin' in mesh && (mesh.builtin === 'Cube' || mesh.builtin === 'Quad')) {
    if (mesh.builtin === 'Quad') {
      pos = [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]
      uvs = [0, 0, 1, 0, 1, 1, 0, 1]
      idx = [0, 2, 1, 0, 3, 2]
    } else {
      ;({ pos, uvs, idx } = unityCube())
    }
  } else {
    if (mesh) console.info(`[fx] 메시 ${mesh.name}를 못 그린다 — 건너뛴다`)
    return null
  }
  const mirrored = new Float32Array(pos.length)
  for (let i = 0; i < pos.length; i += 3) {
    mirrored[i] = -pos[i]!; mirrored[i + 1] = pos[i + 1]!; mirrored[i + 2] = pos[i + 2]!
  }
  const flipped: number[] = []
  for (let i = 0; i + 2 < idx.length; i += 3) flipped.push(idx[i]!, idx[i + 2]!, idx[i + 1]!)
  g.setAttribute('position', new BufferAttribute(mirrored, 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  g.setIndex(flipped)
  g.instanceCount = 0
  return g
}

/** 유니티 기본 정육면체 (한 변 1) — 면마다 바깥에서 볼 때 시계 방향(유니티 앞면) */
function unityCube(): { pos: number[]; uvs: number[]; idx: number[] } {
  const pos: number[] = []
  const uvs: number[] = []
  const idx: number[] = []
  const faces: [Vec3, Vec3, Vec3][] = [
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  ]
  for (const [n, u, v] of faces) {
    const b = pos.length / 3
    for (const [su, sv] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]] as const) {
      pos.push(n[0] * 0.5 + u[0] * su + v[0] * sv, n[1] * 0.5 + u[1] * su + v[1] * sv, n[2] * 0.5 + u[2] * su + v[2] * sv)
      uvs.push(su + 0.5, sv + 0.5)
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
  }
  return { pos, uvs, idx }
}

/** 텍스처 이름들 */
function texNamesOf(prefab: FxPrefab): string[] {
  const out = new Set<string>()
  const walk = (n: FxPrefab['roots'][number]): void => {
    for (const c of n.components ?? []) {
      if (c.type !== 'ParticleSystemRenderer') continue
      const mats = (c as { materials?: ({ textures?: Record<string, { name: string }> } | null)[] }).materials
      for (const t of Object.values(mats?.[0]?.textures ?? {})) out.add(t.name)
    }
    for (const k of n.children ?? []) walk(k)
  }
  for (const r of prefab.roots) walk(r)
  return [...out]
}

function buildRigs(effect: FxEffect, maps: ReadonlyMap<string, Texture>): Rig[] {
  const rigs: Rig[] = []
  for (const slot of effect.slots) {
    const rend = slot.renderer
    if (!rend || rend.enabled === false) continue // 렌더러가 꺼졌으면 굴리기만 한다
    const mode = renderModeOf(rend.renderMode)
    if (mode === RenderMode.None) continue
    const matData = rend.materials?.[0]
    if (!matData) continue
    const spec = readMaterial(matData, slot.controller)
    if (spec.hidden) continue
    const geometry = meshGeometry(rend.mesh, mode)
    if (!geometry) continue
    const key = `${effect.name}/${slot.path}`
    let material = materials.get(key)
    if (!material) {
      const texs = spec.textures.map((t) => maps.get(t.name) ?? whiteTexture())
      material = buildFxMaterial(spec, texs, mode !== RenderMode.Mesh)
      material.userData.fxKey = materialKey(spec)
      materials.set(key, material)
    }
    const cap = slot.system.cap
    const inst = makeInstances(cap)
    // ⚠️ **정점 버퍼는 여덟 개까지다** (WebGPU `maxVertexBuffers`). 칸마다 따로 두면
    // 위치·UV 둘 + 인스턴스 아홉 = 열하나라 파이프라인이 아예 안 선다(실측: 시험대가
    // 통째로 비었다). 인스턴스 값은 **버퍼 하나에 엮는다** — 셋이면 된다
    const packed = new Float32Array(cap * STRIDE)
    const buffer = new InstancedInterleavedBuffer(packed, STRIDE, 1)
    buffer.setUsage(DynamicDrawUsage)
    LANES.forEach((name, lane) => { geometry.setAttribute(name, new InterleavedBufferAttribute(buffer, 4, lane * 4)) })
    const queue = spec.queue
    rigs.push({ slot, geometry, material, inst, packed, buffer, order: new Uint16Array(cap), renderOrder: queue })
  }
  // 유니티 투명 정렬 흉내: 큐 → fudge 큰 것 먼저 → sortingOrder → 나무 차례
  const ranked = [...rigs].sort((a, b) =>
    a.renderOrder - b.renderOrder
    || (b.slot.renderer!.sortingFudge ?? 0) - (a.slot.renderer!.sortingFudge ?? 0)
    || (a.slot.renderer!.sortingOrder ?? 0) - (b.slot.renderer!.sortingOrder ?? 0)
    || a.slot.index - b.slot.index)
  ranked.forEach((r, i) => { r.renderOrder = i })
  return rigs
}

const camScratch = {
  pos: [0, 0, 0] as [number, number, number],
  right: [1, 0, 0] as [number, number, number],
  up: [0, 1, 0] as [number, number, number],
  forward: [0, 0, -1] as [number, number, number],
  tanHalfFov: Math.tan((15 * Math.PI) / 180),
}

export function BdspEffect({
  name, position, rotation, scale, seed = 1, loop = false, clock, only, onStep, onDone,
}: BdspEffectProps) {
  const [ready, setReady] = useState<{ effect: FxEffect; rigs: Rig[] } | null>(null)

  useEffect(() => {
    let alive = true
    setReady(null)
    void (async () => {
      const prefab = await loadFxPrefab(name)
      const names = texNamesOf(prefab)
      const maps = new Map<string, Texture>()
      await Promise.all(names.map(async (n) => {
        try { maps.set(n, await loadFxTexture(n)) } catch (e) { console.warn(`[fx] 그림 ${n}을 못 받았다`, e) }
      }))
      if (!alive) return
      const effect = new FxEffect(prefab, seed)
      const rigs = buildRigs(effect, maps)
      setReady({ effect, rigs })
    })().catch((e: unknown) => { console.error(`[fx] 이펙트 ${name}을 못 세웠다`, e) })
    return () => { alive = false }
  }, [name, seed])

  // 배치 — 우리 좌표 → 유니티 (S·P·S)
  const px = position?.[0] ?? 0, py = position?.[1] ?? 0, pz = position?.[2] ?? 0
  const rx = rotation?.[0] ?? 0, ry = rotation?.[1] ?? 0, rz = rotation?.[2] ?? 0
  const s3: Vec3 = typeof scale === 'number' ? [scale, scale, scale] : scale ?? [1, 1, 1]
  const placement = useMemo(() => {
    const q = new Quaternion().setFromEuler(new Euler(rx, ry, rz))
    return { pos: [-px, py, pz] as Vec3, quat: [q.x, -q.y, -q.z, q.w], scale: s3 }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 배열 신원이 아니라 값으로 본다
  }, [px, py, pz, rx, ry, rz, s3[0], s3[1], s3[2]])

  const reader = useRef(new ClockReader())
  const ended = useRef(false)
  const meshes = useRef<(Mesh | null)[]>([])

  useEffect(() => {
    if (!ready) return
    ready.effect.place(placement.pos, placement.quat, placement.scale)
  }, [ready, placement])

  useEffect(() => {
    if (!ready) return
    ready.effect.place(placement.pos, placement.quat, placement.scale)
    ready.effect.play()
    reader.current.reset()
    ended.current = false
    return () => { for (const r of ready.rigs) r.geometry.dispose() }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 새 이펙트일 때만 처음부터
  }, [ready])

  useFrame((state) => {
    if (!ready) return
    const { effect, rigs } = ready
    if (clock) {
      const want = Math.max(0, clock())
      // 뒤로 가면 처음부터 다시 — 걸음이 결정적이라 같은 자리에 다시 선다
      if (want + 1e-6 < effect.time) effect.play()
      effect.advanceTo(want)
    } else {
      effect.advance(Math.min(reader.current.read(battleClock.now()), MAX_CATCH_UP))
    }
    onStep?.(effect)

    const cam = state.camera
    const e = cam.matrixWorld.elements
    camScratch.pos[0] = e[12]!; camScratch.pos[1] = e[13]!; camScratch.pos[2] = e[14]!
    camScratch.right[0] = e[0]!; camScratch.right[1] = e[1]!; camScratch.right[2] = e[2]!
    camScratch.up[0] = e[4]!; camScratch.up[1] = e[5]!; camScratch.up[2] = e[6]!
    camScratch.forward[0] = -e[8]!; camScratch.forward[1] = -e[9]!; camScratch.forward[2] = -e[10]!
    norm(camScratch.right); norm(camScratch.up); norm(camScratch.forward)
    const fov = (cam as PerspectiveCamera).fov
    camScratch.tanHalfFov = Math.tan(((fov ?? 30) * Math.PI) / 360)
    const fxCam: FxCamera = camScratch

    for (const [i, r] of rigs.entries()) {
      const n = writeInstances(r.slot, fxCam, r.inst, r.order)
      const mesh = meshes.current[i]
      if (mesh) mesh.visible = n > 0
      r.geometry.instanceCount = n
      if (n === 0) continue
      pack(r.inst, r.packed, n, effect.time)
      r.buffer.clearUpdateRanges()
      r.buffer.addUpdateRange(0, n * STRIDE)
      r.buffer.needsUpdate = true
    }

    if (!ended.current && effect.done) {
      ended.current = true
      onDone?.()
      if (loop) {
        effect.play()
        ended.current = false
      }
    }
  })

  if (!ready) return null
  return (
    <group>
      {/* 인스턴스가 어디까지 가는지 경계 상자로는 모른다 — 자르지 않는다 */}
      {ready.rigs.map((r, i) => (only && !r.slot.path.includes(only) ? null : (
        <mesh
          key={r.slot.path || r.slot.index}
          ref={(m) => { meshes.current[i] = m }}
          geometry={r.geometry}
          material={r.material}
          renderOrder={r.renderOrder}
          frustumCulled={false}
          visible={false}
        />
      )))}
    </group>
  )
}

function norm(v: [number, number, number]): void {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  v[0] /= l; v[1] /= l; v[2] /= l
}
