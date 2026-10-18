// 무대 재질 셋을 편다 — 그림 셋 섞기 · 발광 세기 · 배틀 종류별 물체 (DEFECTS_20261017 §4 · REPAIR §162)
//
// 굽는 쪽(`tools/extract/bdspArena.py` · `import/bdsp/arena.ts`의 `arena` 옵션)이 glb에 실은 값을 읽는다:
//
//   재질 `userData.cascade`  { color, layer, layerUv, layerMap }  → `cascadeMaterial`
//                            바탕 = `map`(첫 UV) · 층 = `emissiveMap`(첫 UV × `layerUv`) · 마스크 = `aoMap`(둘째 UV)의 R
//   재질 `userData.glow`     발광 세기 (`_EmissionColorIntensity`)       → `emissiveIntensity`
//   노드 `userData.listedIn` 그 물체를 적은 배틀 종류 목록들             → `battleHides`
//
// ⚠️ **섞는 식은 우리 식이다.** 원작 `Delphis/Map/Standard`(`_CASCADE_BLENDUV0`)는 Switch 바이너리 셰이더라 식을 못 읽는다.
// `lerp(바탕 × _Color × _ColorIntensity, 층 × _LayerColor × _LayerColorIntensity, 마스크 R)` — 충호 방 바닥(`cascadeMix`)과
// 나무열매 잎(정점 알파로 섞는다)이 이 식으로 원작과 맞았다. 무대 30벌 바닥의 정점 알파는 전부 255라 곱해도 안 바뀐다(실측)
import { Mesh, type Material, type MeshStandardMaterial, type Object3D, type Texture } from 'three'
import { MeshStandardNodeMaterial, type Node } from 'three/webgpu'
import { materialReference, mix, texture, uv, vec2, vec4 } from 'three/tsl'

/** 굽는 쪽이 실은 섞기 값 — `import/bdsp/arena.ts`의 `cascadeExtras` */
interface Cascade {
  color: readonly number[]
  layer: readonly number[]
  layerUv: readonly number[]
  layerMap: boolean
}

/** 이 재질이 그림 셋을 섞는가 */
export function cascadeOf(m: Material): Cascade | null {
  const c = (m.userData as { cascade?: Cascade }).cascade
  return c && Array.isArray(c.color) && Array.isArray(c.layer) && Array.isArray(c.layerUv) ? c : null
}

const rgba = (c: readonly number[]): Node<'vec4'> => vec4(c[0] ?? 1, c[1] ?? 1, c[2] ?? 1, 1)

/**
 * 섞기 재질 하나. 바탕 · 층 · 마스크를 셰이더 안에서 섞고 재질 색(`color` · `opacity`)을 곱한다 — 시간대 물들임과 시퀀스 배경
 * 물들임(`Arena`)이 `color`를 바꾸므로 셰이더가 그 값을 바로 읽는다(`materialReference`).
 *
 * 그림이 하나라도 없으면 `null` — 굽는 쪽이 칸을 비웠다는 뜻이라 예전처럼 바탕 그림만 둔다
 */
export function cascadeMaterial(was: MeshStandardMaterial): MeshStandardNodeMaterial | null {
  const c = cascadeOf(was)
  const main = was.map
  const mask = was.aoMap
  const layer = c?.layerMap ? was.emissiveMap : null
  if (!c || !main || !mask || (c.layerMap && !layer)) return null
  const m = new MeshStandardNodeMaterial()
  m.name = was.name
  m.map = main
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
  const [a = 1, b = 1, o = 0, p = 0] = c.layerUv
  const base = texture(main, uv()).mul(rgba(c.color))
  const top = layer
    ? texture(layer as Texture, uv().mul(vec2(a, b)).add(vec2(o, p))).mul(rgba(c.layer))
    : rgba(c.layer)
  // 마스크는 둘째 UV로 읽는다 — 굽는 쪽이 재질이 고른 UV(`_BlendUVIndex`)를 `TEXCOORD_1`에 실었다
  const r = texture(mask, uv(1)).r
  m.colorNode = mix(base, top, r).mul(vec4(
    materialReference('color', 'color') as unknown as Node<'vec3'>, materialReference('opacity', 'float') as unknown as Node<'float'>,
  ))
  return m
}

/**
 * 굽은 재질 → 편 재질. 무대 파일(`useLoader`)이 캐시에 남는 동안 그 재질도 남으므로 배틀마다 새로 짓지 않는다 —
 * 같은 무대에 두 번째 들어설 때 셰이더 노드를 다시 엮지 않는다
 */
const swapped = new WeakMap<Material, Material>()

/** 무대 재질을 편다 — 섞기 재질은 갈아 끼우고, 발광 재질은 세기를 건다. 같은 재질을 나눠 쓰는 메시는 새 재질도 나눠 쓴다 */
export function liveArenaMaterials(root: Object3D): void {
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    const was = o.material as Material
    let next = swapped.get(was)
    if (next === undefined) {
      next = cascadeOf(was) ? (cascadeMaterial(was as MeshStandardMaterial) ?? was) : was
      // 발광 세기 — glTF `emissiveFactor`는 0~1이라 굽는 쪽이 `extras.glow`에 실었다 (들판 체육관 천장 링 5)
      const glow = (next.userData as { glow?: unknown }).glow
      if (typeof glow === 'number' && glow > 0 && 'emissiveIntensity' in next) (next as MeshStandardMaterial).emissiveIntensity = glow
      swapped.set(was, next)
    }
    o.material = next
  })
}

/** 배틀 종류 — 무대 물체 목록(`listedIn`)이 이 이름을 쓴다. 굽는 쪽 `HIDE_LISTS`와 같다 */
export type BattleShape = 'single' | 'double' | 'tag'

/** 편(동료 트레이너)이 서면 태그 배틀, 둘씩 나오면 더블, 아니면 싱글 */
export function battleShape(doubles: boolean, partner: boolean): BattleShape {
  return partner ? 'tag' : doubles ? 'double' : 'single'
}

/**
 * 배틀 종류별 물체를 가른다 (`G027`의 `_singleBattleHideObjects` · `_doubleBattleHideObjects` · `_tagBattleHideObject`) —
 * **목록에 적힌 배틀에서만 보인다.**
 *
 * ⚠️ **칸 이름과 거꾸로 읽는다(추측).** 원작 스크립트는 Switch 바이너리라 못 읽고, 남은 근거는 물체 모양이다. 물 체육관 바닥 덮개
 * 여섯 장의 짙은 자리(그림 알파 0.8 위)를 재면 싱글 칸의 `P_001` · `E_001`이 우리 싱글 자리(z ±2.2)를 덮는 작은 두 조각, 더블 칸의
 * `P_002` · `E_002`가 더 넓은 두 조각, 태그 칸의 `P_004` · `P_003`이 각각 싱글 · 더블 두 조각을 **한 장으로 합친** 것이다
 * (`.audit/arena-mats-20261018`). 이름대로 「그 배틀에서 숨긴다」로 읽으면 싱글 배틀에 더블 조각과 합친 판 둘이 넷 겹쳐 서서 바닥
 * 격자가 통째로 가린다 — 칸마다 제 배틀의 모양이 들어 있다고 보는 쪽이 모양과 맞는다
 */
export function battleHides(root: Object3D, shape: BattleShape): void {
  root.traverse((o) => {
    const listed = (o.userData as { listedIn?: unknown }).listedIn
    if (Array.isArray(listed)) o.visible = listed.includes(shape)
  })
}
