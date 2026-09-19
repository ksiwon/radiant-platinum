// 1인칭에서 무엇이 꺼지고 무엇이 남는가 (FIRST_PERSON §9.2).
import { describe, expect, it } from 'vitest'
import { Object3D } from 'three'
import { showPlayerSkin, type SkinPart } from './playerVisibility'

/** 조각 셋 — 기본 복장 둘과 **원래 꺼져 있는** 대체 복장 하나 */
function skin(): SkinPart[] {
  const parts = [true, true, false].map((shown) => {
    const mesh = new Object3D()
    mesh.visible = shown
    return { mesh, shown }
  })
  return parts
}

describe('1인칭 몸 끄기', () => {
  it('1인칭이면 살덩이가 다 꺼진다 — 눈이 머리 안쪽이다', () => {
    const parts = skin()
    expect(showPlayerSkin(parts, true)).toBe(true)
    for (const p of parts) expect(p.mesh.visible).toBe(false)
  })

  it('나오면 **원래 켜져 있던 것만** 켜진다 — 대체 복장은 그대로 꺼 둔다', () => {
    // 다 켜면 기본 복장과 겹쳐 z-fighting이 난다 (`personModel`의 `ALT_OUTFIT`)
    const parts = skin()
    showPlayerSkin(parts, true)
    showPlayerSkin(parts, false)
    expect(parts.map((p) => p.mesh.visible)).toEqual([true, true, false])
  })

  it('조각을 못 받았으면 false다 — 그때만 부르는 쪽이 그룹째 끈다', () => {
    expect(showPlayerSkin(null, true)).toBe(false)
    expect(showPlayerSkin([], true)).toBe(false)
  })

  it('타고 있는 것과 손에 든 것은 조각 목록 밖이다', () => {
    // 자전거·파도타기는 주인공 그룹의 자식이고 낚싯대는 손 뼈의 자식이다.
    // `showPlayerSkin`은 넘겨받은 조각만 건드린다 — 그것이 이 고침의 전부다
    const parts = skin()
    const bike = new Object3D()
    showPlayerSkin(parts, true)
    expect(bike.visible).toBe(true)
  })
})
