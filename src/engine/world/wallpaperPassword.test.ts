import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkWallpaperPassword, UNLOCKABLE_WALLPAPERS, wallpaperPasswordFor } from './wallpaperPassword'

/** 가짜 낱말표 — 번호가 자리와 다르게 섞여 있어야 풀이가 자리를 제대로 찾는지 드러난다 */
const BANK = Array.from({ length: 1300 }, (_, i) => (i * 7919) % 5003 + 1)

describe('벽지 암호', () => {
  it('만든 암호를 그 ID가 풀면 그 벽지다 — 여덟 벽지 · ID 여럿', () => {
    for (const id of [0, 1, 12345, 54321, 65535, 0x8000]) {
      for (let w = 0; w < UNLOCKABLE_WALLPAPERS; w++) {
        const words = wallpaperPasswordFor(BANK, id, w)
        expect(words, `${String(id)}/${String(w)}`).not.toBeNull()
        expect(checkWallpaperPassword(BANK, id, words!)).toBe(w)
      }
    }
  })

  it('다른 ID면 안 풀린다 · 낱말 하나만 바뀌어도 안 풀린다 · 표에 없는 낱말은 안 된다', () => {
    const words = wallpaperPasswordFor(BANK, 12345, 3)!
    expect(checkWallpaperPassword(BANK, 12346, words)).toBe(-1)
    const other = BANK.find((w) => w !== words[1])!
    expect(checkWallpaperPassword(BANK, 12345, [words[0], other, words[2], words[3]])).toBe(-1)
    expect(checkWallpaperPassword(BANK, 12345, [99999, words[1], words[2], words[3]])).toBe(-1)
  })
})

const SRC = 'raw/decomp/src/overlay006/wallpaper_passwords.c'

describe.runIf(existsSync(SRC))('원작과 맞대기', () => {
  it('돌리기 5 · 넷째로 가리기 · 6 · ID · 곱', () => {
    const s = readFileSync(SRC, 'utf8')
    expect(s).toContain('RotateBits(bits, NELEMS(bits), 5);')
    expect(s).toContain('bits[i] ^= ((bits[3] >> 4) | (bits[3] & 0xF0));')
    expect(s).toContain('RotateBits(bits, 3, bits[3] & 0xF);')
    expect(s).toContain('((bits[0] & 0xF0) >> 4) == 6 && bits[3] == (((bits[0] + bits[1]) * bits[2]) & 0xFF)')
  })
})
