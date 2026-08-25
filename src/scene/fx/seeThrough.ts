// **깊이를 안 쓰는 면을 후처리에 알려 준다** (`fx/post`의 윤곽).
//
// 윤곽은 깊이 텍스처만 본다. `depthWrite:false`인 면은 깊이를 안 남기므로 그
// 자리의 깊이는 **뒤에 있는 것**의 깊이다. 그래서 87%로 흐려진 집 위에
// **뒤 마을의 실루엣이 선으로 그려졌다** — 집은 멀쩡히 보이는데 그 안으로
// 나무와 지붕의 윤곽이 비쳤다.
//
// 실측(`.audit/seeThrough.mjs`, 32곳 × 화소 1,536): 배틀프런티어에서 화면의
// **28.9%**가 그런 화소였다(다리 `bf_hashi04`, 뒤와의 간격 11타일). 흐려지는
// 집(`pcwall` α0.87 · `gym_door00` α0.81)이 그다음이다.
//
// 고치는 길은 **덮은 정도를 따로 적는 것**이다. 장면 패스에 색 말고 `cover`를
// 하나 더 두고, 깊이를 쓰는 면은 1, 안 쓰는 면은 0을 적는다. 반투명 합성이
// 그 값에도 걸리므로 α0.87짜리 집 뒤에서는 `cover`가 0.13이 되고, 윤곽은 그
// 만큼만 남는다 — 87% 가려진 것은 87% 지운다.
import { float, mrt } from 'three/tsl'
import type { Material } from 'three'

/** 장면 패스가 덮은 정도를 적는 이름 */
export const COVER = 'cover'

/** 깊이를 안 쓰는 면이 적는 값 */
const CLEAR = mrt({ [COVER]: float(0) })

/** 재질에 매달 수 있는 MRT 덮어쓰기 (`NodeMaterial.mrtNode`) */
interface Marked { mrtNode: unknown }

/**
 * 이 재질이 깊이를 안 쓰는가를 표시한다.
 *
 * ⚠️ **재질을 만들 때 한 번만 부르는 것이 아니다.** `PropFade`는 집을 흐리는
 * 동안만 깊이 쓰기를 끄므로 그때마다 다시 불러야 한다. 값이 실제로 바뀔 때만
 * `needsUpdate`를 세운다 — 프레임마다 세우면 파이프라인이 매번 다시 구워진다
 */
export function markSeeThrough(material: Material, seeThrough: boolean): void {
  const node = material as unknown as Marked
  const want = seeThrough ? CLEAR : null
  if (node.mrtNode === want) return
  node.mrtNode = want
  material.needsUpdate = true
}
