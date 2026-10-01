// 안 그려지던 물체 열 종 (`ObjectProps`) — BDSP 위에서 간판이 두 벌 서지 않게
//
// 실측(바깥 간판 189곳): 179곳이 BDSP 지역에 구워져 있다 — 나머지 열 곳만 원작 것을 세운다
import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial } from 'three'
import { bakedSignNear, holdBdspSigns, isBakedSign } from './ObjectProps'

describe('BDSP가 구운 간판', () => {
  it('간판 · 글자판 · 번호판 · 우편함 · 게시판만 고른다 — 상자(`CardBoard`) · 철도 신호 · 벽보는 아니다', () => {
    const is = (name: string): boolean => isBakedSign(new MeshStandardMaterial({ name }))
    for (const n of ['M_C_001_SignBoard_01', 'M_T_001_Boardletter_01', 'M_R_201_Boardnumber_01', 'M_C_001_Post_01',
      'M_C_001_Guide_01b', 'M_C_001_GuideLetter_01']) {
      expect(is(n), n).toBe(true)
    }
    for (const n of ['M_C_001_CardBoard_01', 'M_D_007_RailwaySignal_01', 'M_C_001_Bookshelf_01', 'M_T_012_GuideLight_01',
      'M_C_001_Poster_01']) expect(is(n), n).toBe(false)
  })

  it('붙은 지역의 간판 자리에서만 원작 간판을 거른다 — 떼면 다시 선다', () => {
    const root = new Group()
    // 한 번 서는 간판 (1.2칸 안이 같은 간판이다)
    const sign = new Mesh(new BoxGeometry(1, 1, 0.2), new MeshStandardMaterial({ name: 'M_C_001_SignBoard_01' }))
    sign.position.set(120.5, 1.5, 860.4)
    // 여러 번 서는 화살표 간판
    const arrows = new InstancedMesh(new BoxGeometry(1, 1, 0.2), new MeshStandardMaterial({ name: 'M_C_001_SignBoard_02' }), 2)
    arrows.setMatrixAt(0, new Matrix4().makeTranslation(200.5, 1, 700.5))
    arrows.setMatrixAt(1, new Matrix4().makeTranslation(210.5, 1, 700.5))
    root.add(sign, arrows)
    const release = holdBdspSigns(root)
    expect(bakedSignNear(120.5, 860.5)).toBe(true)
    expect(bakedSignNear(210.5, 700.5)).toBe(true)
    // BDSP에 없는 자리 — 원작 것이 선다
    expect(bakedSignNear(177.5, 755.5)).toBe(false)
    release()
    expect(bakedSignNear(120.5, 860.5)).toBe(false)
  })
})
