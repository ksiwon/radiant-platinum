// 여섯째·일곱째 체육관 풀이 — **표와 규칙은 제품이 든다** (`gymSolve.mjs`와 같은 꼴)
//
// ⚠️ **여기서 표를 다시 세지 않는다** (`two-bakers-must-match`). 판 자리·층 통행표·얼음
// 속도·높이는 부르는 쪽이 제품 함수로 넘긴다 — 이 파일이 아는 것은 **탐색**뿐이다. 그래서
// 페이지 안(관측기)에서도, 단위 시험(제품 모듈을 그대로 import)에서도 같은 코드가 돈다.

/** 방향키 → 한 칸 (`sceneMark`의 `data-tile`과 같은 축) */
const STEPS = [['ArrowUp', 0, -1], ['ArrowDown', 0, 1], ['ArrowLeft', -1, 0], ['ArrowRight', 1, 0]]

/**
 * **운하 체육관 — 떠 있는 판을 타고 목표 칸까지** (`CanalaveGym_*` · JOURNEY_BADGE67 §4.1).
 *
 * 상태는 (칸 x · z · 층 · 판 스물넷의 A/B 비트)다. 한 걸음은 그 층 통행표에서 열린 이웃 칸으로
 * 가는 것이고, 들어선 칸에 **지금 그 층의 판**이 있으면 판이 뒤집혀 반대 끝(층 포함)으로
 * 옮겨 준다(`CanalaveGym_CheckIfPlayerOnPlatform`). 도착한 칸은 방금 밟은 것으로 쳐서
 * 다시 안 태운다 — 내렸다가 다시 들어서야 탄다.
 *
 * @param start `{x, z, floor}` 주인공
 * @param states 판 비트(자리 B면 1) — 제품의 지금 값
 * @param platforms `[{a:[x,y,z], b:[x,y,z], floorA, floorB}]` — 제품 표 그대로
 * @param blocked `(floor, x, z) => boolean` 층 통행표 + 그 층에 선 사람
 * @param goal `{x, z, floor}`
 * @returns `{ steps: [{key, want:{x,z}, ride, to}], rides }` 또는 `null`(못 닿는다)
 */
export function solveCanalave({ start, states, platforms, blocked, goal, cap = 600_000 }) {
  const posOf = (i, bits) => {
    const p = platforms[i]
    return ((bits >> i) & 1) !== 0
      ? { x: p.b[0], z: p.b[2], floor: p.floorB }
      : { x: p.a[0], z: p.a[2], floor: p.floorA }
  }
  const platformAt = (x, z, floor, bits) => {
    for (let i = 0; i < platforms.length; i++) {
      const q = posOf(i, bits)
      if (q.x === x && q.z === z && q.floor === floor) return i
    }
    return -1
  }
  const keyOf = (x, z, f, bits) => `${x},${z},${f},${bits}`
  const first = { x: start.x, z: start.z, f: start.floor, bits: states, from: null, step: null }
  const seen = new Map([[keyOf(first.x, first.z, first.f, first.bits), first]])
  const queue = [first]
  for (let head = 0; head < queue.length && head < cap; head++) {
    const s = queue[head]
    if (s.x === goal.x && s.z === goal.z && s.f === goal.floor) {
      const steps = []
      for (let at = s; at.step !== null; at = at.from) steps.push(at.step)
      steps.reverse()
      return { steps, rides: steps.filter((one) => one.ride !== null).length, explored: head }
    }
    for (const [key, dx, dz] of STEPS) {
      const nx = s.x + dx
      const nz = s.z + dz
      if (blocked(s.f, nx, nz)) continue
      const i = platformAt(nx, nz, s.f, s.bits)
      let next
      if (i < 0) {
        next = { x: nx, z: nz, f: s.f, bits: s.bits, step: { key, want: { x: nx, z: nz }, ride: null, to: null } }
      } else {
        const bits = s.bits ^ (1 << i)
        const q = posOf(i, bits)
        next = {
          x: q.x, z: q.z, f: q.floor, bits,
          step: { key, want: { x: nx, z: nz }, ride: i, to: { x: q.x, z: q.z, floor: q.floor } },
        }
      }
      const k = keyOf(next.x, next.z, next.f, next.bits)
      if (seen.has(k)) continue
      next.from = s
      seen.set(k, next)
      queue.push(next)
    }
  }
  return null
}

/**
 * **선단 체육관 — 얼음을 미끄러져 목표 칸까지** (`PlayerAvatar_TileMove_Ice` · `ov5_021E06A8` ·
 * JOURNEY_BADGE67 §4.2).
 *
 * 상태는 (칸 x · z · 남은 눈덩이)다. 한 수는 **한 방향을 한 번 누르는 것**이다:
 *
 * - 얼음이 아닌 칸에서는 한 칸 걷는다. 그 칸이 얼음이면 거기서부터 같은 방향으로 미끄러진다
 *   (원작도 얼음 칸에 들어선 걸음이 곧 첫 미끄럼이다).
 * - 얼음 위에서는 그 방향으로 미끄러진다.
 *
 * 미끄럼 한 번은 **제품의 규칙을 칸 단위로 그대로** 따른다 — 첫 걸음도 높이를 보고
 * (`speedAfter`), 칸을 넘을 때마다 **그 걸음의 속도**가 1 이상이면 앞 칸 눈덩이를 깨고,
 * 오르막에서 힘이 다하면 한 칸 되밀려 선다. 막힌 칸 앞이나 얼음이 아닌 첫 칸에서 멈춘다.
 *
 * @param start `{x, z}`
 * @param balls `[[x, z], …]` 지금 선 눈덩이
 * @param isIce `(x, z) => boolean`
 * @param wall `(x, z) => boolean` 눈덩이를 **뺀** 벽 (격자 · 사람)
 * @param heightChange `(x, z, dx, dz) => 'none'|'increase'|'decrease'` — 제품 함수
 * @param speedAfter `(speed, change) => number|null` — 제품의 `iceSpeedAfter`
 * @param goal `(x, z) => boolean`
 * @returns `{ moves: [{key, from, to, broke}], broke }` 또는 `null`
 */
export function solveSnowpoint({ start, balls, isIce, wall, heightChange, speedAfter, goal, cap = 400_000 }) {
  const ballIndex = new Map(balls.map(([x, z], i) => [`${x},${z}`, i]))
  const hasBall = (mask, x, z) => {
    const i = ballIndex.get(`${x},${z}`)
    return i !== undefined && (mask & (1 << i)) !== 0
  }
  const blocked = (mask, x, z) => wall(x, z) || hasBall(mask, x, z)

  /** 한 번 미끄러진다. `{x, z, mask, broke}` */
  const slide = (x, z, dx, dz, mask) => {
    let broke = 0
    const first = speedAfter(0, heightChange(x, z, dx, dz))
    if (first === null) {
      // 속도 0에서 오르막 — 한 칸 되밀린다. 뒤도 막혔으면 제자리다
      return blocked(mask, x - dx, z - dz) ? { x, z, mask, broke } : { x: x - dx, z: z - dz, mask, broke }
    }
    let speed = first
    for (let n = 0; n < 64; n++) {
      const nx = x + dx
      const nz = z + dz
      if (blocked(mask, nx, nz)) return { x, z, mask, broke }
      x = nx
      z = nz
      if (!isIce(x, z)) return { x, z, mask, broke }
      // 칸을 넘었다 — 이 걸음의 속도로 앞 칸 눈덩이를 본다
      if (speed >= 1 && hasBall(mask, x + dx, z + dz)) {
        mask &= ~(1 << ballIndex.get(`${x + dx},${z + dz}`))
        broke++
      }
      const next = speedAfter(speed, heightChange(x, z, dx, dz))
      if (next === null) return { x: x - dx, z: z - dz, mask, broke }
      speed = next
    }
    return { x, z, mask, broke }
  }

  const full = balls.length >= 31 ? -1 : (1 << balls.length) - 1
  const keyOf = (x, z, mask) => `${x},${z},${mask}`
  const first = { x: start.x, z: start.z, mask: full, from: null, move: null }
  const seen = new Map([[keyOf(first.x, first.z, first.mask), first]])
  const queue = [first]
  for (let head = 0; head < queue.length && head < cap; head++) {
    const s = queue[head]
    if (goal(s.x, s.z)) {
      const moves = []
      for (let at = s; at.move !== null; at = at.from) moves.push(at.move)
      moves.reverse()
      return { moves, broke: moves.reduce((n, m) => n + m.broke, 0), explored: head }
    }
    for (const [key, dx, dz] of STEPS) {
      let end
      if (isIce(s.x, s.z)) {
        end = slide(s.x, s.z, dx, dz, s.mask)
      } else {
        const nx = s.x + dx
        const nz = s.z + dz
        if (blocked(s.mask, nx, nz)) continue
        end = isIce(nx, nz) ? slide(nx, nz, dx, dz, s.mask) : { x: nx, z: nz, mask: s.mask, broke: 0 }
      }
      if (end.x === s.x && end.z === s.z && end.mask === s.mask) continue
      const k = keyOf(end.x, end.z, end.mask)
      if (seen.has(k)) continue
      const next = {
        x: end.x, z: end.z, mask: end.mask, from: s,
        move: { key, from: { x: s.x, z: s.z }, to: { x: end.x, z: end.z }, broke: end.broke },
      }
      seen.set(k, next)
      queue.push(next)
    }
  }
  return null
}
