// 무대의 창빛 — 어떻게 그릴지 이름과 그림 유무로 가른다 (REPAIR §49.5)
//
// BDSP 실내 무대에는 창으로 드는 빛이 판으로 서 있다(`M_B_021_WindowLight_03`처럼
// 이름에 `Light`가 든 재질). 번들은 그것을 `RenderType: Transparent`로 적고 굽는
// 쪽은 glTF `BLEND`로 옮기는데(`bdspArena.py` · `import/bdsp/arena.ts`), 그대로
// 보통 알파로 그리면 **흰 널빤지**가 된다 — 빛은 더하기 합성이어야 바닥 위에 밝게
// 얹히고, glTF에는 더하기 모드가 없어서 싣는 쪽이 걸어야 한다.
//
// ⚠️ **그림이 없는 창빛은 숨긴다.** `g021`(숲의 양옥집·운하 도서관 35맵)의 창빛
// 열하나는 `_MainTex`가 없어 색만 흰색·알파 1로 구워졌다 — 더하기로 그려도 흰 판
// 그대로다(흰색을 더하면 흰색이다). 원작 화면에서 그것이 무엇이었는지는 텍스처가
// 없어 알 수 없으므로, 읽히는 쪽을 택해 안 그린다 (실측 `shots/audit/indoor3wildB.png`).
// `g015`(민가·갤럭시단 빌딩 232맵)의 창빛 다섯은 그림이 있어 더하기로 바르게 선다.
import { AdditiveBlending, type Material, type MeshStandardMaterial } from 'three'

type LightMode = 'plain' | 'additive' | 'hidden'

/** 이름이 창빛인가. 굽는 쪽 둘이 같은 이름 규칙(BDSP 재질 이름 그대로)을 쓴다 */
const isLightMaterial = (name: string): boolean => /Light|Window/i.test(name)

/**
 * 재질 하나를 어떻게 그릴까.
 *
 * @param name 재질 이름
 * @param blends glTF `BLEND`로 실렸는가 (three에서는 `material.transparent`)
 * @param hasMap 그림(`_MainTex`)이 있는가
 */
export function lightMode(name: string, blends: boolean, hasMap: boolean): LightMode {
  if (!blends || !isLightMaterial(name)) return 'plain'
  return hasMap ? 'additive' : 'hidden'
}

/**
 * 무대 재질에 그 모드를 건다. 숨길 것이면 `false`를 돌려준다 — 메시를 끄는 것은
 * 부르는 쪽이다(재질은 여러 메시가 나눠 쓰므로 여기서 메시를 모른다)
 */
export function applyLightMode(material: Material & Partial<MeshStandardMaterial>): boolean {
  const mode = lightMode(material.name, material.transparent, (material.map ?? null) !== null)
  if (mode === 'hidden') return false
  if (mode === 'additive') {
    material.blending = AdditiveBlending
    // 더하기 판이 깊이를 쓰면 뒤에 선 포켓몬이 그 판에 잘린다
    material.depthWrite = false
  }
  return true
}
