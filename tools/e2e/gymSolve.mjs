// 체육관 기믹 풀이 — **표와 규칙은 제품이 든다**
//
// ⚠️ **여기서 표를 다시 세지 않는다** (`two-bakers-must-match`). 미끄러짐 거리도
// 벽도 제품 함수로 받아서 쓴다 — 이 파일이 아는 것은 **탐색**뿐이다. 그래서
// 페이지 안(관측기)에서도, 단위 시험(제품 모듈을 그대로 import)에서도 같은 코드가
// 돈다.
//
// 장막시티만 여기 있다. **들판시티는 여기 없다** — 단추는 되돌릴 수 있어서 앞을
// 내다볼 까닭이 없고, 물 높이를 가정해 벽을 그리려면 높이판을 건드려야 한다
// (`JOURNEY_BADGE345` §5.2의 설계 변경). 그쪽은 「지금 벽을 읽고 → 못 닿으면 닿는
// 단추를 밟고 → 다시 읽는다」로 간다.

/** 원작 방향 번호 (북 0 · 남 1 · 서 2 · 동 3) — `VEILSTONE_STEP`과 같은 차례 */
export const DIRS = [0, 1, 2, 3]

/**
 * **자두 앞에 서기까지 차야 하는 샌드백 차례.**
 *
 * 찬 샌드백은 **못 되돌린다** — 그래서 앞을 내다본다. 상태는 「샌드백 자리들 +
 * 아직 선 타이어 + 주인공이 닿을 수 있는 구역」이고, 한 걸음이 **차기 하나**다.
 *
 * ⚠️ **주인공의 정확한 칸은 상태가 아니다.** 막힌 것이 안 바뀌는 동안 주인공은
 * 그 구역 안을 마음대로 다니므로, 같은 (샌드백·타이어)에서 같은 구역에 있으면
 * 같은 상태다. 구역은 **닿는 칸 중 가장 작은 것**으로 이름 붙인다
 *
 * @param start `{x, z}` 주인공이 선 칸
 * @param goal `{x, z}` 서야 하는 칸
 * @param bags `[[x, z], …]` 지금 샌드백 자리
 * @param stacks `['x,z', …]` 아직 선 타이어 (제품의 `veilstoneKey` 꼴)
 * @param wall `(x, z) => boolean` **샌드백·타이어를 뺀** 벽. 격자와 사람이 든다
 * @param travel `(x, z, dir, stacks) => { distance, flags }` 제품의 `veilstoneTravel`
 * @param step `[[dx, dz], …]` 제품의 `VEILSTONE_STEP`
 * @param tireFlag 제품의 `VEILSTONE_FLAG.tireStack`
 * @param key `(x, z) => string` 제품의 `veilstoneKey`
 * @param cap 펼쳐 볼 상태 수의 상한. 넘으면 **못 풀었다**고 말한다 (짐작 금지)
 * @returns `{ ok, kicks: [{ bag, dir, stand, to, topple }], seen, ms, why }`
 */
export function solveVeilstone({
  start, goal, bags, stacks, wall, travel, step, tireFlag, key, cap = 200_000,
}) {
  const t0 = Date.now()
  const has = (list, x, z) => list.some(([bx, bz]) => bx === x && bz === z)

  /** 지금 막힌 것을 안고 주인공이 닿는 칸들 */
  const reach = (from, bagList, tireSet) => {
    const seen = new Set([`${String(from.x)},${String(from.z)}`])
    const queue = [from]
    for (let head = 0; head < queue.length; head++) {
      const at = queue[head]
      for (const [dx, dz] of step) {
        const nx = at.x + dx, nz = at.z + dz
        const k = `${String(nx)},${String(nz)}`
        if (seen.has(k)) continue
        if (wall(nx, nz) || tireSet.has(key(nx, nz)) || has(bagList, nx, nz)) continue
        seen.add(k)
        queue.push({ x: nx, z: nz })
      }
    }
    return seen
  }
  /** 상태 이름 — 샌드백·타이어·**구역** */
  const nameOf = (bagList, tireSet, spot) => {
    const b = bagList.map(([x, z]) => `${String(x)},${String(z)}`).sort().join('|')
    const t = [...tireSet].sort().join('|')
    // 구역은 닿는 칸 중 사전순으로 가장 작은 것 하나로 충분하다
    let low = null
    for (const one of spot) if (low === null || one < low) low = one
    return `${b}#${t}#${String(low)}`
  }

  const first = {
    bags: bags.map(([x, z]) => [x, z]),
    tires: new Set(stacks),
    at: { ...start },
    kicks: [],
  }
  const seen = new Set()
  let queue = [first]
  let expanded = 0

  while (queue.length > 0) {
    const next = []
    for (const now of queue) {
      if (expanded >= cap) {
        return { ok: false, why: `상한 ${String(cap)}개를 넘었다`, seen: seen.size, ms: Date.now() - t0 }
      }
      expanded++
      const spot = reach(now.at, now.bags, now.tires)
      if (spot.has(`${String(goal.x)},${String(goal.z)}`)) {
        return { ok: true, kicks: now.kicks, seen: seen.size, ms: Date.now() - t0 }
      }
      for (const [i, bag] of now.bags.entries()) {
        const [bx, bz] = bag
        for (const dir of DIRS) {
          const [dx, dz] = step[dir]
          // 미는 쪽의 **반대편 옆 칸**에 서야 그 방향으로 찬다
          const stand = { x: bx - dx, z: bz - dz }
          if (!spot.has(`${String(stand.x)},${String(stand.z)}`)) continue
          const { distance, flags } = travel(bx, bz, dir, now.tires)
          // 꿈쩍도 안 하는 차기는 상태를 안 바꾼다 — 넣으면 제자리를 맴돈다
          if (distance === 0) continue
          const to = { x: bx + dx * distance, z: bz + dz * distance }
          const bagsNext = now.bags.map((one) => [...one])
          bagsNext[i] = [to.x, to.z]
          const tiresNext = new Set(now.tires)
          /** 끝 칸 **너머**의 타이어가 무너진다 (제품의 `hitVeilstoneBag`) */
          const topple = (flags & tireFlag) !== 0 ? key(to.x + dx, to.z + dz) : null
          if (topple !== null) tiresNext.delete(topple)
          const after = reach(stand, bagsNext, tiresNext)
          const name = nameOf(bagsNext, tiresNext, after)
          if (seen.has(name)) continue
          seen.add(name)
          next.push({
            bags: bagsNext,
            tires: tiresNext,
            at: stand,
            kicks: [...now.kicks, { bag: { x: bx, z: bz }, dir, stand, to, topple }],
          })
        }
      }
    }
    queue = next
  }
  return { ok: false, why: '차서 열 수 있는 길이 없다', seen: seen.size, ms: Date.now() - t0 }
}
