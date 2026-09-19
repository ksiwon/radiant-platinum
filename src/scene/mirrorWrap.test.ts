// Scale2x가 **거울 반복 경계를 거울로 읽는다** (지시서 R4).
//
// `sliceTexture`는 래핑 모드를 boolean 하나로 접어 넘기고 있었다 — 「Clamp가
// 아닌가」만 봤으므로 `MirroredRepeatWrapping`이 `Repeat`과 똑같이 처리됐다.
// 거울 경계 **바로 바깥**의 이웃은 반대쪽 끝이 아니라 **경계 화소 자신**이다.
//
// ⚠️ **±1 이웃에서는 거울과 붙잡기가 같은 자리를 가리킨다.** Scale2x가 보는 것이
// 상하좌우 하나씩뿐이라 그렇다 — 그래서 아래 fixture에서 `mirror`와 `clamp`의
// 출력이 같고 `repeat`만 갈린다. 거울이 정말 2N 주기로 접히는지는
// `wrapCoord`를 따로 재서 확인한다.
import { describe, expect, it } from 'vitest'
import { scale2x, wrapCoord, wrapModeOf } from './chunkMesh'

/**
 * 경계 하나로 세 모드가 갈리게 짠 4×4.
 *
 * (0,1)의 왼쪽 이웃이 어디냐가 이 판의 전부다 — 반복이면 (3,1)의 9,
 * 거울·붙잡기면 (0,1) 자신의 0이다. 그 한 칸이 Scale2x의 계단 규칙을 켜고 끈다
 */
const GRID = [
  [9, 0, 0, 0],
  [0, 0, 0, 9],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
]

function fixture(): Uint8Array<ArrayBuffer> {
  const px = new Uint8Array(4 * 4 * 4)
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const o = (y * 4 + x) * 4
      px[o] = GRID[y]![x]!
      px[o + 3] = 255
    }
  }
  return px as Uint8Array<ArrayBuffer>
}

const redAt = (px: Uint8Array, w: number, x: number, y: number): number =>
  px[(y * w + x) * 4]!

describe('축마다 래핑 모드를 그대로 쓴다', () => {
  it('거울 좌표는 길이 2N 주기로 접힌다', () => {
    // −1과 0, N−1과 N이 같은 화소여야 이음매가 안 생긴다
    expect(wrapCoord(-1, 4, 'mirror')).toBe(0)
    expect(wrapCoord(4, 4, 'mirror')).toBe(3)
    expect(wrapCoord(-2, 4, 'mirror')).toBe(1)
    expect(wrapCoord(5, 4, 'mirror')).toBe(2)
    // 주기는 2N이다 — 2N 뒤에는 처음으로 돌아온다
    for (let x = -12; x <= 12; x++) {
      expect(wrapCoord(x + 8, 4, 'mirror')).toBe(wrapCoord(x, 4, 'mirror'))
    }
    // ⚠️ **붙잡기와는 다른 함수다.** ±1에서만 우연히 같다
    expect(wrapCoord(6, 4, 'mirror')).toBe(1)
    expect(wrapCoord(6, 4, 'clamp')).toBe(3)
  })

  it('반복은 N 주기, 붙잡기는 양끝에서 멈춘다', () => {
    expect(wrapCoord(-1, 4, 'repeat')).toBe(3)
    expect(wrapCoord(4, 4, 'repeat')).toBe(0)
    expect(wrapCoord(-1, 4, 'clamp')).toBe(0)
    expect(wrapCoord(9, 4, 'clamp')).toBe(3)
  })

  it('`rep` 비트가 세 모드로 갈린다', () => {
    expect(wrapModeOf(false, false)).toBe('clamp')
    expect(wrapModeOf(false, true)).toBe('clamp')
    expect(wrapModeOf(true, false)).toBe('repeat')
    expect(wrapModeOf(true, true)).toBe('mirror')
  })
})

describe('거울 경계가 반대쪽 끝을 안 읽는다', () => {
  const mirrored = scale2x(fixture(), 4, 4, 'mirror', 'mirror')
  const repeated = scale2x(fixture(), 4, 4, 'repeat', 'repeat')
  const clamped = scale2x(fixture(), 4, 4, 'clamp', 'clamp')

  it('경계 바로 바깥에서 갈린다 — (0,2)와 (7,1)', () => {
    // 반복은 왼쪽 이웃을 반대쪽 끝에서 읽어 계단을 깎는다
    expect(redAt(repeated, 8, 0, 2), '반복 경로가 바뀌었다').toBe(9)
    expect(redAt(repeated, 8, 7, 1), '반복 경로가 바뀌었다').toBe(9)
    // 거울은 안 깎는다 — 그 자리의 이웃이 경계 화소 자신이라서다
    expect(redAt(mirrored, 8, 0, 2), '거울 경계를 여전히 반복으로 읽는다').toBe(0)
    expect(redAt(mirrored, 8, 7, 1), '거울 경계를 여전히 반복으로 읽는다').toBe(0)
  })

  it('거울과 붙잡기는 ±1 이웃에서 같은 그림이다', () => {
    expect(Array.from(mirrored)).toEqual(Array.from(clamped))
  })

  it('X와 Y가 따로 논다', () => {
    // 세로만 반복으로 바꾸면 (1,1)이 갈린다 — boolean 하나로 접으면 이 둘이
    // 영영 같아진다
    const mixed = scale2x(fixture(), 4, 4, 'mirror', 'repeat')
    expect(redAt(mirrored, 8, 1, 1)).toBe(0)
    expect(redAt(mixed, 8, 1, 1), '세로 모드가 따로 안 먹는다').toBe(9)
  })

  it('두 번 키워도 같은 모드다', () => {
    const twice = scale2x(mirrored, 8, 8, 'mirror', 'mirror')
    expect(twice.length).toBe(16 * 16 * 4)
    // 경계 바깥을 반대쪽 끝에서 읽으면 왼쪽 위 구석에 다른 색이 스며든다
    expect(redAt(twice, 16, 0, 0)).toBe(9)
    expect(redAt(twice, 16, 15, 15)).toBe(0)
  })

  it('투명 텍셀도 한 색으로 친다', () => {
    const px = fixture()
    for (let y = 0; y < 4; y++) px[y * 4 * 4 + 3] = 0  // 왼쪽 한 줄만 투명
    const got = scale2x(px, 4, 4, 'mirror', 'mirror')
    // 투명한 줄이 확대 뒤에도 투명하다 — 반투명 테두리가 안 생긴다
    expect(got[3]).toBe(0)
    expect(got[7]).toBe(0)
  })
})
