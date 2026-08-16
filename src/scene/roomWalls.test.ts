// **실내 앞벽을 세운다** (DATA.md §2.2).
//
// 원작 실내는 카메라가 고정이라 안 보이는 쪽 벽을 안 만들었다 — 문이 있는 앞벽이
// 그렇고, 우리 화면에서는 그 자리가 통째로 검다. 여기서 보는 것은 셋이다:
// **바닥이 끝나는데 벽이 없는 자리에만** 세우는가 · **출입구는 비우는가** ·
// 베낄 벽이 없으면 **안 지어내는가**.
import { describe, expect, it } from 'vitest'
import { BufferAttribute, BufferGeometry } from 'three'
import { roomWalls, type RoomWalls } from './roomWalls'
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

const NO_DOOR = (): boolean => false

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
    const built = roomWalls(room(3, 3), NO_DOOR)
    expect(built).not.toBeNull()
    expect(built!.count, '북쪽은 이미 벽이 있으므로 아홉이다').toBe(9)
  })

  it('출입구는 비운다 — 막으면 못 나가고 문이 벽으로 덮인다', () => {
    const built = roomWalls(room(3, 3), (tx, tz) => tx === 1 && tz === 2)
    expect(built!.count, '남쪽 한 칸이 빠져 여덟이다').toBe(8)
  })

  it('베낄 벽이 하나도 없으면 안 지어낸다', () => {
    expect(roomWalls(room(3, 3, false), NO_DOOR),
      '벽 그림이 없는 방에 우리가 벽을 만들어 붙이지 않는다').toBeNull()
  })

  it('안쪽을 보고, 바닥에서 벽 높이까지 서고, UV가 타일 안에 있다', () => {
    const built = roomWalls(room(3, 3), NO_DOOR)!
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
    const built = roomWalls(room(3, 3), NO_DOOR)!
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
    const built = roomWalls(room(3, 3, true, [[0, 0.2], [4, 4.3]]), NO_DOOR)!
    expect(built.count, '동·서·남 아홉에 북쪽 셋이 더 붙는다').toBe(12)
    const [lo, hi] = northBand(built)
    expect(lo, '굽도리 꼭대기에서 시작한다').toBeCloseTo(0.2, 6)
    expect(hi, '지붕 밑까지 올라간다').toBeCloseTo(4, 6)
  })

  it('벽이 눈높이보다 낮으면 그 위만 잇는다', () => {
    // 굴처럼 사방이 막혔는데 북쪽만 2.8타일이다. `MIN_HEIGHT` 3까지 0.2가 뜬다
    const built = roomWalls(room(3, 3, true, [[0, 2.8]]), NO_DOOR)!
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
    const built = roomWalls(room(3, 3, true, [[-2, 0]]), NO_DOOR)
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
    const built = roomWalls({ ...split, geometry: g, groups }, NO_DOOR)!
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
    const built = roomWalls({ ...split, geometry: g, groups }, NO_DOOR)!
    // 북 3 · 동 3 · 남 3. 서쪽은 벽이 있다
    expect(built.count, '발치만 덮인 가운데 칸도 같이 선다').toBe(9)
    const [lo, hi] = northBand(built)
    expect(lo, '바닥에서 시작한다').toBeCloseTo(0, 6)
    expect(hi, '옆에 세우는 판과 같은 높이다').toBeCloseTo(4, 6)
  })

  it('세운 판은 청크 재질을 그대로 쓴다 — 벽 그림을 베껴 왔으므로', () => {
    const built = roomWalls(room(3, 3), NO_DOOR)!
    // 서브메시 1이 벽이다. 세운 판도 그 번호로 그려져야 같은 그림이 붙는다
    expect(built.groups.map((g) => g[2])).toEqual([1])
  })

  it('바닥이 없으면 아무것도 안 세운다', () => {
    const empty: Split = {
      cells: new Map(), shadows: new Set(), geometry: new BufferGeometry(), groups: [],
    }
    expect(roomWalls(empty, NO_DOOR)).toBeNull()
  })

  it('청크 원점을 더해 월드 좌표로 문을 묻는다', () => {
    const asked: [number, number][] = []
    roomWalls(room(2, 2), (tx, tz) => { asked.push([tx, tz]); return false }, { x: 100, z: 200 })
    expect(asked.length).toBeGreaterThan(0)
    for (const [tx, tz] of asked) {
      expect(tx).toBeGreaterThanOrEqual(100)
      expect(tz).toBeGreaterThanOrEqual(200)
    }
  })

  it('셀 열쇠가 청크 로컬 좌표 범위를 벗어나지 않는다', () => {
    // `cellKey`는 −128~383만 담는다. 방이 그 밖으로 나가면 열쇠가 겹친다
    expect(cellKey(0, 0)).not.toBe(cellKey(1, 0))
  })
})
