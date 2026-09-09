// 격자의 속살이 **밖에서 안 보인다** (REPAIR §46)
//
// ⚠️ **재는 것은 「누가 이것을 펼칠 수 있는가」다.** `MapGrid`는 R3F 트리의
// prop으로 내려간다(`<ObjectProps grid={grid}>` · `<ChunkModels grid={grid}>`).
// R3F의 **개발 전용** 「Changed Props」 자국은 바뀐 prop을 한 겹씩 펼쳐
// `performance.measure`의 `detail`에 싣는데, 통행값 격자가 열거되는 속성이면
// 오버월드 **92만 칸**이 통째로 실린다.
//
// 실측(2026-09-09 `_land42` 13바퀴): `detail.devtools.properties`가
// **924,116개**였고 그 호출이 `Failed to execute 'measure' on 'Performance':
// Data cannot be cloned, out of memory.`로 터졌다. 예외가 R3F의 커밋 안에서
// 났고, 그 바퀴의 지형 요청은 `submitted`까지 갔는데 `committed`가 없었다 —
// 밖에서는 「지형이 안 온다」였다.
//
// ⚠️ **`private`로는 못 막는다.** 타입스크립트의 `private`는 컴파일하면
// 사라지는 약속이라 런타임에는 그냥 열거되는 속성이다. 진짜 사적 필드(`#`)만이
// 열거하는 쪽에 안 보인다.
import { describe, expect, it } from 'vitest'
import { MapGrid, type MatrixMeta } from './grid'

const meta: MatrixMeta = {
  id: 0, name: 'test', width: 2, height: 2, tileWidth: 64, tileHeight: 64,
  chunks: [{ i: 0, mx: 0, my: 0, land: 1, zone: 7 }], buildings: {},
}
const grid = () => new MapGrid(meta, new Uint16Array(64 * 64))

describe('격자를 prop으로 내려도 92만 칸이 안 펼쳐진다', () => {
  it('열거되는 속성에 격자가 없다', () => {
    const g = grid()
    expect(Object.keys(g)).toEqual(['meta'])
    // 상속받은 것까지 훑어도 마찬가지다 — `for...in`이 그렇게 돈다
    const seen = []
    for (const k in g) seen.push(k)
    expect(seen).toEqual(['meta'])
  })

  it('펼친 것의 크기가 칸 수를 안 따라간다', () => {
    // ⚠️ **이 수가 그때의 924,116이었다.** 칸이 늘어도 여기는 안 늘어야 한다
    const count = (o: object): number => Object.entries(o).reduce(
      (n, [, v]) => n + 1 + (v !== null && typeof v === 'object' ? count(v as object) : 0), 0)
    const small = count(grid())
    const big = new MapGrid(
      { ...meta, width: 4, height: 4, tileWidth: 128, tileHeight: 128 },
      new Uint16Array(128 * 128))
    expect(count(big)).toBe(small)
  })

  it('그래도 격자는 제대로 읽힌다 — 숨긴 것이지 잃은 것이 아니다', () => {
    const tiles = new Uint16Array(64 * 64)
    tiles[5 * 64 + 3] = 0x8000
    const g = new MapGrid(meta, tiles)
    expect(g.isBlocked(3, 5)).toBe(true)
    expect(g.isBlocked(4, 5)).toBe(false)
    expect(g.zoneAt(3, 5)).toBe(7)
  })
})
