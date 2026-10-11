import { expect, it } from 'vitest'
import { mergeTiles } from './seaFill'

it('이어진 칸은 한 직사각형으로, 같은 폭의 줄은 아래로 쌓인다', () => {
  const tiles: [number, number][] = []
  for (let z = 5; z < 8; z++) for (let x = 2; x < 6; x++) tiles.push([x, z])
  expect(mergeTiles(tiles)).toEqual([{ x: 2, z: 5, w: 4, h: 3 }])
})

it('떨어진 칸은 따로이고 넓이 합이 칸 수와 같다', () => {
  const tiles: [number, number][] = [[0, 0], [1, 0], [5, 0], [5, 1], [0, 1]]
  const rects = mergeTiles(tiles)
  expect(rects.reduce((n, r) => n + r.w * r.h, 0)).toBe(5)
})
