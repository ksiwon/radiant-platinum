// 연출 모델 하나를 그린다 — 창기둥 영상 · 배로 건너가기가 같이 쓴다 (`data/demo` · DATA.md §2.21f)
//
// 부르는 쪽이 틱마다 자세(`DemoPose` — 자리 · 크기 · 애니 칸의 정수 프레임)를 주면 그대로 옮긴다:
//
//   BCA0 관절   노드 무리의 행렬 (`nodeMatricesAt` — 원작 사슬 그대로)
//   BTA0 UV    그림 밀기 (`uvOffsetAt`)
//   BTP0 그림   그림 갈아 끼우기 (굽는 쪽이 부르는 그림을 다 시트에 싣는다)
//   BMA0 재질   알파 · 빛을 안 켠 재질의 확산색
//   BVA0 보임   노드마다 보임
//
// 빛(`DemoLighting`)을 주면 재질마다 켠 빛과 재질색(`demoModels`의 `light` — 전역 재질색을 주면 그것)으로 원작
// 하드웨어의 정점 빛 셈을 한다 (GBATEK 「DS 3D Polygon Light Parameters」 · 시점 공간):
//
//     색 = 방사 + Σ 켠 빛 i [ 반사 × 빛색 × max(0, −H·N)² + 확산 × 빛색 × max(0, −L·N) + 환경 × 빛색 ]
//     H = (L + (0, 0, −1)) / 2          ← 시선은 늘 −z
//
// 채널마다 31에서 자른다. 늘 가득인 재질(방사 + Σ 환경 × 빛색 ≥ 1)은 그림 색 그대로 둔다.
// 광고판 노드(`BB` · `BBY`)는 돌림만 카메라 것으로 갈아 낀다
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Color, Euler, Matrix4, Quaternion, Vector3,
  type BufferGeometry, type Camera, type Group, type Material, type MeshBasicMaterial, type Texture,
} from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { cameraViewMatrix, dot, float, materialColor, max, normalView, vec3, vec4 } from 'three/tsl'
import { cinematicStage, CINEMATIC_ORIGIN } from './battle/stageRefs'
import { loadDemoAnims, loadDemoMesh, loadDemoSheet, sliceTexture, type ChunkMesh, type TexSheet } from './chunkMesh'
import { propMaterials } from './propMeshes'
import { markSeeThrough } from './fx/seeThrough'
import { nodeMatricesAt, restWorld, romMaterial, splitByNode, submeshesOf, uvOffsetAt, type PropClip } from './propAnim'
import { retireTexture } from './retireTexture'

/** 월드 유닛 16 = 한 칸 */
const UNITS_PER_TILE = 16
const TAU = Math.PI * 2

type Rgb5 = readonly [number, number, number]
/** 빛 하나 — 방향은 빛이 나아가는 쪽(세계 공간 · 길이 1 안팎), 색은 RGB5 */
interface DemoLight { dir: readonly [number, number, number], color: Rgb5 }
/**
 * 빛 넷(없는 빛은 null)과 전역 재질색. 전역을 주면 모델 재질의 확산 · 환경 · 반사 · 방사 대신 그것을 쓴다
 * (`NNS_G3dMdlUseGlbDiff` · `…Amb` · `…Spec` · `…Emi`) — 켠 빛은 늘 재질 것이다
 */
export interface DemoLighting {
  lights: readonly (DemoLight | null)[]
  global?: { diffuse: Rgb5, ambient: Rgb5, specular: Rgb5, emission: Rgb5 } | null
}

/** 재질 하나의 빛 셈 입력 — `light` 칸 `[켠 빛, 확산 · 환경 · 반사 · 방사 RGB5]`에 전역을 덮는다 */
function colorsOf(light: readonly number[], lighting: DemoLighting): { mask: number, d: Rgb5, a: Rgb5, s: Rgb5, e: Rgb5 } {
  const at = (i: number): Rgb5 => [light[i] ?? 0, light[i + 1] ?? 0, light[i + 2] ?? 0]
  const g = lighting.global
  return {
    mask: light[0] ?? 0,
    d: g?.diffuse ?? at(1), a: g?.ambient ?? at(4), s: g?.specular ?? at(7), e: g?.emission ?? at(10),
  }
}

type Anims = NonNullable<Awaited<ReturnType<typeof loadDemoAnims>>>
export interface DemoLoaded { mesh: ChunkMesh, sheet: TexSheet | null, anims: Anims }

/** 한 틱의 자세 — 자리 · 크기는 칸 자 · 프레임은 애니 칸마다 정수 */
export interface DemoPose { pos: readonly [number, number, number], scale: readonly [number, number, number], frames: readonly number[] }

/** 모델 · 시트 · 애니를 받는다. 하나라도 없으면 null (그 물체만 안 보인다) */
export function loadDemoModel(name: string): Promise<DemoLoaded | null> {
  return Promise.all([loadDemoMesh(name), loadDemoSheet(name), loadDemoAnims(name)])
    .then(([mesh, sheet, anims]) => (anims ? { mesh, sheet, anims } : null))
    .catch(() => null)
}

type Mapped = Material & { map: Texture | null, color?: Color, opacity: number }
const mapped = (m: Material | undefined): Mapped | null => (m !== undefined && 'map' in m ? (m as Mapped) : null)

/** 1이 넘는 한 늘 가득이다 — 그 재질은 명암이 없다 */
function saturates(light: readonly number[], lighting: DemoLighting): boolean {
  const { mask, a, e } = colorsOf(light, lighting)
  for (let c = 0; c < 3; c++) {
    let sum = e[c]! / 31
    for (const [i, l] of lighting.lights.entries()) if (l && (mask >> i) & 1) sum += (a[c]! / 31) * (l.color[c]! / 31)
    if (sum < 1) return false
  }
  return true
}

/** 빛을 켠 재질 — 원작 하드웨어의 정점 빛 셈을 화소에서 한다 */
function litMaterial(from: MeshBasicMaterial, light: readonly number[], lighting: DemoLighting): Material {
  const { mask, d, a, s: sp, e } = colorsOf(light, lighting)
  const m = new MeshBasicNodeMaterial()
  m.map = from.map
  m.vertexColors = from.vertexColors
  m.transparent = from.transparent
  m.alphaTest = from.alphaTest
  m.opacity = from.opacity
  m.depthWrite = from.depthWrite
  m.side = from.side
  m.fog = false
  // 빛을 켠 면의 색은 빛 셈이 다 낸다 — 확산색을 한 번 더 곱하지 않는다
  m.color = new Color(1, 1, 1)
  const n = normalView.normalize()
  const v3 = (c: Rgb5) => vec3(c[0] / 31, c[1] / 31, c[2] / 31)
  type V3 = ReturnType<typeof vec3>
  let sum = v3(e) as unknown as V3
  for (const [i, l] of lighting.lights.entries()) {
    if (!l || ((mask >> i) & 1) === 0) continue
    const c = v3(l.color)
    // 빛 방향은 시점 공간으로 (원작은 카메라 행렬이 걸린 채로 빛을 싣는다)
    const lv = cameraViewMatrix.mul(vec4(l.dir[0], l.dir[1], l.dir[2], 0)).xyz
    const diffuse = max(dot(lv, n).negate(), float(0))
    const half = lv.add(vec3(0, 0, -1)).mul(0.5)
    const shine = max(dot(half.negate(), n), float(0))
    sum = sum.add(v3(sp).mul(c).mul(shine.mul(shine)))
      .add(v3(d).mul(c).mul(diffuse)).add(v3(a).mul(c)) as unknown as V3
  }
  // `materialColor`는 그림을 곱한 vec4다(타입은 vec3로 적혀 있다) — 알파를 살려야 그림의 구멍이 그대로 뚫린다
  const base = materialColor as unknown as ReturnType<typeof vec4>
  m.colorNode = vec4(base.rgb.mul(sum.min(vec3(1, 1, 1))), base.a)
  markSeeThrough(m, from.transparent)
  return m
}

const seeThrough = (m: MeshBasicMaterial): void => {
  m.transparent = true
  m.depthWrite = false
  m.alphaTest = 0.01
  markSeeThrough(m, true)
}

/** 한 물체의 재질 — 서브메시마다 따로 (BMA0가 이름으로 건다) */
function buildMaterials(d: DemoLoaded, lighting: DemoLighting | null): {
  materials: Material[], owned: Texture[], swaps: Map<string, Texture>
} {
  const base = propMaterials(d.mesh, d.sheet)
  const seen = new Set<Material>()
  const owned: Texture[] = []
  const alphaAnimated = new Set<string>()
  for (const clip of d.anims.clips) {
    if (clip?.kind !== 'BMA0') continue
    for (const t of clip.anim.tracks) {
      const a0 = t.alpha(0)
      for (let f = 1; f < clip.frames; f++) if (t.alpha(f) !== a0) { alphaAnimated.add(t.material); break }
    }
  }
  const materials = base.map((m0, i) => {
    let m = m0 as MeshBasicMaterial
    if (seen.has(m)) m = m.clone()
    seen.add(m)
    m.fog = false
    const map = mapped(m)?.map
    if (map) owned.push(map)
    const rom = romMaterial(d.mesh, i)
    const name = d.anims.info.materials[rom]
    // 알파가 움직이는 재질은 처음부터 비치게 둔다 — 틱마다 켜고 끄면 파이프라인을 다시 굽는다
    if (name !== undefined && alphaAnimated.has(name)) seeThrough(m)
    if (d.anims.blend.includes(rom)) seeThrough(m)
    m.needsUpdate = true
    const light = d.anims.light[rom]
    if (lighting && light && light[0] !== 0 && !saturates(light, lighting)) {
      const lit = litMaterial(m, light, lighting)
      m.dispose()
      return lit
    }
    return m
  })
  // BTP0가 갈아 끼울 그림 — 미리 잘라 둔다
  const swaps = new Map<string, Texture>()
  if (d.sheet) {
    for (const clip of d.anims.clips) {
      if (clip?.kind !== 'BTP0') continue
      for (const track of clip.anim.tracks) {
        for (const key of track.keys) {
          const k = `${key.texture} ${key.palette}`
          if (swaps.has(k)) continue
          const at = d.sheet.items.find((s) => s.tex === key.texture && s.pal === key.palette)
          const spec = d.mesh.materials.find((m) => m.tex === key.texture)
          if (at) swaps.set(k, sliceTexture(d.sheet, at, spec?.rep ?? 3))
        }
      }
    }
  }
  return { materials, owned, swaps }
}

const bbPos = new Vector3()
const bbQuat = new Quaternion()
const bbScale = new Vector3()
const bbEuler = new Euler(0, 0, 0, 'YXZ')
const bbWorld = new Matrix4()

/**
 * 광고판 노드 (`BB` · `BBY`) — 그 노드의 지금 행렬에서 돌림만 카메라 것으로 갈아 낀다. 자리와 배율(열 길이)은 그대로다.
 * 정점은 기본 자세로 구워져 있으니(`restWorld`) 그것을 되돌린 위에 얹는다: 그룹 = 뿌리⁻¹ × 광고판 × 기본⁻¹
 */
function faceCamera(root: Group, group: Group, rest: Matrix4, restInv: Matrix4, yOnly: boolean, camera: Camera): void {
  root.updateWorldMatrix(true, false)
  const anim = group.matrixAutoUpdate ? new Matrix4() : group.matrix.clone()
  bbWorld.copy(root.matrixWorld).multiply(anim).multiply(rest)
  bbWorld.decompose(bbPos, bbQuat, bbScale)
  if (yOnly) {
    bbEuler.setFromQuaternion(camera.quaternion)
    bbQuat.setFromEuler(new Euler(0, bbEuler.y, 0, 'YXZ'))
  } else bbQuat.copy(camera.quaternion)
  bbWorld.compose(bbPos, bbQuat, bbScale)
  group.matrixAutoUpdate = false
  group.matrix.copy(root.matrixWorld).invert().multiply(bbWorld).multiply(restInv)
  group.matrixWorldNeedsUpdate = true
}

function applyClip(
  clip: PropClip, frame: number, built: ReturnType<typeof buildMaterials>, joints: Map<number, Group>, data: DemoLoaded,
): void {
  const { info } = data.anims
  if (clip.kind === 'BCA0') {
    const mats = nodeMatricesAt(info, clip.anim, joints.keys(), frame)
    for (const [node, group] of joints) {
      const mat = mats.get(node)
      if (!mat) continue
      group.matrixAutoUpdate = false
      group.matrix.copy(mat)
      group.matrixWorldNeedsUpdate = true
    }
  } else if (clip.kind === 'BTA0') {
    for (const [i, spec] of data.mesh.materials.entries()) {
      const rom = romMaterial(data.mesh, i)
      const name = info.materials[rom]
      const map = mapped(built.materials[i])?.map
      if (name === undefined || !map || spec.tex === null) continue
      const [u, v] = uvOffsetAt(clip.anim, name, info.uv[rom] ?? [0, 0], frame)
      map.offset.set(u, v)
    }
  } else if (clip.kind === 'BTP0') {
    for (const i of data.mesh.materials.keys()) {
      const name = info.materials[romMaterial(data.mesh, i)]
      const track = clip.anim.tracks.find((t) => t.material === name)
      const mat = mapped(built.materials[i])
      if (!track || !mat) continue
      let hit = track.keys[0]
      for (const k of track.keys) if (k.frame <= frame) hit = k
      const next = hit ? built.swaps.get(`${hit.texture} ${hit.palette}`) : undefined
      if (next && mat.map !== next) { mat.map = next; mat.needsUpdate = true }
    }
  } else if (clip.kind === 'BMA0') {
    for (const t of clip.anim.tracks) {
      const rom = info.materials.indexOf(t.material)
      const light = data.anims.light[rom]
      for (const i of submeshesOf(data.mesh, rom)) {
        const mat = mapped(built.materials[i])
        if (!mat) continue
        // 폴리곤 알파 0~31. 원작 0은 선만 그리는 자리다 — 안 보이게 둔다 (PARITY §8.15)
        mat.opacity = t.alpha(frame) / 31
        // 빛을 안 켠 재질은 확산색이 곧 정점색이다 (`diffAmb`의 15비트)
        if (mat.color && (light?.[0] ?? 0) === 0) {
          const d = t.diffuse(frame)
          mat.color.setRGB((d & 31) / 31, ((d >> 5) & 31) / 31, ((d >> 10) & 31) / 31)
        }
      }
    }
  } else {
    for (const [node, group] of joints) group.visible = clip.anim.visible(frame, node)
  }
}

/** 연출 모델 하나 — `pose`가 null이면 숨는다 */
export function DemoInstance({ name, data, pose, lighting = null }: {
  name: string, data: DemoLoaded, pose: () => DemoPose | null, lighting?: DemoLighting | null,
}) {
  const camera = useThree((st) => st.camera)
  const boards = useMemo(() => data.anims.billboard.map(([node, y]) => {
    const rest = restWorld(data.anims.info, node)
    return { node, y: y === 1, rest, restInv: rest.clone().invert() }
  }), [data])
  const built = useMemo(() => buildMaterials(data, lighting), [data, lighting])
  const parts = useMemo(() => splitByNode(data.mesh, data.anims.info.submeshNodes), [data])
  useEffect(() => () => {
    for (const m of built.materials) m.dispose()
    for (const t of built.owned) retireTexture(t)
    for (const t of built.swaps.values()) retireTexture(t)
  }, [built])
  const root = useRef<Group>(null)
  const joints = useRef(new Map<number, Group>())

  useFrame(() => {
    const g = root.current
    if (!g) return
    const me = pose()
    g.visible = me !== null
    if (!me) return
    g.position.set(me.pos[0], me.pos[1], me.pos[2])
    g.scale.set(me.scale[0], me.scale[1], me.scale[2])
    // 광고판은 관절을 되돌려 놓고 다시 얹는다 — 관절 애니가 없는 노드도 돈다
    for (const b of boards) { const j = joints.current.get(b.node); if (j) { j.matrixAutoUpdate = true; j.matrix.identity() } }
    for (const [slot, clip] of data.anims.clips.entries()) {
      if (clip === null) continue
      applyClip(clip, Math.max(0, Math.min(clip.frames - 1, me.frames[slot] ?? 0)), built, joints.current, data)
    }
    for (const b of boards) {
      const j = joints.current.get(b.node)
      if (j) faceCamera(g, j, b.rest, b.restInv, b.y, camera)
    }
  })

  return (
    <group ref={root} name={name}>
      {[...parts].map(([node, geometry]: [number, BufferGeometry]) => (
        <group key={node} ref={(j) => { if (j) joints.current.set(node, j); else joints.current.delete(node) }}>
          <mesh geometry={geometry} material={built.materials} />
        </group>
      ))}
    </group>
  )
}

/**
 * 원작 카메라를 연출 무대에 건다 (`Camera_AdjustPositionAroundTarget`) — 겨눔점(칸) · 각(65536 한 바퀴) · 거리(칸) ·
 * 화각 반각(65536 한 바퀴) · 자르는 면(칸). y는 −각 x의 사인이다
 */
export function aimDemoCamera(
  lens: Camera, target: readonly [number, number, number], angleX: number, angleY: number, dist: number,
  fovHalf: number, near: number, far: number,
): void {
  const ax = (angleX / 65536) * TAU, ay = (angleY / 65536) * TAU
  cinematicStage.target.set(CINEMATIC_ORIGIN.x + target[0], CINEMATIC_ORIGIN.y + target[1], CINEMATIC_ORIGIN.z + target[2])
  cinematicStage.position.set(
    cinematicStage.target.x + dist * Math.sin(ay) * Math.cos(ax),
    cinematicStage.target.y + dist * Math.sin(-ax),
    cinematicStage.target.z + dist * Math.cos(ay) * Math.cos(ax),
  )
  cinematicStage.fov = (2 * fovHalf * 360) / 65536
  const p = lens as Camera & { near: number, far: number, updateProjectionMatrix?: () => void }
  if (p.near !== near || p.far !== far) {
    p.near = near
    p.far = far
    p.updateProjectionMatrix?.()
  }
}

/** 원작 fx32 월드 유닛 → 칸 */
export const fxTiles = (v: number): number => v / 4096 / UNITS_PER_TILE
