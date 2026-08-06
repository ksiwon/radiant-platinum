// 소품의 뒷면을 만든다 (DATA.md §2.2)
//
// 원작 집은 **뒤가 통째로 없다.** 주인공 집이 삼각형 219개인데 −Z를 보는 면이
// 0개다. 구멍이 뚫린 것이 아니라 앞·옆·지붕만 있고 뒤와 바닥이 안 만들어져
// 있다 — 원작 카메라가 고정 각도라 뒤를 볼 일이 없었다. 뒤로 돌아가면 앞벽의
// **안쪽**이 보인다.
//
// ⚠️ **면적 벡터로는 이걸 못 잰다.** 한 번 그렇게 접근했다가 틀렸다. 경계 고리를
// 부채꼴로 덮으면 면적 벡터는 0에 수렴하는데, 문틀·창틀 같은 안쪽 테두리를 덮고
// 정작 뚫린 뒤는 그대로 두고도 합이 맞는다. 재야 할 것은 넓이가 아니라
// **뒤에서 본 실루엣이 다 막혔는가**다(`shell.test`가 그걸 잰다).
//
// 그래서 고리를 고르지 않는다. **삼각형을 전부 뒤판으로 눌러 붙인다.** 눌러
// 붙인 것들의 합집합이 곧 뒤에서 본 실루엣이라, 어느 고리가 진짜 구멍인지 고를
// 필요가 자체가 없어진다.
import { BufferAttribute, BufferGeometry } from 'three'
import type { ChunkMesh, TexSheet } from './chunkMesh'

/**
 * 뒤판을 이만큼 두께 안에 눌러 담는다 (타일).
 *
 * 한 평면에 완전히 눕히면 겹친 삼각형끼리 깊이가 같아 깜빡인다. 원래 z 순서를
 * **뒤집어** 얇은 층에 담으면, 뒤에서 볼 때 원작의 앞면이 제일 앞에 온다 —
 * 박공은 지붕이 아니라 벽으로 보여야 맞다
 */
const SLAB = 0.02
/** 알파 판정 문턱. 재질이 쓰는 `alphaTest: 0.5`와 같은 자리다 */
const ALPHA_CUT = 128
/**
 * 서브메시마다 뒤판에 쓸 색. `null`이면 그 서브메시는 뒤판을 안 만든다.
 *
 * 색은 **그 그림의 평균**이다 — 아무 회색이나 칠하면 지역마다 다른 원작 색조가
 * 사라진다. 여기서 `plateColors`처럼 제일 많이 쓰인 색을 쓰지 않는 이유는,
 * 저쪽은 팔레트에서 잎 색과 줄기 색을 **갈라내는** 일이고 이쪽은 텍스처 한 장을
 * 색 하나로 **대신하는** 일이라서다. 대신하는 자리에서는 멀리서 보이는 색이
 * 답인데, 최빈값은 통나무 줄눈처럼 넓게 깔린 윤곽선을 집는다 — 주인공 집 벽이
 * 최빈 #947b73(밝기 129)이고 평균 #a5a28f(밝기 161)다.
 *
 * 그늘로 따로 깎지 않는다. −Z를 보는 면은 태양(24, 42, 18)도 필(−14, 12, 26)도
 * 못 받아서 반구광만 닿는다 — 이미 그늘이다. 여기서 또 깎으면 이중이 된다.
 *
 * 오려 낸 그림(`cutout`)은 뒤판을 만들면 안 된다. 판 한 장짜리 울타리·간판이라
 * 눌러 붙이면 없던 널판이 생긴다
 */
export function shellColors(
  mesh: ChunkMesh, sheet: TexSheet | null, cutout: readonly boolean[],
): (number | null)[] {
  return mesh.materials.map((spec, i) => {
    if (cutout[i] === true) return null
    const item = sheet?.items.find((s) => s.tex === spec.tex && s.pal === (spec.pal ?? ''))
    if (!sheet || !item) return null
    let r = 0, g = 0, b = 0, n = 0
    for (let y = 0; y < item.h; y++) {
      const row = ((item.y + y) * sheet.width + item.x) * 4
      for (let x = 0; x < item.w; x++) {
        const o = row + x * 4
        if (sheet.pixels[o + 3]! < ALPHA_CUT) continue
        r += sheet.pixels[o]!; g += sheet.pixels[o + 1]!; b += sheet.pixels[o + 2]!; n++
      }
    }
    if (n === 0) return null
    return (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n)
  })
}

/**
 * 뒤판 지오메트리. 없으면 `null`.
 *
 * 뒤에서 봐서 넓이가 0인 삼각형(옆벽처럼 모로 선 것)은 실루엣에 아무것도 안
 * 보태므로 버린다 — 주인공 집은 219개 중 89개가 그렇다.
 *
 * 법선은 전부 −Z로 준다. 눌러 붙인 삼각형의 원래 법선은 사방을 보고 있어서
 * 그대로 두면 한 벽이 얼룩덜룩해진다
 */
export function backPlate(
  mesh: ChunkMesh, colors: readonly (number | null)[],
): BufferGeometry | null {
  const src = mesh.geometry
  const pos = (src.getAttribute('position') as BufferAttribute).array as ArrayLike<number>
  const index = src.getIndex()!.array
  let minZ = Infinity, maxZ = -Infinity
  for (let i = 2; i < pos.length; i += 3) {
    const z = pos[i]!
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  const depth = maxZ - minZ
  if (!(depth > 0)) return null
  // 뒤로 갈수록 0, 앞면이 −SLAB. 뒤에서 보면 앞면이 제일 앞에 온다
  const flat = (z: number): number => minZ - SLAB * ((z - minZ) / depth)

  const position: number[] = []
  const color: number[] = []
  mesh.groups.forEach(([, start, count], group) => {
    const rgb = colors[group]
    if (rgb === null || rgb === undefined) return
    const r = ((rgb >> 16) & 255) / 255, g = ((rgb >> 8) & 255) / 255, b = (rgb & 255) / 255
    for (let t = 0; t < count; t += 3) {
      const tri = [index[start + t]!, index[start + t + 1]!, index[start + t + 2]!]
      const p = tri.map((k) => [pos[k * 3]!, pos[k * 3 + 1]!, pos[k * 3 + 2]!] as const)
      // 뒤에서 본 넓이. 모로 선 면은 여기서 0이 된다
      const area = ((p[1]![0] - p[0]![0]) * (p[2]![1] - p[0]![1])
        - (p[2]![0] - p[0]![0]) * (p[1]![1] - p[0]![1])) / 2
      if (Math.abs(area) < 1e-4) continue
      // **−Z를 보게 감는다.** 원작의 감는 방향을 그대로 물려받으면 뒤판이 앞을
      // 보고 있어서, 면은 다 있는데 뒤에서는 하나도 안 보인다
      const wound = area > 0 ? [p[0]!, p[2]!, p[1]!] : p
      for (const q of wound) {
        position.push(q[0], q[1], flat(q[2]))
        color.push(r, g, b)
      }
    }
  })
  if (position.length === 0) return null

  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geo.setAttribute('color', new BufferAttribute(new Float32Array(color), 3))
  const normal = new Float32Array(position.length)
  for (let i = 2; i < normal.length; i += 3) normal[i] = -1
  geo.setAttribute('normal', new BufferAttribute(normal, 3))
  geo.computeBoundingSphere()
  return geo
}
