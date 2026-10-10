// 부화 무대의 알 — BDSP 알 모델(`data/fx/model/ew121_egg00.glb`)과 그 위의 얼룩.
//
// 모델은 모양뿐이다. 굽는 쪽(`import/bdsp/fx.ts`의 `exportArena`)이 내보낸 GLB에는 **그림이 없고** 재질이 흰 껍데기 하나다
// (`cmn_locator-dummy_shader` · 위치 · 법선 · UV 689점). 그래서 색은 여기서 정점에 칠한다 — 바탕은 크림, 그 위에 옅은 얼룩 다섯.
// 3D 재질이라 UI 토큰 대상이 아니다.
//
// ⚠️ **껍질 후보 `ew135_egg01_all` · `egg02_ue` · `egg03_sita`는 안 썼다.** `ew135`는 기술 번호 135(알 낳기)의 효과 모델이고
// 이름은 알 전체 · 위쪽 · 아래쪽이다. 부화는 반으로 갈라지는 알이 아니라 **조각이 튀며 터지는** 알이고, 조각은 롬 이미터
// (`egg_demo_particle`)와 BDSP `sd9120_egg_piece01~04`가 맡는다. 번들 안을 열어 보지는 않았고(raw는 Unity 번들이다) 쓰임을
// 이름으로 판단했다. 굽는 쪽을 늘리지 않았다.
import { BufferAttribute, Color, type BufferGeometry, type Mesh } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { assets, onProviderSwap } from '../data/providers/assetProvider'
import { fxIndex } from './battle/fx/moveSeq'

/** 알 모델 키(0.79 높이)를 무대의 크기로 키우는 배율 — 예전 도형 알(높이 1.77)과 같은 키다 */
export const EGG_SCALE = 2.2

/** 바탕 크림색. 예전 도형 알(`#fff8dc`)과 같다 */
const BASE = '#fff8dc'
const BLUE = '#80b4d8'
const ROSE = '#e7a6b7'

/** 얼룩 하나 — 알 가운데에서 본 방향과 각 반지름(라디안) */
interface Spot {
  readonly dir: readonly [number, number, number]
  readonly radius: number
  readonly color: string
}

/**
 * 얼룩 다섯. 카메라가 +Z에서 보므로 앞쪽(+z)에 몰아 둔다. 방향은 알 가운데 기준이다
 * (예전 도형 알의 얼룩 자리를 그대로 옮겼다)
 */
export const EGG_SPOTS: readonly Spot[] = [
  { dir: [-0.38, -0.7, 0.68], radius: 0.34, color: BLUE },
  { dir: [0.41, -0.56, 0.63], radius: 0.3, color: ROSE },
  { dir: [-0.22, -0.16, 0.58], radius: 0.28, color: BLUE },
  { dir: [0.32, -0.02, 0.5], radius: 0.3, color: ROSE },
  { dir: [0.02, -1, 0.75], radius: 0.36, color: BLUE },
]

function norm(v: readonly [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}

/** `a`에서 `b`로 부드럽게 (smoothstep) — `b`가 `a`보다 작으면 거꾸로 선다 */
function ease(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * 정점마다 색을 칠한다 — 바탕 크림에 얼룩이 가장자리부터 옅어진다.
 *
 * 순수 함수다(시험이 본다): 돌려주는 것은 정점마다 `[r, g, b]`를 이은 배열이다. 정점 수 × 3개다
 */
export function eggColors(
  positions: ArrayLike<number>,
  center: readonly [number, number, number],
): Float32Array {
  const count = Math.floor(positions.length / 3)
  const out = new Float32Array(count * 3)
  const base = new Color(BASE)
  const spots = EGG_SPOTS.map((s) => ({ dir: norm(s.dir), radius: s.radius, color: new Color(s.color) }))
  const mix = new Color()
  for (let i = 0; i < count; i++) {
    const d = norm([
      (positions[i * 3] ?? 0) - center[0],
      (positions[i * 3 + 1] ?? 0) - center[1],
      (positions[i * 3 + 2] ?? 0) - center[2],
    ])
    mix.copy(base)
    for (const spot of spots) {
      const dot = Math.min(1, Math.max(-1, d[0] * spot.dir[0] + d[1] * spot.dir[1] + d[2] * spot.dir[2]))
      const angle = Math.acos(dot)
      // 가운데는 얼룩색 그대로, 반지름 끝에서 바탕으로 풀린다
      const t = 1 - ease(spot.radius * 0.55, spot.radius, angle)
      if (t > 0) mix.lerp(spot.color, t * 0.85)
    }
    out[i * 3] = mix.r
    out[i * 3 + 1] = mix.g
    out[i * 3 + 2] = mix.b
  }
  return out
}

/** 불러온 모델 — 첫 메시의 형상 하나. 없으면 `null`이라 부르는 쪽이 도형 알로 떨어진다 */
export interface EggModel {
  geometry: BufferGeometry
  /** 바닥(최저점)이 y=0이 되게 올리는 값 (모델 단위) */
  lift: number
}

let cached: Promise<EggModel | null> | null = null

onProviderSwap(() => {
  void cached?.then((m) => { m?.geometry.dispose() })
  cached = null
})

/** 알 모델을 받는다. 묶음을 안 깔았거나 옛 판이면 `null` */
export function loadEggModel(): Promise<EggModel | null> {
  cached ??= (async () => {
    // `index.json`의 `eggModel` (`import/bdsp/fx.ts`가 적는다) — `FxIndex`의 타입에는 아직 없다
    const path = ((await fxIndex()) as { eggModel?: string } | null)?.eggModel
    if (path === undefined) return null
    const file = `data/fx/${path}`
    const provider = assets()
    if (!(await provider.exists(file))) return null
    const url = await provider.objectUrl(file)
    try {
      const gltf = await new GLTFLoader().loadAsync(url)
      let mesh: Mesh | null = null
      gltf.scene.traverse((o) => {
        if (mesh === null && (o as Mesh).isMesh) mesh = o as Mesh
      })
      const found = mesh as Mesh | null
      if (found === null) return null
      const geometry = found.geometry.clone()
      geometry.computeBoundingBox()
      const box = geometry.boundingBox!
      const center: [number, number, number] = [
        (box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2,
      ]
      const position = geometry.getAttribute('position')
      geometry.setAttribute('color', new BufferAttribute(eggColors(position.array, center), 3))
      return { geometry, lift: -box.min.y }
    } finally {
      provider.releaseObjectUrl(file)
    }
  })().catch(() => null)
  return cached
}
