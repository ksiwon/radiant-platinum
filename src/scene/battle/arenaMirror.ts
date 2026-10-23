// 무대 거울 바닥 — 바닥에 몸 · 무대가 비친다 (REPAIR §174)
//
// 원작 무대 바닥 33재질이 `_ENVIRONMENTMAPENABLE_MIRRORMAP`을 켠다 — 체육관 · 사천왕 방 · 챔피언 방 · 몇 야외 바닥이다(`MIRROR_FLOORS`).
// `_MirrorMap`은 그림이 아니라 **실행 때 거울 카메라가 그리는 판**이고, 재질 값은 다 같다: `_Reflectivity` 0.5 · `_FresnelPower` 1
// (UnityPy로 g027 · g038 · g042를 읽었다). 원작 셰이더(`Delphis/Map/Standard`)는 Switch 바이너리라 섞는 식을 못 읽는다 —
// 우리 식은 `lerp(바닥, 비친 것, 0.5 × 프레넬)`이다. 프레넬은 `1 − |n·v|`의 1제곱이라 낮게 볼수록 더 비친다.
//
// 비친 것은 three의 `reflector`(평면 거울 · 반 해상도)가 그린다. 무대 파일은 캐시에 남아 배틀마다 재질을 나눠 쓰므로(`arenaCascade`의
// `swapped`) 거울도 재질마다 하나이고, **배틀마다 그 거울의 자리(`target`)를 이번 무대에 다시 단다**
import { Mesh, Box3, MeshStandardMaterial, type Material, type Object3D, type Texture } from 'three'
import { MeshStandardNodeMaterial, type Node } from 'three/webgpu'
import {
  float, materialReference, mix, normalView, positionViewDirection, reflector, texture, uv, vec4,
} from 'three/tsl'

/** 거울 바닥 재질 — 무대 30벌 조사(`.audit/arena-mats-20261018/survey.json`의 `mirror`) */
export const MIRROR_FLOORS: ReadonlySet<string> = new Set([
  'M_B_010_Ground_18', 'M_B_011_Ground_07', 'M_B_011_Ground_06', 'M_B_011_Ground_17', 'M_B_016_Floor_07', 'M_B_018_Floor_21',
  'M_B_020_Ground_54', 'M_B_020_Ground_55', 'M_B_020_Ground_53', 'M_B_020_Ground_06', 'M_CB_024_Floor_01', 'M_CB_024_Floor_06',
  'M_CB_026_Mark_01', 'M_CB_026_Floor_01', 'M_CB_026_Floor_06', 'M_CB_027_Floor_01', 'M_CB_027_Floor_06', 'M_CB_028_Floor_01',
  'M_CB_028_Mark_03', 'M_B_029_Floor_19', 'M_B_029_Floor_20', 'M_CB_029_Floor_01', 'M_CB_030_Floor_01', 'M_CB_030_Floor_06',
  'M_CB_031_Floor_06', 'M_CB_031_Floor_01', 'M_CB_031_Mark_03', 'M_B_038_Floor_23', 'M_CB_039_Floor_23', 'M_CB_040_Floor_23',
  'M_CB_041_Floor_23', 'M_B_042_Floor_12', 'M_B_042_Floor_06',
])

/** `_Reflectivity` (원작 값 · 33재질 다 같다) */
const REFLECTIVITY = 0.5
/** 거울 판 해상도 — 화면의 반 */
const RESOLUTION = 0.5

type Reflector = ReturnType<typeof reflector>

interface Mirrored { material: MeshStandardNodeMaterial, mirror: Reflector, y: number }

/** 굽은 재질 → 거울 재질 · 거울 (무대 파일이 캐시에 남는 동안 같이 남는다) */
const made = new WeakMap<Material, Mirrored>()

/** 이 재질이 거울 바닥인가. 이름은 굽은 그대로다 — 섞기 재질(`cascadeMaterial`)도 이름을 물려받는다 */
export function isMirrorFloor(m: Material): boolean {
  return MIRROR_FLOORS.has(m.name)
}

function mirrored(was: MeshStandardMaterial | MeshStandardNodeMaterial, y: number): Mirrored {
  const mirror = reflector({ resolutionScale: RESOLUTION })
  // 거울 판은 위를 본다 — `target`의 +Z가 거울의 앞이다
  mirror.target.rotateX(-Math.PI / 2)
  let m: MeshStandardNodeMaterial
  let base: Node<'vec4'>
  if (was instanceof MeshStandardNodeMaterial && was.colorNode) {
    m = was
    base = was.colorNode as Node<'vec4'>
  } else {
    m = new MeshStandardNodeMaterial()
    m.name = was.name
    m.map = was.map
    m.color.copy(was.color)
    m.opacity = was.opacity
    m.transparent = was.transparent
    m.alphaTest = was.alphaTest
    m.depthWrite = was.depthWrite
    m.side = was.side
    m.blending = was.blending
    m.roughness = was.roughness
    m.metalness = was.metalness
    m.userData = was.userData
    const tint = vec4(
      materialReference('color', 'color') as unknown as Node<'vec3'>, materialReference('opacity', 'float') as unknown as Node<'float'>,
    )
    base = (was.map ? texture(was.map as Texture, uv()).mul(tint) : tint) as Node<'vec4'>
  }
  const fresnel = float(1).sub(normalView.dot(positionViewDirection).abs())
  const k = fresnel.mul(REFLECTIVITY)
  m.colorNode = mix(base, vec4(mirror.rgb, base.a), k)
  m.needsUpdate = true
  return { material: m, mirror, y }
}

/**
 * 무대의 거울 바닥을 켠다. 바닥 높이는 그 메시의 월드 상자 위다 — 무대 바닥은 평평하다.
 * `liveArenaMaterials` **뒤에** 부른다 — 섞기 재질이면 그 색 위에 거울을 섞는다
 */
export function liveMirrors(root: Object3D): number {
  root.updateMatrixWorld(true)
  const box = new Box3()
  let count = 0
  const placed = new Set<Reflector>()
  root.traverse((o) => {
    if (!(o instanceof Mesh) || Array.isArray(o.material)) return
    const was = o.material as Material
    if (!isMirrorFloor(was)) return
    if (!(was instanceof MeshStandardMaterial) && !(was instanceof MeshStandardNodeMaterial)) return
    let hit = made.get(was)
    if (hit === undefined) {
      box.setFromObject(o)
      hit = mirrored(was, box.max.y)
      made.set(was, hit)
      made.set(hit.material, hit)
    }
    o.material = hit.material
    // 이번 무대에 거울 자리를 단다 — 지난 배틀의 무대에 달려 있었으면 옮겨 온다
    if (!placed.has(hit.mirror)) {
      hit.mirror.target.position.set(0, hit.y, 0)
      root.add(hit.mirror.target)
      placed.add(hit.mirror)
    }
    count++
  })
  return count
}
