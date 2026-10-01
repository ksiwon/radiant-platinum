// 야외를 **BDSP 지역**으로 세운다 (docs/orders/VISUAL_20260929.md §2)
//
// 원작 야외는 저폴리 지형에 64px 안팎의 그림이라 가까이서 보면 벽 · 나무 · 언덕이 미완성으로 읽힌다(배포판에서 짚였다). BDSP는
// 같은 신오를 입체로 다시 지었다 — `Environments/fields`의 지역 13벌 + 대습지(`models/field/*.glb` · `import/bdsp/field.ts`).
//
// ⚠️ **좌표를 옮기지 않는다.** BDSP 야외는 원작 월드 좌표 그대로다(x만 뒤집혀 있고 변환기가 되돌린다) — 떡잎마을 집이 같은 칸에
// 서고 땅 높이도 같다(`field.ts` 머리말). 충돌 · 높이 · 워프 · 사람은 원작 자료가 그대로 쥔다 — 이 층은 그림만이다.
//
// ⚠️ **지역 통째로 받는다.** 한 지역이 260칸 사방이라 청크처럼 쪼개지 않는다. 플레이어 둘레(`reachFor`)에 상자가 걸리는 지역만 세운다
//
// ⚠️ **떼어도 곧바로 버리지 않는다** (`held`). 집에 들어가면 지역이 다 떨어지는데, 버리면 나올 때마다 20~36MB짜리 지역 glb를
// 처음부터 다시 받고 풀었다 — 덮개가 걷힌 뒤 마을이 몇 초 비었다. 뗀 지역은 `HELD`벌까지 쥐었다가 다시 붙이고, 밀려날 때만
// 버린다(`disposeTree` — 40b5d6b의 규칙: 쥐고 있는 것은 이 `HELD`벌로 묶인다)
import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { AdditiveBlending, Mesh, Vector3, type Group, type Material, type Object3D } from 'three'
import { MeshStandardNodeMaterial, type Node } from 'three/webgpu'
import {
  cameraPosition, color, cos, dot, float, mix, normalize, positionWorld, pow, saturate, time,
  transformNormalToView, vec3,
} from 'three/tsl'
import { assets } from '../data/providers/assetProvider'
import { worldState } from '../state/worldState'
import { fieldFade, type FieldFade } from './fieldFade'
import { bdspLights, type BdspLights } from './bdspLights'
import { disposeTree } from './disposeTree'
import { useBdspMark } from './bdspReady'
import { holdBdspDoors } from './DoorAnimations'
import { holdBdspSigns } from './ObjectProps'
import { DAY } from './fx/sky'

const loader = new GLTFLoader()

/**
 * 지역을 세우는 거리(칸) — **안개가 다 덮는 거리**에 카메라 몫을 더한 것이다.
 *
 * ⚠️ **안개보다 가까이서 세우면 뿅 하고 튀어나온다.** 한동안 80칸이었는데 낮 안개(38~130칸)가 80칸에서 46%, 밤(26~100칸)이
 * 73%만 덮어서, 지역 경계 쪽으로 걸으면 산 · 숲이 반쯤 보이는 자리에서 한 프레임에 생겨났다. 안개 끝(`fog.far` — 시간대 ×
 * 날씨 배율 · `MapStreamer`)에서 세우면 생기는 순간이 안개 속이다. 3인칭 카메라가 주인공 뒤 9칸 남짓이라 그만큼 더 본다(`CAMERA_SLACK`).
 *
 * 실측 (바깥 워프 · 사람 1,477자리 · 지역 상자까지 곧은 거리): 80칸이면 평균 3.15지역(최대 6 · glb 합 평균 87MB),
 * 140칸이면 평균 4.95지역(최대 8 · 평균 136MB 최대 228MB)이다
 */
export function reachFor(fogFar: number): number {
  return Math.min(fogFar, DAY.fogFar) + CAMERA_SLACK
}
/** 3인칭 카메라가 주인공보다 앞서 보는 몫 (칸) */
const CAMERA_SLACK = 10
/** 이미 선 지역은 이만큼 더 멀어져야 뗀다 — 경계에서 반 초마다 붙였다 뗐다 하지 않게 */
const KEEP_SLACK = 16

interface FieldEntry { name: string, box: readonly [number, number, number, number] }

let index: Promise<readonly FieldEntry[]> | null = null
/** 구워 둔 지역들 (`models/field/index.json`). 없는 설치본이면 빈 목록 — 그때는 원작 그림 그대로다 */
function fieldIndex(): Promise<readonly FieldEntry[]> {
  index ??= assets().text('models/field/index.json')
    // ⚠️ **대습지(`safari`)는 안 세운다** — 상자가 (22~104, 24~128)라 바깥 좌표가 아니다(제 행렬의 좌표로 보인다). 짝을 재기 전까지 뺀다
    .then((t) => ((JSON.parse(t) as { fields?: FieldEntry[] }).fields ?? []).filter((f) => /^area\d+$/.test(f.name)))
    .catch(() => [])
  return index
}

/** 이 자리(칸)에서 지역 상자까지 곧은 거리 — 상자 안이면 0 */
export function boxDistance(box: FieldEntry['box'], x: number, z: number): number {
  return Math.hypot(Math.max(box[0] - x, 0, x - box[2]), Math.max(box[1] - z, 0, z - box[3]))
}

/** 지금 세울 지역 이름들 — 새로 세우는 것은 `reach` 안, 이미 선 것(`was`)은 `reach + KEEP_SLACK` 안 */
export function pickFields(
  fields: readonly FieldEntry[], x: number, z: number, reach: number, was: readonly string[],
): string[] {
  return fields
    .filter((f) => boxDistance(f.box, x, z) <= (was.includes(f.name) ? reach + KEEP_SLACK : reach))
    .map((f) => f.name).sort()
}

/**
 * 지금 세울 지역 이름들 — 바깥(행렬 0)에서 플레이어 둘레에 걸리는 것. 반 초마다 다시 본다(걷는 동안 지역 경계를 넘는다)
 */
export function useBdspFields(outdoor: boolean): { fields: readonly FieldEntry[], near: readonly string[] } {
  const [fields, setFields] = useState<readonly FieldEntry[]>([])
  const [near, setNear] = useState<readonly string[]>([])
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    let alive = true
    void fieldIndex().then((f) => { if (alive) setFields(f) })
    return () => { alive = false }
  }, [])
  useEffect(() => {
    if (!outdoor || fields.length === 0) { setNear([]); return }
    const pick = (): void => {
      const p = worldState.player.position
      // 안개는 `MapStreamer`가 시간대 · 날씨로 매 프레임 맞춘다 — 그 값을 그대로 읽는다. 아직 없으면 낮 안개
      const fog = scene.fog as { far?: number } | null
      const reach = reachFor(fog?.far ?? DAY.fogFar)
      setNear((was) => {
        const want = pickFields(fields, p.x, p.z, reach, was)
        return was.join() === want.join() ? was : want
      })
    }
    pick()
    const id = setInterval(pick, 500)
    return () => { clearInterval(id) }
  }, [outdoor, fields, scene])
  return { fields, near }
}

/** 창빛 · 조명 줄기 — 더해지는 빛으로 (`BdspRoom`과 같은 사정) */
const isLightShaft = (m: Material): boolean => /_(Window)?Light_\d/.test(m.name)

// ── 물 ───────────────────────────────────────────────────────────────────────────────────────────────────
//
// BDSP 물 셰이더는 `_WaterColor`(물 빛) · `_SkyColor`(비친 하늘) · `_FresnelPower`로 그린다. 변환기(`import/bdsp/arena.ts`)는
// `_Color`만 실어서 물이 반사도 움직임도 없는 무광 판(roughness 0.9)이 됐고, 도로의 강(`R_2xx_Water_01`)은 `_Color`가 흰색이라
// 하얀 판, 용암은 `_Color`가 물과 같아 파란 판이었다. 1인칭 물가에서 「파란 장판」으로 읽혔다(`Water`의 머리말이 피하려던 그림).
//
// 그래서 물 재질만 이름으로 골라 갈아 끼운다: 빛깔은 아래 표(원작 재질 값), 결은 매끈하게(`WATER_ROUGHNESS`), 물결은 셰이더 시계로
// 노멀만 흔든다. **발광은 되살리지 않는다** — 물의 `_EmissionColor` 흰색 × 4.8은 반사에 쓰는 값이라 켜면 하얗게 탄다(`arena.ts`).
//
// 값의 출처: `raw/AssetAssistant/Environments/{fields,prefab_map}`의 재질을 UnityPy로 읽었다. 같은 이름은 어느 번들에서나 값이 같다
// (물 13종 · 번들 1~26개씩 · 갈래 1)

interface WaterLook {
  /** `_WaterColor` (선형) */
  water: readonly [number, number, number]
  /** `_SkyColor` (선형) */
  sky: readonly [number, number, number]
  /** `_FresnelPower` — 클수록 비스듬히 볼 때만 하늘이 비친다 */
  fresnel: number
  /** `_TimeScale` — 물결이 흐르는 빠르기와 방향. 없으면 1 */
  pace: number
}

const RIVER: WaterLook = { water: [0, 0.427, 1], sky: [0.269, 0.719, 1], fresnel: 3.5, pace: 0.5 }

/** 물 재질 이름 → 원작 값 */
export const WATER_LOOKS: Readonly<Record<string, WaterLook>> = {
  M_C_001_Water_03: { water: [0.228, 0.368, 0.65], sky: [0.41, 0.802, 1], fresnel: 3.5, pace: 1 },
  M_C_001_SeaWater_01: { water: [0, 0.281, 0.736], sky: [0.099, 0.718, 1], fresnel: 6, pace: 1 },
  M_C_001_SeaWater_03: { water: [0.012, 0.205, 0.62], sky: [0.099, 0.718, 1], fresnel: 3, pace: 0.5 },
  M_C_001_LakeWater_01: { water: [0.064, 0.175, 0.32], sky: [0.759, 0.925, 1], fresnel: 1, pace: 1.25 },
  M_C_001_Lava_01: { water: [1, 0.647, 0], sky: [0.406, 0.148, 0.094], fresnel: 7, pace: 1 },
  M_D_060_Water_01: { water: [0.149, 0.411, 0.736], sky: [0.133, 0.157, 0.274], fresnel: 1.2, pace: 1 },
  M_R_205_Water_01: RIVER,
  M_R_206_Water_01: RIVER,
  M_R_208_Water_01: RIVER,
  M_R_209_Water_01: RIVER,
  M_R_210_Water_01: RIVER,
  M_R_211a_Water_01: { ...RIVER, water: [0.157, 0.395, 1] },
  M_R_212_Water_01: { ...RIVER, pace: -0.75 },
}

/** 물의 결. 원작 셰이더는 반사 지도로 반짝이는데 우리에게는 그 지도가 없다 — 해 반사만 남도록 매끈하게 */
export const WATER_ROUGHNESS = 0.15
/** 물의 금속성 — 조금만. 올리면 비칠 환경이 없어 물이 검어진다 */
export const WATER_METALNESS = 0.08

/**
 * 물결 셋 — `[방향(라디안), 파장(칸), 기울기, 초당 마루 수]`. 앞의 둘은 원작 그림 경로의 물(`Water`의 `WAVES` — 진폭 0.055 ·
 * 0.032칸)과 같은 결이고(기울기 = 진폭 × 2π / 파장), 셋째는 해가 잘게 부서지도록 더한 잔물결이다
 */
const RIPPLES: readonly (readonly [number, number, number, number])[] = [
  [0.0, 5.5, 0.063, 0.42],
  [2.1, 2.9, 0.069, 0.63],
  [4.0, 1.1, 0.05, 0.9],
]

/** 이 재질을 물로 다시 그릴 값. 물이 아니면 `null` */
export function waterLookOf(m: Material): WaterLook | null {
  return WATER_LOOKS[m.name] ?? null
}

/** 물 재질 하나 — 원작 빛깔에 하늘 반사와 흐르는 물결 */
export function waterMaterial(was: Material, look: WaterLook): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial()
  m.name = was.name
  m.side = was.side
  m.roughness = WATER_ROUGHNESS
  m.metalness = WATER_METALNESS
  const p = positionWorld.xz
  let dx: Node<'float'> = float(0)
  let dz: Node<'float'> = float(0)
  for (const [dir, length, slope, crests] of RIPPLES) {
    const ax = Math.cos(dir), az = Math.sin(dir)
    const k = (2 * Math.PI) / length
    const phase = p.x.mul(ax * k).add(p.y.mul(az * k)).sub(time.mul(2 * Math.PI * crests * look.pace))
    const c = cos(phase).mul(slope)
    dx = dx.add(c.mul(ax))
    dz = dz.add(c.mul(az))
  }
  const normal = normalize(vec3(dx.negate(), 1, dz.negate()))
  m.normalNode = transformNormalToView(normal)
  const view = normalize(cameraPosition.sub(positionWorld))
  const glance = pow(float(1).sub(saturate(dot(normal, view))), look.fresnel)
  m.colorNode = mix(color(...look.water), color(...look.sky), glance)
  return m
}

/**
 * `root` 아래 물 재질을 갈아 끼운다. 같은 재질을 나눠 쓰는 메시는 새 재질도 나눠 쓴다. 버린 재질은 놓는다.
 * 갈아 끼운 수를 돌려준다
 */
export function liveWater(root: Object3D): number {
  const swapped = new Map<Material, MeshStandardNodeMaterial>()
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    const list = (Array.isArray(o.material) ? o.material : [o.material]) as Material[]
    if (!list.some((x) => waterLookOf(x) !== null)) return
    const next = list.map((x) => {
      const look = waterLookOf(x)
      if (!look) return x
      let n = swapped.get(x)
      if (!n) { n = waterMaterial(x, look); swapped.set(x, n) }
      return n
    })
    o.material = Array.isArray(o.material) ? next : next[0]!
  })
  for (const old of swapped.keys()) old.dispose()
  return swapped.size
}

/** 주인공의 어느 높이를 겨누는가 — `PropFade`의 `AIM_HEIGHT`와 같다 */
const AIM = 1.2

/** 지역 하나가 세운 것들 — 떼었다 다시 붙일 때 그대로 되쓴다 */
interface Built {
  scene: Group
  fade: FieldFade
  lights: BdspLights
}

/** 뗀 지역을 이만큼(벌) 쥐고 있는다 — 집 한 채 드나드는 사이 둘레 지역(대개 1~2벌)이 남는다 */
export const HELD = 2
/** 쥐고 있는 지역 — 앞이 오래된 것 */
const held = new Map<string, Built>()

/** 뗀 지역을 쥔다. `HELD`벌이 넘으면 가장 오래된 것을 버린다 */
export function holdField(name: string, built: Built, drop: (b: Built) => void = dropBuilt): void {
  held.delete(name)
  held.set(name, built)
  while (held.size > HELD) {
    const [oldest, b] = held.entries().next().value as [string, Built]
    held.delete(oldest)
    drop(b)
  }
}

/** 쥐고 있던 지역을 꺼낸다 — 없으면 `null` */
export function takeField(name: string): Built | null {
  const b = held.get(name) ?? null
  held.delete(name)
  return b
}

/** 쥐고 있는 지역 이름들 — 오래된 것부터 */
export function heldFields(): string[] {
  return [...held.keys()]
}

function dropBuilt(b: Built): void { disposeTree(b.scene) }

function build(scene: Group): Built {
  scene.traverse((o) => {
    if (!(o instanceof Mesh)) return
    o.receiveShadow = true
    o.castShadow = true
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of mats) {
      if (!isLightShaft(m)) continue
      m.blending = AdditiveBlending
      m.transparent = true
      m.depthWrite = false
      m.opacity = 0.35
      o.castShadow = false
    }
  })
  liveWater(scene)
  // ⚠️ **흐림이 먼저다.** `fieldFade`가 건물 재질을 복제해 갈아 끼우므로, 빛을 먼저 펴면 발광을 맞추는 쪽이 버려진 재질을 쥔다
  const fade = fieldFade(scene)
  const lights = bdspLights(scene)
  return { scene, fade, lights }
}

function FieldArea({ name }: { name: string }) {
  const [built, setBuilt] = useState<Built | null>(null)
  const [failed, setFailed] = useState(false)
  const tick = useRef(0)
  const cam = useRef(new Vector3())
  const aim = useRef(new Vector3())
  useBdspMark(name, built !== null, failed)
  useFrame(({ camera }, dt) => {
    const b = built
    if (!b) return
    // 목표는 세 프레임에 한 번 — 인스턴스가 지역 하나에 수천이다. 따라가기는 매 프레임이다 (`fieldFade`)
    if ((tick.current++ % 3) === 0) {
      b.lights.update(worldState.time.gameHour)
      const p = worldState.player.position
      camera.getWorldPosition(cam.current)
      aim.current.set(p.x, p.y + AIM, p.z)
      b.fade.aim(cam.current, aim.current, worldState.camera.mode !== 'first')
    }
    b.fade.step(dt)
  })
  useEffect(() => {
    let alive = true
    let mine: Built | null = takeField(name)
    let release: (() => void)[] = []
    const attach = (b: Built): void => {
      b.lights.update(worldState.time.gameHour)
      release = [holdBdspDoors(b.scene), holdBdspSigns(b.scene)]
      setBuilt(b)
    }
    if (mine) attach(mine)
    else {
      const path = `models/field/${name}.glb`
      const provider = assets()
      provider.objectUrl(path)
        .then((url) => loader.loadAsync(url).finally(() => { provider.releaseObjectUrl(path) }))
        .then((gltf) => {
          if (!alive) { disposeTree(gltf.scene); return }
          mine = build(gltf.scene)
          attach(mine)
        })
        .catch((e: unknown) => {
          console.error(`지역 ${name}을 못 세웠다`, e)
          if (alive) setFailed(true)
        })
    }
    // ⚠️ **떼면 쥔다** (`holdField`) — 버리는 것은 쥔 벌에서 밀려날 때다
    return () => {
      alive = false
      for (const r of release) r()
      if (mine) holdField(name, mine)
    }
  }, [name])
  return built ? <primitive object={built.scene} /> : null
}

/** 걷는 동안 지역이 바뀌면 그 자리에서 갈아 끼운다 — 목록이 곧 세울 것이다 (`useBdspFields`) */
export function BdspField({ near }: { near: readonly string[] }) {
  return <>{near.map((n) => <FieldArea key={n} name={n} />)}</>
}
