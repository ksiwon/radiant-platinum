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
  InstancedBufferGeometry, Matrix4, Quaternion, Euler, RGBAFormat, Group, Mesh, type Object3D,
  type PerspectiveCamera, type Texture,
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
  /**
   * 프레임마다 자리를 받는다 (우리 무대 좌표 · 사원수 xyzw). 주면 `position`·`rotation`·`scale`
   * 대신 이것을 쓴다 — BDSP 시퀀스가 입자를 몸에 붙여 옮길 때다
   */
  pose?: () => { pos: readonly [number, number, number]; quat: readonly [number, number, number, number]; scale: readonly [number, number, number] } | null
  /** 이 시각(이펙트 시계 초)에 뿜기를 멈춘다 (`ParticleStop`) — 살아 있는 입자는 끝까지 산다 */
  stopAt?: number
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
  /** 형상을 돌려줄 통의 이름 (`geometryPool`) */
  key: string
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

/** 다 쓴 형상 — 인스턴스 버퍼까지 붙은 채로 같은 칸의 다음 이펙트가 받아 쓴다 */
interface Pooled { geometry: InstancedBufferGeometry; packed: Float32Array; buffer: InstancedInterleavedBuffer }

/**
 * 이펙트가 끝나도 형상을 **버리지 않고** 이펙트 이름 + 노드 경로별 통에 넣는다.
 *
 * ⚠️ **형상을 버리면 파이프라인도 같이 버려진다.** three(WebGPU)는 렌더 파이프라인을 그것을 쓰는 렌더 물체 수로 세고,
 * 형상의 `dispose`가 그 물체를 지워서 수가 0이 되면 파이프라인을 놓는다. 그래서 같은 기술을 다시 쓸 때마다 파이프라인
 * 스물여덟 개를 GPU 프로세스가 동기로 다시 지었고(`DawnCachingInterface::CacheHit` 28번 · `CommandBuffer::Flush`
 * 806ms) 기술마다 0.8초가 멎었다 — 배포판 번들 · 크로미움 트레이스 실측(2026-10-05). 통에 남은 형상이 렌더 물체를
 * 붙잡고 있어서 파이프라인이 산다
 */
const geometryPool = new Map<string, Pooled[]>()

/** 프리팹과 그것이 쓰는 그림을 받아 이펙트 하나를 세운다 */
async function prepareEffect(name: string, seed: number): Promise<{ effect: FxEffect; rigs: Rig[] }> {
  const prefab = await loadFxPrefab(name)
  const maps = new Map<string, Texture>()
  await Promise.all(texNamesOf(prefab).map(async (n) => {
    try { maps.set(n, await loadFxTexture(n)) } catch (e) { console.warn(`[fx] 그림 ${n}을 못 받았다`, e) }
  }))
  const effect = new FxEffect(prefab, seed)
  return { effect, rigs: buildRigs(effect, maps) }
}

/** 이미 미리 구운 이펙트 — 두 번 굽지 않는다 */
const warmed = new Set<string>()

/**
 * 판이 열리는 동안 이 이펙트들의 파이프라인을 **비동기로** 미리 굽는다.
 *
 * 처음 쓰는 기술도 0.8초씩 멎었다 — 그 프레임에 three가 파이프라인을 동기로 짓기 때문이다(`geometryPool` 머리말).
 * 이펙트 재질은 늘 비동기로 굽히므로(`ALWAYS_ASYNC`), 여기서는 **진짜 씬에 몇 프레임 세워 두기만** 한다 — 크기 0인 입자
 * 하나씩이라 화면에는 아무것도 안 나온다. 그 사이 렌더가 제 맥락(씬 패스의 첨부 · MRT)에서 파이프라인을 굽기 시작하고,
 * 다 쓴 형상은 통에 들어가 그 파이프라인을 붙잡는다. 실제로 쓸 때는 그 통에서 꺼내므로 같은 파이프라인을 그대로 탄다.
 *
 * ⚠️ **`renderer.compileAsync`로 굽지 않는다.** 그 길은 캔버스 맥락에서 셰이더를 지어서 씬 패스의 MRT 출력이 빠지고,
 * 파이프라인 생성이 실패했다(`Color target has no corresponding fragment stage output` · 2026-10-05 실측). WebGPU에서
 * 그 길이 바인드 그룹 캐시를 깨뜨린 적도 있다(`warmPipelines`의 `worthWarming`)
 */
export async function warmFxEffects(names: Iterable<string>, scene: Object3D, extras: readonly Object3D[] = []): Promise<void> {
  const todo = [...new Set(names)].filter((n) => !warmed.has(n))
  if (todo.length === 0 && extras.length === 0) return
  for (const n of todo) warmed.add(n)
  const holder = new Group()
  // 같이 구울 몸 · 볼 — 땅 밑에 세워 둔다. 화면 밖이어도 잘라내기를 끄면 렌더가 파이프라인을 묻는다
  for (const e of extras) {
    e.traverse((o) => { o.frustumCulled = false })
    holder.add(e)
  }
  holder.name = 'fx 미리 굽기'
  // ⚠️ **뒤집힌 쪽도 굽는다.** three는 행렬식이 음수인 물체(앞면 감기가 뒤집힌다)를 다른 파이프라인으로 친다
  // (`WebGPUBackend.getRenderCacheKey`의 `frontFaceCW`). 이펙트를 세우는 행렬이 어느 쪽이 될지는 배치가 정한다
  const mirrored = new Group()
  mirrored.scale.set(-1, 1, 1)
  holder.add(mirrored)
  const built: Rig[][] = []
  await Promise.all(todo.map(async (n) => {
    try {
      const { rigs } = await prepareEffect(n, 1)
      built.push(rigs)
      for (const r of rigs) {
        // 가운데 0 · 축 0인 입자 하나 — 넓이가 없어서 아무것도 안 칠한다. 0개면 그리기 자체를 건너뛸 수 있다
        r.packed.fill(0)
        r.buffer.needsUpdate = true
        r.geometry.instanceCount = 1
        for (const parent of [holder, mirrored]) {
          const m = new Mesh(r.geometry, r.material)
          m.frustumCulled = false
          parent.add(m)
        }
      }
    } catch (e) {
      warmed.delete(n)
      console.warn(`[fx] ${n}을 미리 못 구웠다`, e)
    }
  }))
  scene.add(holder)
  try {
    // 두 프레임이면 렌더가 물체마다 파이프라인을 한 번씩 묻는다 — 굽기는 그 뒤로도 Dawn 작업 스레드에서 이어진다
    await nextFrames(3)
  } finally {
    holder.removeFromParent()
    mirrored.clear()
    holder.clear()
    for (const rigs of built) releaseRigs(rigs)
  }
}

function nextFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number): void => {
      if (left <= 0) { resolve(); return }
      if (typeof requestAnimationFrame === 'undefined') setTimeout(() => { step(left - 1) }, 16)
      else requestAnimationFrame(() => { step(left - 1) })
    }
    step(n)
  })
}

/** 끝난 이펙트의 형상을 통에 돌려준다 */
function releaseRigs(rigs: readonly Rig[]): void {
  for (const r of rigs) {
    r.geometry.instanceCount = 0
    const pool = geometryPool.get(r.key) ?? []
    pool.push({ geometry: r.geometry, packed: r.packed, buffer: r.buffer })
    geometryPool.set(r.key, pool)
  }
}

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
    const key = `${effect.name}/${slot.path}`
    const cap = slot.system.cap
    const reused = geometryPool.get(key)?.pop()
    const geometry = reused?.geometry ?? meshGeometry(rend.mesh, mode)
    if (!geometry) continue
    let material = materials.get(key)
    if (!material) {
      const texs = spec.textures.map((t) => maps.get(t.name) ?? whiteTexture())
      material = buildFxMaterial(spec, texs, mode !== RenderMode.Mesh)
      material.userData.fxKey = materialKey(spec)
      materials.set(key, material)
    }
    const inst = makeInstances(cap)
    // ⚠️ **정점 버퍼는 여덟 개까지다** (WebGPU `maxVertexBuffers`). 칸마다 따로 두면
    // 위치·UV 둘 + 인스턴스 아홉 = 열하나라 파이프라인이 아예 안 선다(실측: 시험대가
    // 통째로 비었다). 인스턴스 값은 **버퍼 하나에 엮는다** — 셋이면 된다
    let packed: Float32Array
    let buffer: InstancedInterleavedBuffer
    if (reused) {
      packed = reused.packed
      buffer = reused.buffer
    } else {
      packed = new Float32Array(cap * STRIDE)
      buffer = new InstancedInterleavedBuffer(packed, STRIDE, 1)
      buffer.setUsage(DynamicDrawUsage)
      LANES.forEach((name, lane) => { geometry.setAttribute(name, new InterleavedBufferAttribute(buffer, 4, lane * 4)) })
    }
    const queue = spec.queue
    rigs.push({ slot, geometry, material, inst, packed, buffer, order: new Uint16Array(cap), renderOrder: queue, key })
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

const toLocal = new Matrix4()

const camScratch = {
  pos: [0, 0, 0] as [number, number, number],
  right: [1, 0, 0] as [number, number, number],
  up: [0, 1, 0] as [number, number, number],
  forward: [0, 0, -1] as [number, number, number],
  tanHalfFov: Math.tan((15 * Math.PI) / 180),
}

export function BdspEffect({
  name, position, rotation, scale, seed = 1, loop = false, clock, only, pose, stopAt, onStep, onDone,
}: BdspEffectProps) {
  const [ready, setReady] = useState<{ effect: FxEffect; rigs: Rig[] } | null>(null)

  useEffect(() => {
    let alive = true
    setReady(null)
    void (async () => {
      const got = await prepareEffect(name, seed)
      if (!alive) { releaseRigs(got.rigs); return }
      setReady(got)
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
  const stopped = useRef(false)
  const holder = useRef<Group>(null)
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
    stopped.current = false
    return () => { releaseRigs(ready.rigs) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 새 이펙트일 때만 처음부터
  }, [ready])

  useFrame((state) => {
    if (!ready) return
    const { effect, rigs } = ready
    const p = pose?.()
    if (p) {
      // 우리 좌표 → 유니티 (S·P·S) — 위 `placement`와 같은 셈
      effect.place([-p.pos[0], p.pos[1], p.pos[2]], [p.quat[0], -p.quat[1], -p.quat[2], p.quat[3]], p.scale)
    }
    if (clock) {
      const want = Math.max(0, clock())
      // 뒤로 가면 처음부터 다시 — 걸음이 결정적이라 같은 자리에 다시 선다
      if (want + 1e-6 < effect.time) { effect.play(); stopped.current = false }
      // 멈춤은 **그 걸음에** 건다 — 한 번에 여러 걸음을 가도 같은 입자가 나오게
      if (stopAt !== undefined && !stopped.current && want >= stopAt) {
        effect.advanceTo(stopAt)
        effect.stop()
        stopped.current = true
      }
      effect.advanceTo(want)
    } else {
      effect.advance(Math.min(reader.current.read(battleClock.now()), MAX_CATCH_UP))
    }
    onStep?.(effect)

    const cam = state.camera
    // ⚠️ **카메라를 이펙트 그룹의 좌표로 옮긴다.** 인스턴스 값은 그룹 안 좌표인데, 배틀 무대는
    // `STAGE_ORIGIN`(0, −500, 0)에 선다 — 월드 카메라를 그대로 쓰면 깊이가 음수가 되어 크기
    // 상한(`maxParticleSize`)이 판을 0으로 줄였다(실측: 몸통박치기 입자 34개가 살아 있는데 안 보였다)
    const root = holder.current
    if (root) {
      root.updateWorldMatrix(true, false)
      toLocal.copy(root.matrixWorld).invert().multiply(cam.matrixWorld)
    } else toLocal.copy(cam.matrixWorld)
    const e = toLocal.elements
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
    <group ref={holder}>
      {/* 인스턴스가 어디까지 가는지 경계 상자로는 모른다 — 자르지 않는다 */}
      {ready.rigs.map((r, i) => (only && !r.slot.path.includes(only) ? null : (
        <mesh
          // ⚠️ 경로만으로는 안 갈린다 — 같은 이름 형제가 있다(`ew104_bg_line` 그림자분신). 차례를 붙인다
          key={`${String(i)}:${r.slot.path}`}
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
