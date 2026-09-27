// 괴력 바위 · 바위깨기 풀이 — **칸 규칙은 부르는 쪽이 넘긴다** (`gymSolve*.mjs`와 같은 꼴)
//
// 챔피언로드 2F처럼 바위를 몇 개 밀고 몇 개 깨야 문에 닿는 방이 있다. 사람은 눈으로 풀지만 하네스는
// 칸마다 물어야 한다 — 이 파일은 **탐색**만 한다. 벽·턱은 부르는 쪽이 구운 격자로 넘긴다.

/** 방향키 → 한 칸 */
const STEPS = [['ArrowUp', 0, -1], ['ArrowDown', 0, 1], ['ArrowLeft', -1, 0], ['ArrowRight', 1, 0]]

/**
 * **밀고 깨며 목표 칸까지** — 상태는 (칸 · 바위 자리들 · 남은 깰 바위)다.
 *
 * 한 걸음은 이웃 칸으로 가는 것이고, 거기 큰바위가 있으면 그 너머가 비었을 때만 한 칸 민다(괴력 ·
 * 사람은 제자리 — 원작도 민 걸음에 사람이 한 칸 따라 들지 않는다). 깰 바위가 있으면 깨고 그 칸에
 * 든다(바위깨기 · 두 걸음을 한 걸음으로 친다). 턱은 그 방향으로만 들고 너머 한 칸에 내린다.
 *
 * @param start `{x, z}`
 * @param wall `(x, z) => boolean` 구운 격자 · 선 사람
 * @param ledge `(x, z) => [dx, dz] | null` 그 칸이 턱이면 뛰는 방향
 * @param boulders `[[x, z], …]` 큰바위
 * @param rocks `[[x, z], …]` 깰 바위
 * @param goal `(x, z) => boolean`
 * @returns `{ moves: [{key, kind: 'walk'|'push'|'smash'|'hop', at, to}], pushes, smashes }` 또는 `null`
 */
export function solvePush({ start, wall, ledge = () => null, boulders, rocks = [], goal, cap = 1_500_000 }) {
  const k = (x, z) => `${x},${z}`
  const keyOf = (s) => `${k(s.x, s.z)}|${s.b.join(';')}|${s.r.join(';')}`
  const first = { x: start.x, z: start.z, b: boulders.map(([x, z]) => k(x, z)).sort(), r: rocks.map(([x, z]) => k(x, z)).sort(), from: null, move: null }
  const seen = new Set([keyOf(first)])
  const queue = [first]
  for (let head = 0; head < queue.length && head < cap; head++) {
    const s = queue[head]
    if (goal(s.x, s.z)) {
      const moves = []
      for (let at = s; at.move !== null; at = at.from) moves.push(at.move)
      moves.reverse()
      return {
        moves, pushes: moves.filter((m) => m.kind === 'push').length,
        smashes: moves.filter((m) => m.kind === 'smash').length, explored: head,
      }
    }
    const bset = new Set(s.b)
    const rset = new Set(s.r)
    const free = (x, z) => !wall(x, z) && !bset.has(k(x, z)) && !rset.has(k(x, z))
    for (const [key, dx, dz] of STEPS) {
      const nx = s.x + dx
      const nz = s.z + dz
      let next = null
      if (bset.has(k(nx, nz))) {
        const bx = nx + dx
        const bz = nz + dz
        if (!free(bx, bz) || ledge(bx, bz) !== null) continue
        const b = s.b.map((one) => (one === k(nx, nz) ? k(bx, bz) : one)).sort()
        next = { x: s.x, z: s.z, b, r: s.r, move: { key, kind: 'push', at: { x: nx, z: nz }, to: { x: bx, z: bz } } }
      } else if (rset.has(k(nx, nz))) {
        const r = s.r.filter((one) => one !== k(nx, nz))
        next = { x: nx, z: nz, b: s.b, r, move: { key, kind: 'smash', at: { x: nx, z: nz }, to: { x: nx, z: nz } } }
      } else if (wall(nx, nz)) {
        continue
      } else {
        const hop = ledge(nx, nz)
        if (hop !== null) {
          if (hop[0] !== dx || hop[1] !== dz) continue
          const lx = nx + dx
          const lz = nz + dz
          if (!free(lx, lz)) continue
          next = { x: lx, z: lz, b: s.b, r: s.r, move: { key, kind: 'hop', at: { x: nx, z: nz }, to: { x: lx, z: lz } } }
        } else {
          next = { x: nx, z: nz, b: s.b, r: s.r, move: { key, kind: 'walk', at: { x: nx, z: nz }, to: { x: nx, z: nz } } }
        }
      }
      const kk = keyOf(next)
      if (seen.has(kk)) continue
      seen.add(kk)
      next.from = s
      queue.push(next)
    }
  }
  return null
}
