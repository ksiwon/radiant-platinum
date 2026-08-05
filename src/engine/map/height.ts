// 지면 높이 질의 (DATA.md §2.2)
//
// 판(plate)은 사각형 + 평면 방정식이다. 사각형 안의 점 `(x, z)`의 높이는
// `-(nx·x + nz·z + d) / ny`이고 전부 타일 척도다.
//
// **같은 자리를 여러 판이 덮을 수 있다.** 다리와 그 밑이 그렇고(216번도로)
// 실측 666개 청크 중 81개가 그렇다. 그때는 지금 높이에 가장 가까운 판을 고른다 —
// 원작도 같은 규칙이고, 그게 없으면 다리를 건널 때 갑자기 밑으로 떨어진다.
//
// 색인은 안 만든다. 질의는 플레이어가 서 있는 청크 하나 안에서만 일어나고 그
// 안의 판이 최대 1033개라, 프레임당 사각형 검사 1033번은 무시할 비용이다.

/** 추출 산출물을 편 것. `bdhc.json` + `bdhc.bin`이 이 모양으로 들어온다 */
export interface HeightData {
  /** `[nx, ny, nz, d]` — 전역 321종. 판은 색인으로 가리킨다 */
  planes: readonly (readonly [number, number, number, number])[]
  /** land_data 청크 번호로 색인한 `[시작 판 번호, 개수]` */
  chunks: readonly (readonly [number, number])[]
  /** 판마다 `x1, z1, x2, z2` 넷. 20.12 고정소수점이라 `fixedPerTile`로 나눈다 */
  coords: Int32Array
  /** 판마다 평면 색인 하나 */
  refs: Uint16Array
  fixedPerTile: number
}

/**
 * 높이 데이터는 하나뿐이라 여기 둔다.
 *
 * `MapGrid`는 행렬마다 생기는데(오버월드 1 + 실내 269) 높이는 **land_data 청크
 * 단위**라 전 행렬이 같은 표를 본다. 격자마다 사본을 들려 주면 같은 것이 270벌
 * 생긴다. `encounters.tables`·`activeZone`과 같은 방식이다.
 */
export const heightField = { data: null as HeightData | null }

/**
 * 청크 안 한 점의 지면 높이. 판이 없으면 null이다.
 *
 * `x`, `z`는 **청크 원점 기준 타일 좌표**(0~32)다 — 추출기가 중심 기준을
 * 원점 기준으로 옮겨 놓았다.
 *
 * `near`는 지금 높이다. 겹친 판 중에 이것과 가장 가까운 것을 고른다
 */
export function heightInChunk(land: number, x: number, z: number, near: number): number | null {
  const data = heightField.data
  if (!data) return null
  const span = data.chunks[land]
  if (!span) return null
  const [start, count] = span

  const s = data.fixedPerTile
  let best: number | null = null
  let bestGap = Infinity

  for (let i = 0; i < count; i++) {
    const o = (start + i) * 4
    const ax = data.coords[o]! / s
    const az = data.coords[o + 1]! / s
    const bx = data.coords[o + 2]! / s
    const bz = data.coords[o + 3]! / s
    // 판의 두 점은 좌상·우하로 정렬돼 있지 않다. 원작 로더도 매번 정렬한다
    if (x < Math.min(ax, bx) || x > Math.max(ax, bx)) continue
    if (z < Math.min(az, bz) || z > Math.max(az, bz)) continue

    const plane = data.planes[data.refs[start + i]!]
    if (!plane) continue
    const [nx, ny, nz, d] = plane
    if (ny === 0) continue // 수직면 위에는 설 수 없다
    const y = -(nx * x + nz * z + d) / ny
    const gap = Math.abs(y - near)
    if (gap < bestGap) {
      bestGap = gap
      best = y
    }
  }
  return best
}
