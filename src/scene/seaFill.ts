// 바다 빈칸 메우기의 순수 부분 — DS가 물로 적은 칸에서 BDSP 지역이 덮은 칸을 뺀 칸들을 가로로 긴 직사각형으로 묶는다
//
// 아직 화면에 안 건다. 묶은 직사각형마다 BDSP 바다 재질(`SeaWater`)을 나눠 쓰는 판 하나씩을 까는 것이 계획이다
// (셰이더를 같이 써서 파이프라인이 안 는다). 그리는 쪽은 화면으로 빈칸을 확인한 뒤에 잇는다
export interface TileRect { x: number, z: number, w: number, h: number }

/** 칸 목록을 겹치지 않는 직사각형으로 — 같은 z의 이어진 칸을 줄로 묶고, 같은 x · 폭의 줄을 아래로 쌓는다 */
export function mergeTiles(tiles: readonly (readonly [number, number])[]): TileRect[] {
  const rows = new Map<number, number[]>()
  for (const [x, z] of tiles) {
    const row = rows.get(z)
    if (row) row.push(x)
    else rows.set(z, [x])
  }
  const open = new Map<string, TileRect>()
  const out: TileRect[] = []
  for (const z of [...rows.keys()].sort((a, b) => a - b)) {
    const xs = [...new Set(rows.get(z)!)].sort((a, b) => a - b)
    const next = new Map<string, TileRect>()
    for (let i = 0; i < xs.length;) {
      let j = i
      while (j + 1 < xs.length && xs[j + 1] === xs[j]! + 1) j++
      const key = `${String(xs[i])}:${String(j - i + 1)}`
      const above = open.get(key)
      if (above && above.z + above.h === z) { above.h++; next.set(key, above); open.delete(key) }
      else next.set(key, { x: xs[i]!, z, w: j - i + 1, h: 1 })
      i = j + 1
    }
    for (const r of open.values()) out.push(r)
    open.clear()
    for (const [k, r] of next) open.set(k, r)
  }
  for (const r of open.values()) out.push(r)
  return out
}
