// 필드 이펙트 소품 표 (PARITY §1.27 · §6.10)
//
// 이 표는 **롬이 적어 둔 번호를 옮긴 것**이라, 지키는 것도 「짐작이 안 들어갔는가」다.
import { describe, expect, it } from 'vitest'
import { PROP_KIND_BY_GFX, PROP_MODEL_INDEX, PROP_POS_OFFSET } from './fldeffProps'

describe('필드 이펙트 소품 표', () => {
  it('모델 자리와 자리 보정이 같은 길이다', () => {
    // 어긋나면 뒤쪽 소품이 앞쪽 보정을 쓴다 — 화면에서는 「한 칸 위에 떴다」로만 보인다
    expect(PROP_POS_OFFSET).toHaveLength(PROP_MODEL_INDEX.length)
  })

  it('아카이브 자리가 겹치지 않는다', () => {
    expect(new Set(PROP_MODEL_INDEX).size).toBe(PROP_MODEL_INDEX.length)
  })

  it('보정이 세 축이다', () => {
    for (const [i, off] of PROP_POS_OFFSET.entries()) {
      expect(off, `${String(i)}번`).toHaveLength(3)
      for (const v of off) expect(Number.isFinite(v)).toBe(true)
    }
  })

  it('안 그려지던 열 종이 다 표에 있다', () => {
    // `Unk_ov5_02200230`의 아홉 + 눈덩이 하나 (`ov5_021F23FC`)
    expect(PROP_KIND_BY_GFX.size).toBe(10)
    for (const [gfx, kind] of PROP_KIND_BY_GFX) {
      expect(PROP_MODEL_INDEX[kind], `그림 ${String(gfx)}`).toBeTypeOf('number')
    }
  })

  it('열 종의 아카이브 자리가 롬의 표 그대로다', () => {
    // `ov5_021F10E8.c:254`의 `{그림번호, 자리}` 쌍. 눈덩이만 `ov5_021F23FC`가
    // 직접 여는 78번이다. **여기를 고치려면 디컴프를 다시 읽어야 한다**
    const rom = new Map([
      [91, 0x45], [92, 0x46], [93, 0x47], [94, 0x48], [95, 0x49], [96, 0x4a],
      [118, 78], [183, 0x4f], [209, 0x6e], [262, 0x95],
    ])
    for (const [gfx, at] of rom) {
      const kind = PROP_KIND_BY_GFX.get(gfx)
      expect(kind, `그림 ${String(gfx)}`).toBeTypeOf('number')
      expect(PROP_MODEL_INDEX[kind!], `그림 ${String(gfx)}`).toBe(at)
    }
  })

  it('간판 여섯만 칸 뒤쪽으로 물러선다', () => {
    // `Unk_ov5_021FB51C` — 여섯이 `{0, 0, -2 * FX32_ONE}`이고 나머지 넷은 0이다
    for (const gfx of [91, 92, 93, 94, 95, 96]) {
      expect(PROP_POS_OFFSET[PROP_KIND_BY_GFX.get(gfx)!], `그림 ${String(gfx)}`)
        .toEqual([0, 0, -2 / 16])
    }
    for (const gfx of [118, 183, 209, 262]) {
      expect(PROP_POS_OFFSET[PROP_KIND_BY_GFX.get(gfx)!], `그림 ${String(gfx)}`)
        .toEqual([0, 0, 0])
    }
  })

  it('깨어진 세계 스물다섯이 앞을 그대로 차지한다', () => {
    // 뒤에 이어 붙인 것들이 앞 번호를 밀면 `tw_arc`의 종류 번호가 통째로 어긋난다
    expect(PROP_MODEL_INDEX.slice(0, 25))
      .toEqual([...Array.from({ length: 25 }, (_, i) => 0x7c + i)])
  })
})
