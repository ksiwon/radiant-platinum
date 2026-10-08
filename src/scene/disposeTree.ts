// 치운 BDSP 층의 GPU 몫을 놓는다 — 방 · 야외 · 던전
//
// ⚠️ **`<primitive>`는 R3F가 안 치운다.** 풀어 온 glb를 떼어도 그림 · 형상은 렌더러가 쥔 채 남는다. `pnpm story` 전체 판에서
// 맵을 옮길 때마다 그림이 늘기만 했고(축복 356 → 무쇠 702 → 축복 다시 1,047 · `.audit/probe/memTour.mjs`), 여든여덟 자리를
// 도는 뒤쪽에서 무쇠 · 축복 · 물가 · 209번도로의 야외 지역이 잴 때까지 못 섰다. 다시 오면 새로 풀어 한 벌을 또 올리므로
// 떼는 쪽이 놓아야 한다
import { Mesh, Texture, type Material, type Object3D } from 'three'

/** 재질이 쥔 그림들 — `map` · `emissiveMap` · … 이름을 못 박지 않고 값으로 가린다 */
function texturesOf(m: Material): Texture[] {
  return Object.values(m).filter((v): v is Texture => v instanceof Texture)
}

/** `root` 아래 메시의 형상 · 재질 · 그림을 버린다. 여럿이 나눠 쥔 것도 한 번씩만 */
export function disposeTree(root: Object3D): void {
  const geometries = new Set<{ dispose: () => void }>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    geometries.add(o.geometry as { dispose: () => void })
    for (const m of (Array.isArray(o.material) ? o.material : [o.material]) as Material[]) materials.add(m)
  })
  for (const m of materials) for (const t of texturesOf(m)) textures.add(t)
  for (const g of geometries) g.dispose()
  for (const m of materials) m.dispose()
  for (const t of textures) {
    // 풀린 그림은 `ImageBitmap`이다 — GPU 몫과 따로 CPU 몫을 쥔다
    const image: unknown = t.image
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
      image.close()
      // ⚠️ **닫은 그림을 텍스처에 그대로 두지 않는다.** three의 노드 빌더 상태는 같은 재질 모양이면 서로 나눠 쓰고, 새 재질의 첫
      // 바인딩은 **직전에 그 상태를 쓴 물체의 그림**(방금 버린 지역의 것)으로 올린다. 닫힌 `ImageBitmap`이 그 자리에 있으면
      // WebGL2 폴백에서 `texSubImage2D: The source data has been detached`가 뜬다(실측: 도심 → 숲 이동에서 두 번). 1×1을 대신 둔다
      if (typeof ImageData !== 'undefined') t.image = new ImageData(1, 1)
    }
    t.dispose()
  }
}
