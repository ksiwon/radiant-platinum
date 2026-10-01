// 1인칭에서 무엇이 꺼지고 무엇이 남는가 (FIRST_PERSON §9.2).
import { describe, expect, it } from 'vitest'
import { BoxGeometry, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { showPlayerSkin, type SkinPart } from './playerVisibility'

/** 조각 셋 — 기본 복장 둘과 **원래 꺼져 있는** 대체 복장 하나. 재질은 조각마다 따로다 */
function skin(): SkinPart[] {
  return [true, true, false].map((shown) => {
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
    mesh.visible = shown
    return { mesh, shown }
  })
}

const material = (part: SkinPart): MeshStandardMaterial =>
  (part.mesh as Mesh).material as MeshStandardMaterial

describe('1인칭 몸 끄기', () => {
  it('1인칭이면 살덩이가 화면에서 사라진다 — 눈이 머리 안쪽이다', () => {
    const parts = skin()
    expect(showPlayerSkin(parts, true)).toBe(true)
    for (const p of parts) {
      expect(material(p).colorWrite).toBe(false)
      expect(material(p).depthWrite).toBe(false)
    }
  })

  // ⚠️ `visible`을 끄면 그림자 패스에서도 빠진다 — 자전거 그림자만 땅을 달렸다
  it('⚠️ 그래도 켜져 있다 — 그림자는 사람이 진다', () => {
    const parts = skin()
    showPlayerSkin(parts, true)
    expect(parts.map((p) => p.mesh.visible)).toEqual([true, true, false])
  })

  it('나오면 **원래 켜져 있던 것만** 켜진다 — 대체 복장은 그대로 꺼 둔다', () => {
    // 다 켜면 기본 복장과 겹쳐 z-fighting이 난다 (`personModel`의 `ALT_OUTFIT`)
    const parts = skin()
    showPlayerSkin(parts, true)
    showPlayerSkin(parts, false)
    expect(parts.map((p) => p.mesh.visible)).toEqual([true, true, false])
    for (const p of parts) {
      expect(material(p).colorWrite).toBe(true)
      expect(material(p).depthWrite).toBe(true)
    }
  })

  it('원래 깊이를 안 쓰던 재질은 나와도 안 쓴다 — 받은 깃발로 되돌린다', () => {
    const parts = skin()
    material(parts[0]!).depthWrite = false
    showPlayerSkin(parts, true)
    showPlayerSkin(parts, true) // 프레임마다 불린다 — 두 번째가 원래 값을 덮으면 안 된다
    showPlayerSkin(parts, false)
    expect(material(parts[0]!).depthWrite).toBe(false)
    expect(material(parts[1]!).depthWrite).toBe(true)
  })

  // ⚠️ 조각마다 적으면 둘째 조각이 「이미 끈 값」을 원래 값으로 적는다
  it('⚠️ 재질을 같이 쓰는 조각이 있어도 나오면 다 되돌아온다', () => {
    const shared = new MeshStandardMaterial()
    const parts: SkinPart[] = [0, 1].map(() => ({ mesh: new Mesh(new BoxGeometry(), shared), shown: true }))
    showPlayerSkin(parts, true)
    expect(shared.colorWrite).toBe(false)
    showPlayerSkin(parts, false)
    expect(shared.colorWrite).toBe(true)
    expect(shared.depthWrite).toBe(true)
  })

  it('3인칭은 손대지 않는다 — 감춘 적 없는 재질은 그대로다', () => {
    const parts = skin()
    material(parts[0]!).colorWrite = false
    showPlayerSkin(parts, false)
    expect(material(parts[0]!).colorWrite).toBe(false)
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
