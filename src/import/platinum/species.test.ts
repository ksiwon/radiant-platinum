// 종족 한 줄의 `b[25]` — 몸 색 7비트와 뒤집기 깃발 1비트 (struct_defs/species.h)
import { describe, it, expect } from 'vitest'
import { parsePersonal } from './species'

const personal = (b25: number): Uint8Array => {
  const b = new Uint8Array(44)
  b[25] = b25
  return b
}

describe('종족 한 줄 b[25]', () => {
  it('맨 위 비트가 flip이고 아래 7비트가 몸 색이다', () => {
    expect(parsePersonal(personal(0x85))).toMatchObject({ color: 5, flip: 1 })
    expect(parsePersonal(personal(0x05))).toMatchObject({ color: 5, flip: 0 })
    // ⚠️ 0x40은 몸 색의 일부다 — 6비트로 자르면 사라진다
    expect(parsePersonal(personal(0x7f))).toMatchObject({ color: 0x7f, flip: 0 })
  })

  it('flip은 color 바로 뒤에 선다 — 노드 산출물과 키 순서가 같아야 바이트가 같다', () => {
    const keys = Object.keys(parsePersonal(personal(0)))
    expect(keys.indexOf('flip')).toBe(keys.indexOf('color') + 1)
  })
})
