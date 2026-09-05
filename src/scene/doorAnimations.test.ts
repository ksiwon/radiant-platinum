// 문이 **원작 클립 길이로** 돈다.
//
// ⚠️ **한 값으로 두면 안 된다.** 오래 스무 종이 다 200ms였는데 롬을 재면
// 나무 여닫이가 8프레임(133ms) · 포켓몬센터 미닫이가 15프레임(250ms) ·
// 체육관 미닫이가 10프레임(167ms)이다. 그리고 미닫이는 **돌지 않는다** —
// 원작 클립이 문짝의 X 크기를 0으로 눌러 문틀 속에 넣는다 (DATA §2.31).
import { expect, it, describe } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { propAnimsSchema, type PropAnimsFile } from '../data/schema'
import { doorClip } from './DoorAnimations'

const ROOT = resolve(__dirname, '../..')
const BAKED = resolve(ROOT, 'public/data/props/anims.json')

/** 아직 안 구운 트리에서는 표 없이 도는 길만 잰다 */
function baked(): PropAnimsFile | null {
  if (!existsSync(BAKED)) return null
  return propAnimsSchema.parse(JSON.parse(readFileSync(BAKED, 'utf8')))
}

describe('doorClip', () => {
  it('표가 없으면 지금까지의 한 벌로 간다', () => {
    const clip = doorClip(66, null)
    expect(clip.kind).toBe('hinged')
    expect(clip.openMs).toBe(200)
    expect(clip.shutMs).toBe(200)
  })

  it('문이 아닌 자리는 여닫이로 본다', () => {
    // `grid.propModelAt`이 못 찾으면 −1이다 — 그래도 화면이 서야 한다
    expect(doorClip(-1, null).kind).toBe('hinged')
  })

  it('미닫이 여섯과 백화점 종소리 하나를 가른다', () => {
    for (const id of [70, 75, 298, 427, 456, 484]) {
      expect(doorClip(id, null).kind, `소품 ${String(id)}`).toBe('sliding')
    }
    expect(doorClip(442, null).kind).toBe('chime')
    for (const id of [66, 67, 68, 69, 128, 246, 260, 312, 313, 438, 441, 444, 527]) {
      expect(doorClip(id, null).kind, `소품 ${String(id)}`).toBe('hinged')
    }
  })
})

describe('doorClip — 구운 표', () => {
  const table = baked()
  it.skipIf(table === null)('원작 프레임 수 그대로 돈다', () => {
    const ms = (frames: number): number => frames * (1000 / 60)
    // 나무 여닫이 여덟 프레임 — 200ms가 아니다
    expect(doorClip(66, table).openMs).toBeCloseTo(ms(8), 6)
    expect(doorClip(66, table).shutMs).toBeCloseTo(ms(8), 6)
    // 포켓몬센터 미닫이 열다섯 · 체육관 열
    expect(doorClip(70, table).openMs).toBeCloseTo(ms(15), 6)
    expect(doorClip(298, table).openMs).toBeCloseTo(ms(10), 6)
    // 백화점 아홉
    expect(doorClip(442, table).openMs).toBeCloseTo(ms(9), 6)
  })

  it.skipIf(table === null)('스무 종이 다 표에 있다', () => {
    for (const id of [66, 67, 68, 69, 70, 75, 128, 246, 260, 298,
      312, 313, 427, 438, 441, 442, 444, 456, 484, 527]) {
      const clip = doorClip(id, table)
      // 표에 없으면 여기서 200ms가 나온다 — 그러면 배선이 끊긴 것이다
      expect(clip.openMs, `소품 ${String(id)}`).not.toBe(200)
      expect(clip.openMs).toBeGreaterThan(0)
    }
  })
})
