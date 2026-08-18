// 기술 연출이 **원작 대본에서 온 값**인지 잰다.
//
// 여기 있던 시험은 `moveVisualSignature(id)`가 기술마다 다른 수를 돌려주는지만
// 봤다. 산술이라 당연히 달랐고, 그래서 「471개가 다 다르다」가 초록으로 통과하는
// 채로 화면은 전부 같은 연출이었다. 이제 실제 자료를 읽고 **아는 기술의 값**과
// 맞춘다 — 다른지가 아니라 맞는지를 본다
import { describe, expect, it } from 'vitest'
import { MOVE_ANIMS, type MoveAnim } from '../../engine/battle/moveAnimTable'
import { elementFamilyForType, moveVisualSignature } from './moveElements'

// ⚠️ **자료가 없는 기계에서도 돈다.** 표가 소스에 굽혀 있어서(`pnpm gen:moveAnim`)
// `public/data`가 비어 있어도 이 시험은 건너뛰지 않는다 — 예전에는 파일이 없으면
// 빈 배열로 조용히 통과했다
const anims: readonly (MoveAnim | null)[] = MOVE_ANIMS
const real = true

/** 4세대 기술 번호. 원작 표 그대로다 */
const MOVE = {
  tackle: 33, flamethrower: 53, thunderbolt: 85, dig: 91,
  fly: 19, hyperBeam: 63, swordsDance: 14, earthquake: 89, fissure: 90,
  odorSleuth: 316,
} as const

describe('기술 연출 대본', () => {
  it('타입이 물질 계열을 가른다', () => {
    expect(elementFamilyForType(10)).toBe('flame')
    expect(elementFamilyForType(11)).toBe('water')
    expect(elementFamilyForType(13)).toBe('spark')
    expect(elementFamilyForType(0)).toBe('neutral')
  })

  it('대본이 없으면 아무것도 안 얹는다', () => {
    const plain = moveVisualSignature(null)
    expect(plain.flash).toBeNull()
    expect(plain.shake).toBeNull()
    expect(plain.lunge).toBeNull()
    expect(plain.vanish).toBe(false)
  })

  describe.runIf(real)('실제 자료', () => {
    it('불꽃세례는 배경을 어두운 붉은색으로 물들이고 쓴 쪽이 떨린다', () => {
      const s = moveVisualSignature(anims[MOVE.flamethrower])
      // BATTLE_COLOR_DARK_RED2 = RGB(12, 2, 2) → 0~255로 (99, 16, 16)
      expect(s.flash).toEqual({ color: 'rgb(99, 16, 16)', strength: 12 / 16 })
      expect(s.shake?.who).toBe('attacker')
    })

    it('번개는 배경을 까맣게 죽이고 맞는 쪽을 흔든다', () => {
      const s = moveVisualSignature(anims[MOVE.thunderbolt])
      expect(s.flash?.color).toBe('rgb(0, 0, 0)')
      expect(s.shake?.who).toBe('defender')
    })

    it('몸통박치기는 달려 나가고, 파괴광선은 안 나간다', () => {
      expect(moveVisualSignature(anims[MOVE.tackle]).lunge).not.toBeNull()
      expect(moveVisualSignature(anims[MOVE.hyperBeam]).lunge).toBeNull()
    })

    // ⚠️ 제일 센 것은 파괴광선이 아니라 **미아일 냄새**다 (양쪽을 200). 세기로
    // 짐작하면 틀린다 — 대본이 흔드는 것은 위력이 아니라 연출이다
    it('떨림 세기 차례가 대본대로다', () => {
      const power = (id: number) => anims[id]!.shake!.power
      expect(power(MOVE.odorSleuth)).toBe(200)
      expect(power(MOVE.fissure)).toBe(120)
      expect(power(MOVE.hyperBeam)).toBe(80)
      const all = anims
        .filter((a): a is MoveAnim => a !== null && a.shake !== null)
        .map((a) => a.shake!.power)
      expect(Math.max(...all)).toBe(200)
    })

    it('구멍파기와 공중날기는 쓴 쪽이 사라진다', () => {
      expect(moveVisualSignature(anims[MOVE.dig]).vanish).toBe(true)
      expect(moveVisualSignature(anims[MOVE.fly]).vanish).toBe(true)
      expect(moveVisualSignature(anims[MOVE.tackle]).vanish).toBe(false)
    })

    it('땅을 흔드는 기술만 화면이 흔들린다', () => {
      expect(moveVisualSignature(anims[MOVE.earthquake]).camera).toBeGreaterThan(0)
      expect(moveVisualSignature(anims[MOVE.fissure]).camera).toBeGreaterThan(0)
      expect(moveVisualSignature(anims[MOVE.thunderbolt]).camera).toBe(0)
    })

    it('검무는 제 몸에 걸어서 상대 쪽에 아무것도 안 붙는다', () => {
      expect(moveVisualSignature(anims[MOVE.swordsDance]).anchor).not.toBe('defender')
    })

    // ⚠️ 이 한 줄이 「산술로 돌아갔다」를 잡는다. 값이 다 같아지면 대본을 안 읽는
    // 것이고, 값이 전부 다르면 산술로 흔든 것이다 — 진짜 자료는 **뭉친다**
    it('배경 색이 13가지로 뭉친다 — 기술마다 다른 것이 아니다', () => {
      const colors = new Set(
        anims.filter((a) => a?.flash).map((a) => a!.flash!.color.join(',')),
      )
      expect(colors.size).toBe(13)
      expect(anims.filter((a) => a?.flash).length).toBe(108)
    })
  })
})
