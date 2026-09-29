// 창기둥 영상의 무대 (`overlay100` · PARITY §8.15 · `engine/world/spearPillarMovie`)
//
// 차례가 그린 순간(`movieLive.movie.shown`)을 그대로 옮긴다 — 물체마다 자리 · 크기와 애니 칸의 프레임:
//
//   BCA0 관절   노드 무리의 행렬 (`nodeMatricesAt` — 원작 사슬 그대로)
//   BTA0 UV    그림 밀기 (`uvOffsetAt`)
//   BTP0 그림   주인공 · 태홍 · 디아루가 · 펄기아의 그림 갈아 끼우기 (걸음 무늬 `Unk_ov100_021D5344`가 프레임을 정한다)
//   BMA0 재질   알파(구슬의 깜빡임 · 호수 셋의 빛무리 · 기둥이 무너지며 사라짐)와 은하의 확산색
//   BVA0 보임   검은 구슬의 번개 노드
//
// 빛은 원작 두 빛이다 (`ov100_021D47A0`) — 0번 흰빛 (0,−1,−1) · 1번 (23,23,25) (−2043,−3548,110). 재질마다 켠 빛과
// 확산 · 환경색(`demoModels`의 `light`)으로 원작 하드웨어 셈을 한다: 색 = Σ(환경 × 빛색 + 확산 × 빛색 × max(0, −빛·법선)),
// 채널마다 31에서 자른다. 환경 31 × 흰빛이면 늘 가득이라 그림 색 그대로다 — 실제로 명암이 드는 것은 1번 빛만 켠 땅과 기둥뿐이다
// (`.audit/probe/movieLights.mjs`).
//
// 카메라는 겨눔점 둘레의 원작 셈이다(`Camera_AdjustPositionAroundTarget`) — 거리 · 각 · 화각 반각 · 자르는 면.
// 바탕은 검정이다(`G3X_SetClearColor`를 안 부른다 — 초기값 검정 · 호수는 BG 바탕 0x421).
//
// ⚠️ **위 화면(2D)은 안 그린다.** 원작 장면 1 · 2는 3D를 아래 화면으로 옮기고(`ov100_021D4DC8(1)`) 위 화면에 물결치는 BG와
// 구슬 셋의 스프라이트를 띄운다. 우리는 한 화면이라 3D만 보인다 (PARITY §8.15)
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BackSide, Color, Euler, Matrix4, MeshBasicMaterial, Quaternion, Vector3,
  type BufferGeometry, type Camera, type Group, type Material, type Texture,
} from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { dot, float, materialColor, max, normalWorld, vec3, vec4 } from 'three/tsl'
import { cinematicStage, CINEMATIC_ORIGIN } from './battle/stageRefs'
import { loadDemoAnims, loadDemoMesh, loadDemoSheet, sliceTexture, type ChunkMesh, type TexSheet } from './chunkMesh'
import { propMaterials } from './propMeshes'
import { markSeeThrough } from './fx/seeThrough'
import { afterimageState } from './fx/afterimage'
import { nodeMatricesAt, restWorld, romMaterial, splitByNode, submeshesOf, uvOffsetAt, type PropClip } from './propAnim'
import { retireTexture } from './retireTexture'
import { movieLive } from './spearPillarMovie'
import { ANIM_FRAMES, movieModels, type MovieModel } from '../engine/world/spearPillarMovie'
import { useSaveStore } from '../state/saveStore'

const FX = 4096
/** 월드 유닛 16 = 한 칸 */
const UNITS_PER_TILE = 16
const TAU = Math.PI * 2

/** 원작 두 빛 (`ov100_021D47A0`) — 방향은 빛이 나아가는 쪽, 색은 RGB5 */
const LIGHTS: readonly { dir: readonly [number, number, number], color: readonly [number, number, number] }[] = [
  { dir: norm([0, -FX, -FX]), color: [31, 31, 31] },
  { dir: norm([-2043, -3548, 110]), color: [23, 23, 25] },
]

function norm(v: readonly [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2])
  return [v[0] / l, v[1] / l, v[2] / l]
}

type Anims = NonNullable<Awaited<ReturnType<typeof loadDemoAnims>>>
interface Loaded { mesh: ChunkMesh, sheet: TexSheet | null, anims: Anims }

type Mapped = Material & { map: Texture | null, color?: Color, opacity: number }
const mapped = (m: Material | undefined): Mapped | null => (m !== undefined && 'map' in m ? (m as Mapped) : null)

/** 1이 넘는 한 늘 가득이다 — 그 재질은 명암이 없다 */
function saturates(light: readonly number[]): boolean {
  const [mask = 0, , , , ar = 0, ag = 0, ab = 0] = light
  const amb = [ar, ag, ab]
  for (let c = 0; c < 3; c++) {
    let sum = 0
    for (const [i, l] of LIGHTS.entries()) if ((mask >> i) & 1) sum += (amb[c]! / 31) * (l.color[c]! / 31)
    if (sum < 1) return false
  }
  return true
}

/** 빛을 켠 재질 — 원작 하드웨어의 정점 빛 셈을 화소에서 한다 */
function litMaterial(from: MeshBasicMaterial, light: readonly number[]): Material {
  const [mask = 0, dr = 0, dg = 0, db = 0, ar = 0, ag = 0, ab = 0] = light
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
  const n = normalWorld.normalize()
  type V3 = ReturnType<typeof vec3>
  let sum = vec3(0, 0, 0) as unknown as V3
  for (const [i, l] of LIGHTS.entries()) {
    if (((mask >> i) & 1) === 0) continue
    const c = vec3(l.color[0] / 31, l.color[1] / 31, l.color[2] / 31)
    const lambert = max(dot(n, vec3(-l.dir[0], -l.dir[1], -l.dir[2])), float(0))
    sum = sum.add(vec3(ar / 31, ag / 31, ab / 31).mul(c)).add(vec3(dr / 31, dg / 31, db / 31).mul(c).mul(lambert)) as unknown as V3
  }
  // `materialColor`는 그림을 곱한 vec4다(타입은 vec3로 적혀 있다) — 알파를 살려야 그림의 구멍이 그대로 뚫린다
  const base = materialColor as unknown as ReturnType<typeof vec4>
  m.colorNode = vec4(base.rgb.mul(sum.min(vec3(1, 1, 1))), base.a)
  markSeeThrough(m, from.transparent)
  return m
}

/** 한 물체의 재질 — 재질 차례마다 따로 (BMA0가 이름으로 건다) */
function buildMaterials(d: Loaded): { materials: Material[], owned: Texture[], swaps: Map<string, Texture> } {
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
    if (name !== undefined && alphaAnimated.has(name)) {
      m.transparent = true
      m.depthWrite = false
      m.alphaTest = 0.01
      markSeeThrough(m, true)
    }
    if (d.anims.blend.includes(rom)) {
      m.transparent = true
      m.depthWrite = false
      m.alphaTest = 0.01
      markSeeThrough(m, true)
    }
    m.needsUpdate = true
    const light = d.anims.light[rom]
    if (light && light[0] !== 0 && !saturates(light)) {
      const lit = litMaterial(m, light)
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

/** 프레임 (fx32) → 그리는 정수 프레임. 끝에 닿은 애니는 마지막 프레임에 선다 */
const frameAt = (fx: number, count: number): number => Math.max(0, Math.min(count - 1, Math.floor(fx / FX)))

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

function Instance({ objKey, model, data }: { objKey: string, model: MovieModel, data: Loaded }) {
  const camera = useThree((st) => st.camera)
  const boards = useMemo(() => data.anims.billboard.map(([node, y]) => {
    const rest = restWorld(data.anims.info, node)
    return { node, y: y === 1, rest, restInv: rest.clone().invert() }
  }), [data])
  const built = useMemo(() => buildMaterials(data), [data])
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
    const shown = movieLive.movie?.shown
    if (!g) return
    const me = shown?.objects.find((o) => o.key === objKey)
    g.visible = me !== undefined
    if (!me) return
    g.position.set(me.pos[0] / FX / UNITS_PER_TILE, me.pos[1] / FX / UNITS_PER_TILE, me.pos[2] / FX / UNITS_PER_TILE)
    g.scale.set(me.scale[0] / FX, me.scale[1] / FX, me.scale[2] / FX)
    const counts = ANIM_FRAMES[model]
    const { info } = data.anims
    // 광고판은 관절을 되돌려 놓고 다시 얹는다 — 관절 애니가 없는 노드도 돈다
    for (const b of boards) { const j = joints.current.get(b.node); if (j) { j.matrixAutoUpdate = true; j.matrix.identity() } }
    for (const [slot, clip] of data.anims.clips.entries()) {
      if (clip === null) continue
      const frame = frameAt(me.frame[slot] ?? 0, counts[slot] ?? clip.frames)
      applyClip(clip, frame, info, built, joints.current, data)
    }
    for (const b of boards) {
      const j = joints.current.get(b.node)
      if (j) faceCamera(g, j, b.rest, b.restInv, b.y, camera)
    }
  })

  return (
    <group ref={root} name={objKey}>
      {[...parts].map(([node, geometry]: [number, BufferGeometry]) => (
        <group key={node} ref={(j) => { if (j) joints.current.set(node, j); else joints.current.delete(node) }}>
          <mesh geometry={geometry} material={built.materials} />
        </group>
      ))}
    </group>
  )
}

function applyClip(
  clip: PropClip, frame: number, info: Anims['info'], built: ReturnType<typeof buildMaterials>,
  joints: Map<number, Group>, data: Loaded,
): void {
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
      for (const i of submeshesOf(data.mesh, rom)) {
      const mat = mapped(built.materials[i])
      if (!mat) continue
      // 폴리곤 알파 0~31. 원작 0은 선만 그리는 자리지만 이 영상의 0은 빛무리가 스며 나오기 전이다 — 안 보이게 둔다
      mat.opacity = t.alpha(frame) / 31
      // 빛을 안 켠 재질은 확산색이 곧 정점색이다 (`diffAmb`의 15비트) — 은하의 빛깔이 흐른다
      const light = data.anims.light[rom]
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

/** 무대 — 모델을 다 받으면 차례가 선다 (`movieLive.ready`) */
export function SpearPillarMovieStage() {
  const heroine = useSaveStore((s) => s.trainer.gender === 'girl')
  const [loaded, setLoaded] = useState<ReadonlyMap<MovieModel, Loaded>>(new Map())
  const [cast, setCast] = useState<readonly (readonly [string, MovieModel])[]>([])
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    let alive = true
    const names = [...new Set([0, 1, 2].flatMap((s) => movieModels(s as 0 | 1 | 2, heroine)))]
    void Promise.all(names.map((name) =>
      Promise.all([loadDemoMesh(name), loadDemoSheet(name), loadDemoAnims(name)])
        .then(([mesh, sheet, anims]) => (anims ? [name, { mesh, sheet, anims }] as const : null))
        .catch(() => null),
    )).then((rows) => {
      if (!alive) return
      const map = new Map<MovieModel, Loaded>()
      for (const r of rows) if (r) map.set(r[0], r[1])
      setLoaded(map)
      // 못 받은 것이 있어도 연다 — 그 물체만 안 보인다
      movieLive.ready = true
    })
    return () => { alive = false }
  }, [heroine])

  // 카메라를 가져온다 — 자르는 면은 원작 값, 나갈 때 되돌린다
  useEffect(() => {
    cinematicStage.active = true
    const lens = camera as { near: number, far: number, updateProjectionMatrix?: () => void }
    const near = lens.near, far = lens.far
    return () => {
      cinematicStage.active = false
      afterimageState.on = false
      lens.near = near
      lens.far = far
      lens.updateProjectionMatrix?.()
    }
  }, [camera])

  const backdrop = useMemo(() => new MeshBasicMaterial({ color: 0x000000, fog: false, side: BackSide }), [])
  useEffect(() => () => { backdrop.dispose() }, [backdrop])

  const castKey = useRef('')
  useFrame(() => {
    const m = movieLive.movie
    afterimageState.on = m?.afterimage === true
    const key = m ? `${String(m.scene)}|${[...m.objects.entries()].map(([k, o]) => `${k}:${o.model}`).join(',')}` : ''
    if (key !== castKey.current) {
      castKey.current = key
      setCast(m ? [...m.objects.entries()].map(([k, o]) => [k, o.model] as const) : [])
    }
    const cam = m?.shown.cam
    if (!cam || cam.dist === 0) return
    const t = cam.target.map((v) => v / FX / UNITS_PER_TILE)
    const ax = (cam.angle[0] / 65536) * TAU, ay = (cam.angle[1] / 65536) * TAU
    const dist = cam.dist / FX / UNITS_PER_TILE
    // `Camera_AdjustPositionAroundTarget` — y는 −각 x의 사인
    cinematicStage.target.set(CINEMATIC_ORIGIN.x + t[0]!, CINEMATIC_ORIGIN.y + t[1]!, CINEMATIC_ORIGIN.z + t[2]!)
    cinematicStage.position.set(
      cinematicStage.target.x + dist * Math.sin(ay) * Math.cos(ax),
      cinematicStage.target.y + dist * Math.sin(-ax),
      cinematicStage.target.z + dist * Math.cos(ay) * Math.cos(ax),
    )
    cinematicStage.fov = (2 * cam.fov * 360) / 65536
    const lens = camera as { near: number, far: number, updateProjectionMatrix?: () => void }
    const near = cam.near / FX / UNITS_PER_TILE, far = cam.far / FX / UNITS_PER_TILE
    if (lens.near !== near || lens.far !== far) {
      lens.near = near
      lens.far = far
      lens.updateProjectionMatrix?.()
    }
  })

  return (
    <group name="창기둥 영상" position={CINEMATIC_ORIGIN}>
      {/* 바탕 — 지우는 색(검정) */}
      <mesh material={backdrop}>
        <sphereGeometry args={[55, 16, 12]} />
      </mesh>
      {cast.map(([key, model]) => {
        const data = loaded.get(model)
        return data ? <Instance key={`${key}:${model}`} objKey={key} model={model} data={data} /> : null
      })}
    </group>
  )
}
