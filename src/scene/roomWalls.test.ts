// **실내 앞벽을 세운다** (DATA.md §2.2).
//
// 원작 실내는 카메라가 고정이라 안 보이는 쪽 벽을 안 만들었다 — 문이 있는 앞벽이
// 그렇고, 우리 화면에서는 그 자리가 통째로 검다. 여기서 보는 것은 셋이다:
// **바닥이 끝나는데 벽이 없는 자리에만** 세우는가 · **출입구에 문 모양 구멍을
// 남기는가** · 베낄 벽이 없으면 **안 지어내는가**.
import { describe, expect, it } from 'vitest'
import { BufferAttribute, BufferGeometry } from 'three'
import { floorRegions, roomWalls, tileKey, type RoomWalls } from './roomWalls'
import { cellKey, type Split } from './plates'

/**
 * 시험용 방 하나.
 *
 * 바닥은 `w × d` 칸이고, 북쪽(z = 0)에만 벽이 한 장 서 있다. 그래서 열린 쪽은
 * 동·서·남 세 방향이다.
 *
 * `west`를 주면 서쪽(x = 0)에도 벽이 선다 — 북쪽이 통째로 빈 방을 만들면서
 * **베낄 벽은 남겨 두려고** 쓴다
 */
function room(
  w: number, d: number, withWall = true,
  north: [number, number][] = [[0, 4]], gap = -1,
  west: [number, number][] = [],
): Split {
  const pos: number[] = []
  const uv: number[] = []
  const col: number[] = []
  const index: number[] = []
  const push = (
    quad: readonly [number, number, number][], uvs: readonly [number, number][],
  ): void => {
    const base = pos.length / 3
    for (const [i, p] of quad.entries()) {
      pos.push(p[0], p[1], p[2])
      uv.push(uvs[i]![0], uvs[i]![1])
      col.push(1, 1, 1)
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  // 바닥 — 칸마다 한 장
  for (let tz = 0; tz < d; tz++) {
    for (let tx = 0; tx < w; tx++) {
      push([[tx, 0, tz], [tx + 1, 0, tz], [tx + 1, 0, tz + 1], [tx, 0, tz + 1]],
        [[0, 0], [1, 0], [1, 1], [0, 1]])
    }
  }
  const floorCount = index.length
  // 북쪽 벽 — z = 0에 세로로. `north`가 그 벽이 덮는 높이 구간들이다.
  // `gap`은 그 벽에서 **빠뜨릴 칸**이다 (거기만 벽이 없는 방을 만든다)
  if (withWall) {
    for (const [y0, y1] of north) {
      for (let tx = 0; tx < w; tx++) {
        if (tx === gap) continue
        push([[tx, y0, 0], [tx + 1, y0, 0], [tx + 1, y1, 0], [tx, y1, 0]],
          [[0, 1], [1, 1], [1, 0], [0, 0]])
      }
    }
    for (const [y0, y1] of west) {
      for (let tz = 0; tz < d; tz++) {
        push([[0, y0, tz], [0, y0, tz + 1], [0, y1, tz + 1], [0, y1, tz]],
          [[0, 1], [1, 1], [1, 0], [0, 0]])
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
  geometry.setIndex(index)
  const groups: [number, number, number][] = withWall
    ? [[0, floorCount, 0], [floorCount, index.length - floorCount, 1]]
    : [[0, floorCount, 0]]
  return { cells: new Map(), shadows: new Set(), geometry, groups }
}

/**
 * 북쪽(z = 0)에 세운 판이 덮는 높이 범위.
 *
 * **삼각형 단위로 고른다** — 서·동쪽 판도 귀퉁이 정점이 z = 0에 있어서, 정점만
 * 보면 그쪽 높이까지 섞인다
 */
function northBand(built: RoomWalls): [number, number] {
  const pos = built.geometry.getAttribute('position') as BufferAttribute
  let lo = Infinity, hi = -Infinity
  for (let t = 0; t + 3 <= pos.count; t += 3) {
    if (Math.abs(pos.getZ(t)) > 1e-6 || Math.abs(pos.getZ(t + 1)) > 1e-6
      || Math.abs(pos.getZ(t + 2)) > 1e-6) continue
    for (let i = t; i < t + 3; i++) {
      lo = Math.min(lo, pos.getY(i))
      hi = Math.max(hi, pos.getY(i))
    }
  }
  return [lo, hi]
}

describe('원작이 안 만든 실내 벽을 세운다', () => {
  it('바닥이 끝나는데 벽이 없는 자리에만 세운다', () => {
    // 3×3 방. 북쪽에 벽이 있으므로 열린 것은 동 3 · 서 3 · 남 3 = 아홉 자리다
    const built = roomWalls(room(3, 3))
    expect(built).not.toBeNull()
    expect(built!.count, '북쪽은 이미 벽이 있으므로 아홉이다').toBe(9)
  })

  it('문간을 안 알려 주면 예전처럼 다 메운다', () => {
    const built = roomWalls(room(3, 3))!
    expect(built.count, '동 3 · 서 3 · 남 3').toBe(9)
    const pos = built.geometry.getAttribute('position') as BufferAttribute
    let lowest = Infinity
    for (let i = 0; i < pos.count; i++) lowest = Math.min(lowest, pos.getY(i))
    expect(lowest, '발치까지 선다').toBeCloseTo(0, 6)
  })

  /**
   * ⚠️ **문간을 다 메우면 문이 사라진다.** 파일럿 보고(2026-09-22): 「건물 내부
   * 문 쪽에는 벽이 없이 뚫려 있어야 하는데 어색하게 문 쪽 벽이 메워져 있다」.
   * 실측으로 집 1층(맵 414) 문간 (8,12)에서 남쪽을 보면 줄무늬 벽 한 장뿐이었고,
   * 그 판을 숨기면 뒤가 `#000001`이다 — 원작에는 거기 아무것도 없다
   * (`pnpm shot door --eye=8.5,3,7 --gaze=8.5,1.2,13 --blame=400,350`).
   *
   * 통째로 비우는 것도 답이 아니다 — 그때는 문간에 선 사람의 정면이 통째로
   * 검다. 그래서 **발치만** 비워 인방을 남긴다
   */
  it('문간에는 문 높이만큼 구멍을 남긴다 — 인방은 남는다', () => {
    const door = cellKey(1, 2) // 남쪽 줄 가운데 칸
    const built = roomWalls(room(3, 3), undefined, new Set([door]))!
    expect(built.count, '판 수는 그대로다 — 낮아질 뿐 사라지지 않는다').toBe(9)
    const pos = built.geometry.getAttribute('position') as BufferAttribute
    /**
     * z=3 선 위, 한가운데(x 1~2)에 걸친 판이 문간이다. 나머지는 그냥 벽.
     *
     * ⚠️ **꼭짓점 하나로 가르면 안 된다** — x=1은 문간 판과 그 옆 판이 함께
     * 쓰는 꼭짓점이라, 옆 판의 발치가 문간 것으로 세어진다
     */
    let doorLow = Infinity, wallLow = Infinity, doorHigh = -Infinity
    for (let t = 0; t < pos.count; t += 3) {
      const mx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3
      const mz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3
      const ys = [pos.getY(t), pos.getY(t + 1), pos.getY(t + 2)]
      if (Math.abs(mz - 3) < 1e-6 && mx > 1 && mx < 2) {
        doorLow = Math.min(doorLow, ...ys)
        doorHigh = Math.max(doorHigh, ...ys)
      } else wallLow = Math.min(wallLow, ...ys)
    }
    expect(doorLow, '문 높이까지는 비어 있다').toBeCloseTo(2.25, 6)
    expect(doorHigh, '그 위로는 인방이 이어진다').toBeCloseTo(4, 6)
    expect(wallLow, '옆 칸은 발치까지 서서 문설주가 된다').toBeCloseTo(0, 6)
  })

  it('베낄 벽이 하나도 없으면 안 지어낸다', () => {
    expect(roomWalls(room(3, 3, false)),
      '벽 그림이 없는 방에 우리가 벽을 만들어 붙이지 않는다').toBeNull()
  })

  it('안쪽을 보고, 바닥에서 벽 높이까지 서고, UV가 타일 안에 있다', () => {
    const built = roomWalls(room(3, 3))!
    const pos = built.geometry.getAttribute('position') as BufferAttribute
    const nrm = built.geometry.getAttribute('normal') as BufferAttribute
    const uv = built.geometry.getAttribute('uv') as BufferAttribute
    let lowest = Infinity, highest = -Infinity
    for (let i = 0; i < pos.count; i++) {
      lowest = Math.min(lowest, pos.getY(i))
      highest = Math.max(highest, pos.getY(i))
      // 세로면이라 법선의 y는 0이고, 방 안쪽(가운데)을 봐야 한다
      expect(nrm.getY(i)).toBe(0)
      const away = nrm.getX(i) * (pos.getX(i) - 1.5) + nrm.getZ(i) * (pos.getZ(i) - 1.5)
      expect(away, '벽이 바깥을 보면 방 안에서 안 보인다').toBeLessThanOrEqual(0)
      expect(uv.getX(i)).toBeGreaterThanOrEqual(-0.001)
      expect(uv.getX(i)).toBeLessThanOrEqual(1.001)
      expect(uv.getY(i)).toBeGreaterThanOrEqual(-0.001)
      expect(uv.getY(i)).toBeLessThanOrEqual(1.001)
    }
    expect(lowest).toBeCloseTo(0, 6)
    // 이 방의 벽이 4타일이므로 세운 것도 그만큼이다 (`MIN_HEIGHT` 3보다 높다)
    expect(highest).toBeCloseTo(4, 6)
  })

  /**
   * ⚠️ **여기가 제일 중요하다 — 법선 속성이 아니라 감는 순서가 앞뒤를 정한다.**
   *
   * 위 시험은 `normal` 속성만 봤고, 그것만 맞으면 통과했다. 그런데 GPU도
   * 광선도 **감는 순서**로 앞뒤를 가른다 — 셰이딩 법선은 「그려질 때」만 쓴다.
   * 둘이 어긋나면 벽이 화면에서 그냥 **사라진다**. 실제로 x쪽(동·서) 벽이
   * 거꾸로 감겨 있었고, 주인공 방에서 동쪽으로 쏜 광선 526발이 벽을 그대로
   * 통과했다 (`holes --eyes`). 시험은 그동안 초록이었다
   */
  it('감는 순서도 안쪽을 본다 — 법선 속성과 어긋나면 화면에서 사라진다', () => {
    const built = roomWalls(room(3, 3))!
    const pos = built.geometry.getAttribute('position') as BufferAttribute
    const nrm = built.geometry.getAttribute('normal') as BufferAttribute
    expect(pos.count % 3, '삼각형 단위로 떨어져야 한다').toBe(0)
    for (let t = 0; t < pos.count; t += 3) {
      const ax = pos.getX(t), ay = pos.getY(t), az = pos.getZ(t)
      const bx = pos.getX(t + 1) - ax, by = pos.getY(t + 1) - ay, bz = pos.getZ(t + 1) - az
      const cx = pos.getX(t + 2) - ax, cy = pos.getY(t + 2) - ay, cz = pos.getZ(t + 2) - az
      // 감는 순서에서 나오는 기하 법선
      const gx = by * cz - bz * cy
      const gy = bz * cx - bx * cz
      const gz = bx * cy - by * cx
      const len = Math.hypot(gx, gy, gz)
      expect(len, '납작한 삼각형은 없다').toBeGreaterThan(1e-6)
      // 적어 둔 법선과 같은 쪽을 봐야 한다
      const dot = (gx * nrm.getX(t) + gy * nrm.getY(t) + gz * nrm.getZ(t)) / len
      expect(dot, `삼각형 ${String(t / 3)}의 감는 순서가 법선과 반대다`).toBeGreaterThan(0.9)
      // 그리고 그 쪽이 방 안(가운데)이어야 한다
      const away = (gx / len) * (ax - 1.5) + (gz / len) * (az - 1.5)
      expect(away, `삼각형 ${String(t / 3)}이 바깥을 본다`).toBeLessThanOrEqual(0.001)
    }
  })

  /**
   * ⚠️ **덮는 높이로 봐야 한다 — 「세로 면이 있다」로는 모자란다.**
   *
   * 실측 (`pnpm holes --eyes`, 눈높이 24방향): 주인공 방 북쪽 모서리의 덮는
   * 높이가 `-0.1~4.3`이라 넉넉해 보였지만, 그것은 **낮은 굽도리와 높은 지붕의
   * 최소·최대**를 붙여 놓은 것이라 가운데 2.3~2.9m가 비어 있었다. 광선 아홉
   * 발이 그리로 나갔다. 무쇠광산·천관산은 벽이 바닥+2.8에서 끝나 363발이 샜다
   */
  it('굽도리와 지붕만 있고 가운데가 비면 그 사이를 메운다', () => {
    // 북쪽에 굽도리(0~0.2)와 지붕(4~4.3)만 있다. 그 사이 0.2~4가 구멍이다
    const built = roomWalls(room(3, 3, true, [[0, 0.2], [4, 4.3]]))!
    expect(built.count, '동·서·남 아홉에 북쪽 셋이 더 붙는다').toBe(12)
    const [lo, hi] = northBand(built)
    expect(lo, '굽도리 꼭대기에서 시작한다').toBeCloseTo(0.2, 6)
    expect(hi, '지붕 밑까지 올라간다').toBeCloseTo(4, 6)
  })

  it('벽이 눈높이보다 낮으면 그 위만 잇는다', () => {
    // 굴처럼 사방이 막혔는데 북쪽만 2.8타일이다. `MIN_HEIGHT` 3까지 0.2가 뜬다
    const built = roomWalls(room(3, 3, true, [[0, 2.8]]))!
    expect(built.count, '아홉에 북쪽 셋').toBe(12)
    const [lo, hi] = northBand(built)
    expect(lo).toBeCloseTo(2.8, 6)
    expect(hi).toBeCloseTo(3, 6)
  })

  /**
   * ⚠️ **발치에만 있는 면은 벽이 아니다.**
   *
   * 깨어진 세계의 뜬 발판은 바닥이 단으로 끝나고 옆면이 **아래로만** 뻗는다.
   * 그것을 「벽이 없다」로 보면 발판마다 3타일 상자가 씌워진다 — 274자리가
   * 그렇다 (`pnpm holes`, 맵 573)
   */
  it('바닥 밑으로만 뻗은 옆면에는 안 세운다 — 뜬 발판을 상자로 만들지 않는다', () => {
    const built = roomWalls(room(3, 3, true, [[-2, 0]]))
    expect(built?.count ?? 0, '북쪽은 단이 내려가는 자리다. 아홉 그대로다').toBe(9)
  })

  /**
   * ⚠️ **발치만 덮인 자리는 옆을 보고 갈린다.**
   *
   * 기하만 보면 「올라선 방바닥의 앞벽이 빠진 것」과 「뜬 발판」이 똑같다 —
   * 둘 다 옆면이 발치에만 있다. 그래서 잇닿은 모서리를 본다. 실측으로 도서관
   * 남쪽 셋(9·13·17,11)이 이 꼴이었고 광선 107발이 그리로 샜다. 위 시험의
   * 발판(옆도 발치뿐)과 짝이다
   */
  it('옆에 제대로 선 벽이 있으면 발치만 덮인 자리도 메운다 — 벽에 난 구멍이다', () => {
    // 북쪽 벽이 가운데 한 칸(tx = 1)만 빠졌고, 그 자리는 발치 단만 있다
    const split = room(3, 3, true, [[0, 4]], 1)
    // 빠진 칸에 **바닥 밑으로만** 뻗는 옆면을 하나 붙인다
    const pos = split.geometry.getAttribute('position') as BufferAttribute
    const uv = split.geometry.getAttribute('uv') as BufferAttribute
    const col = split.geometry.getAttribute('color') as BufferAttribute
    const idx = Array.from(split.geometry.getIndex()!.array)
    const p = Array.from(pos.array)
    const u = Array.from(uv.array)
    const c = Array.from(col.array)
    const base = p.length / 3
    for (const [x, y, z] of [[1, -2, 0], [2, -2, 0], [2, 0, 0], [1, 0, 0]]) {
      p.push(x, y, z); u.push(0, 0); c.push(1, 1, 1)
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(p), 3))
    g.setAttribute('uv', new BufferAttribute(new Float32Array(u), 2))
    g.setAttribute('color', new BufferAttribute(new Float32Array(c), 3))
    g.setIndex(idx)
    const groups = split.groups.map((gr) => [...gr] as [number, number, number])
    groups[groups.length - 1]![1] += 6
    const built = roomWalls({ ...split, geometry: g, groups })!
    expect(built.count, '아홉에 빠진 북쪽 한 칸이 더 붙는다').toBe(10)
    const [lo, hi] = northBand(built)
    expect(lo, '바닥에서 시작한다').toBeCloseTo(0, 6)
    expect(hi, '옆 벽 높이까지 올라간다').toBeCloseTo(4, 6)
  })

  /**
   * ⚠️ **옆이 「끝내 서는가」를 물어야 한다 — 「원작에 벽이 있는가」가 아니다.**
   *
   * 도서관 남쪽이 그 반례다. 발치만 덮인 셋(9·13·17,11) 양옆은 원작에 벽이
   * 아예 없어서 **우리가 세우는** 자리라, 원작만 보면 옆도 비었으니 안 세우게
   * 된다. 실측으로 그 상태에서 눈높이 광선 108발이 그 셋으로 샜다
   */
  it('옆이 우리가 세울 자리여도 발치만 덮인 데를 메운다 — 도서관 남쪽이다', () => {
    // 북쪽은 통째로 비었고(원작이 안 만들었다) 서쪽에만 벽이 있다.
    // 그 북쪽 가운데 칸에 **바닥 밑으로만** 뻗는 단을 하나 붙인다
    const split = room(3, 3, true, [], -1, [[0, 4]])
    const pos = split.geometry.getAttribute('position') as BufferAttribute
    const uv = split.geometry.getAttribute('uv') as BufferAttribute
    const col = split.geometry.getAttribute('color') as BufferAttribute
    const idx = Array.from(split.geometry.getIndex()!.array)
    const p = Array.from(pos.array)
    const u = Array.from(uv.array)
    const c = Array.from(col.array)
    const base = p.length / 3
    for (const [x, y, z] of [[1, -2, 0], [2, -2, 0], [2, 0, 0], [1, 0, 0]]) {
      p.push(x, y, z); u.push(0, 0); c.push(1, 1, 1)
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(p), 3))
    g.setAttribute('uv', new BufferAttribute(new Float32Array(u), 2))
    g.setAttribute('color', new BufferAttribute(new Float32Array(c), 3))
    g.setIndex(idx)
    const groups = split.groups.map((gr) => [...gr] as [number, number, number])
    groups[groups.length - 1]![1] += 6
    const built = roomWalls({ ...split, geometry: g, groups })!
    // 북 3 · 동 3 · 남 3. 서쪽은 벽이 있다
    expect(built.count, '발치만 덮인 가운데 칸도 같이 선다').toBe(9)
    const [lo, hi] = northBand(built)
    expect(lo, '바닥에서 시작한다').toBeCloseTo(0, 6)
    expect(hi, '옆에 세우는 판과 같은 높이다').toBeCloseTo(4, 6)
  })

  it('세운 판은 청크 재질을 그대로 쓴다 — 벽 그림을 베껴 왔으므로', () => {
    const built = roomWalls(room(3, 3))!
    // 서브메시 1이 벽이다. 세운 판도 그 번호로 그려져야 같은 그림이 붙는다
    expect(built.groups.map((g) => g[2])).toEqual([1])
  })

  it('바닥이 없으면 아무것도 안 세운다', () => {
    const empty: Split = {
      cells: new Map(), shadows: new Set(), geometry: new BufferGeometry(), groups: [],
    }
    expect(roomWalls(empty)).toBeNull()
  })

  it('셀 열쇠가 청크 로컬 좌표 범위를 벗어나지 않는다', () => {
    // `cellKey`는 −128~383만 담는다. 방이 그 밖으로 나가면 열쇠가 겹친다
    expect(cellKey(0, 0)).not.toBe(cellKey(1, 0))
  })
})

// **방 상자는 걸어 다니는 칸으로 가른다** (REPAIR §13)
//
// 카메라를 방 안으로 물리는 상자다. 그려진 바닥을 통째로 감싸면 방에서 떨어진
// 바닥 한 칸이 상자를 부풀리고, 그 여유만큼 카메라가 벽을 지나 밖으로 나간다.
describe('방 나누기', () => {
  /** `#`는 막힌 칸, `.`는 걸어 다니는 칸, 빈칸은 바닥이 없는 자리 */
  const parse = (rows: string[]): { tiles: number[], blocked: (x: number, z: number) => boolean } => {
    const wall = new Set<number>()
    const tiles: number[] = []
    rows.forEach((row, z) => {
      [...row].forEach((ch, x) => {
        if (ch === ' ') return
        tiles.push(tileKey(x, z))
        if (ch === '#') wall.add(tileKey(x, z))
      })
    })
    return { tiles, blocked: (x, z) => wall.has(tileKey(x, z)) }
  }
  const boxes = (rows: string[]): number[][] => {
    const { tiles, blocked } = parse(rows)
    return floorRegions(tiles, blocked)
      .map((r) => [r.minX, r.minZ, r.maxX, r.maxZ])
      .sort((a, b) => (a[0]! - b[0]!) || (a[1]! - b[1]!))
  }

  it('벽으로 갈린 두 방은 따로 잡힌다', () => {
    expect(boxes([
      '#####',
      '#.#.#',
      '#.#.#',
      '#####',
    ])).toEqual([[0, 0, 3, 4], [2, 0, 5, 4]])
  })

  it('⚠️ 벽 밑에도 바닥이 있어서 「이어진 바닥」만으로는 안 갈라진다', () => {
    // 맵 89가 이 꼴이다 — 방 밖 바닥 371칸이 벽 밑을 지나 방과 한 덩어리로
    // 이어져서, 막힌 칸을 안 보면 상자가 25×19가 된다
    const rows = [
      '.......',
      '.#####.',
      '.#...#.',
      '.#...#.',
      '.#####.',
      '.......',
    ]
    const { tiles, blocked } = parse(rows)
    // 막힌 칸을 안 보면 (= 옛 잣대) 통째로 한 덩어리다
    expect(floorRegions(tiles, () => false)).toHaveLength(1)
    // 보면 방과 바깥이 갈린다. 방 상자는 벽 한 겹까지다 (x 1~5 · z 1~4)
    expect(floorRegions(tiles, blocked).map((r) => [r.minX, r.minZ, r.maxX, r.maxZ]))
      .toContainEqual([1, 1, 6, 5])
  })

  it('막힌 칸은 테두리에만 들고 그 너머로는 안 번진다', () => {
    // 벽 한 겹은 방의 일부다 — 카메라가 그 위에 서도 발밑이 바닥이다.
    // ⚠️ 빼 봤더니 포켓몬센터 문 앞에서 카메라와 주인공 사이가 반 칸이 됐다.
    // 하지만 벽 **너머**의 바닥은 이 방이 아니다
    const [room] = boxes([
      '.#.',
      '.#.',
    ])
    expect(room).toEqual([0, 0, 2, 2])
  })

  it('바닥이 하나도 없으면 방도 없다', () => {
    expect(floorRegions([], () => false)).toEqual([])
  })
})

/**
 * **메운 구멍 — 원작이 덮는 띠에는 안 세운다.**
 *
 * 계단이 내려가느라 그 앞 칸에 바닥 삼각형이 없으면 `fillHoles`가 방의 일부로
 * 메운다. 한동안 그 칸의 바깥 모서리를 **원작이 덮든 말든** 바닥부터 꼭대기까지
 * 세웠고, 그러면 원작 벽 **앞에** 판이 한 장 더 선다 — 파일럿 보고(2026-09-22):
 * 「벽에서 띄워진 채로 벽에 평행하게 판때기 하나가 세워져 있는 것 같다」.
 *
 * 실측(주인공 방 맵 415 · `pnpm shot room --hit=600,130 --blame=600,130`):
 * 우리 판이 `z = 4.0`, 원작 벽이 `z = 3.6`이라 0.4칸 앞에 섰고, 숨기면
 * 올리브(`#97915e`)가 나왔다 — 곧 원작 벽이 이미 그려지는 자리였다.
 */
describe('메운 구멍', () => {
  /**
   * 바닥 3×4에서 **(1,0) 한 칸이 없는** 방 — 구멍이 방의 **가장자리**에 있다.
   *
   * ⚠️ **한가운데에 구멍을 내면 이 갈래를 못 잰다.** 네 이웃이 다 바닥이면
   * 그 칸에는 바깥 모서리가 없어서 판을 아예 안 세운다. 계단 자리가 그렇듯
   * 구멍은 벽에 붙어 있어야 한다.
   *
   * 북쪽 벽(`z = 0` 선)의 `x = 1` 조각이 **구멍 너머**다 — `beyond`가 그 조각이
   * 덮는 높이 구간이고, 그것이 「눈높이에 걸친다」여야 `fillHoles`가 그 칸을
   * 방의 일부로 센다(`closedBeyond`)
   */
  function holed(beyond: [number, number][] = [[0, 4]]): Split {
    const pos: number[] = []
    const uv: number[] = []
    const col: number[] = []
    const index: number[] = []
    const push = (
      quad: readonly [number, number, number][], uvs: readonly [number, number][],
    ): void => {
      const base = pos.length / 3
      for (const [i, p] of quad.entries()) {
        pos.push(p[0], p[1], p[2])
        uv.push(uvs[i]![0], uvs[i]![1])
        col.push(1, 1, 1)
      }
      index.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
    for (let tz = 0; tz < 4; tz++) {
      for (let tx = 0; tx < 3; tx++) {
        if (tx === 1 && tz === 0) continue // 구멍 — 계단이 내려가는 자리
        push([[tx, 0, tz], [tx + 1, 0, tz], [tx + 1, 0, tz + 1], [tx, 0, tz + 1]],
          [[0, 0], [1, 0], [1, 1], [0, 1]])
      }
    }
    const floorCount = index.length
    // 북쪽 벽 (z = 0) — 구멍 아닌 칸은 바닥부터 4까지. 베낄 그림이 된다
    for (const tx of [0, 2]) {
      push([[tx, 0, 0], [tx + 1, 0, 0], [tx + 1, 4, 0], [tx, 4, 0]],
        [[0, 1], [1, 1], [1, 0], [0, 0]])
    }
    // 구멍 **너머**의 벽 (z = 0 선의 x = 1 조각)
    for (const [y0, y1] of beyond) {
      push([[1, y0, 0], [2, y0, 0], [2, y1, 0], [1, y1, 0]],
        [[0, 1], [1, 1], [1, 0], [0, 0]])
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
    geometry.setIndex(index)
    return {
      cells: new Map(), shadows: new Set(), geometry,
      groups: [[0, floorCount, 0], [floorCount, index.length - floorCount, 1]],
    }
  }

  /** `z = 0` 선 위, `x`가 1~2인 판이 몇 장인가 (삼각형 둘이 한 장이다) */
  function onBeyondLine(built: RoomWalls): number {
    const pos = built.geometry.getAttribute('position') as BufferAttribute
    let tris = 0
    for (let t = 0; t < pos.count; t += 3) {
      const mz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3
      const mx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3
      if (Math.abs(mz) < 0.05 && mx > 1 && mx < 2) tris++
    }
    return tris / 2
  }

  it('원작 벽이 그 띠를 다 덮으면 한 장도 안 세운다', () => {
    const built = roomWalls(holed())!
    expect(onBeyondLine(built), '원작 벽 앞에 판을 또 세우지 않는다').toBe(0)
  })

  it('⚠️ 그렇다고 안 세우는 것은 아니다 — 덜 덮으면 그 위를 메운다', () => {
    // 원작 벽이 바닥+2에서 끝나는 자리다. 안 메우면 그 위로 광선이 넘어간다
    // (무쇠탄갱이 그 모양이었다 — 벽이 2.8에서 끝나 202발이 샜다)
    const built = roomWalls(holed([[0, 2]]))!
    expect(onBeyondLine(built), '안 덮인 띠에는 세운다').toBeGreaterThan(0)
    const pos = built.geometry.getAttribute('position') as BufferAttribute
    let low = Infinity
    for (let t = 0; t < pos.count; t += 3) {
      const mz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3
      const mx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3
      if (Math.abs(mz) < 0.05 && mx > 1 && mx < 2) {
        low = Math.min(low, pos.getY(t), pos.getY(t + 1), pos.getY(t + 2))
      }
    }
    expect(low, '원작 벽이 끝나는 높이에서 시작한다').toBeCloseTo(2, 5)
  })
})
