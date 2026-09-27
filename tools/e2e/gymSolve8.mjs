// 여덟째 체육관 풀이 — **표와 규칙은 제품이 든다** (`gymSolve67.mjs`와 같은 꼴)
//
// ⚠️ **여기서 톱니 표를 다시 세지 않는다** (`two-bakers-must-match`). 막힌 상자·회전 상태·단추가
// 상태를 어떻게 바꾸는지는 부르는 쪽이 제품 함수(`engine/world/sunyshoreGym.ts`)로 넘긴다 — 이
// 파일이 아는 것은 **탐색**뿐이다. 그래서 페이지 안(관측기)에서도, 단위 시험에서도 같은 코드가 돈다.

/** 방향키 → 한 칸 (`sceneMark`의 `data-tile`과 같은 축) */
const STEPS = [['ArrowUp', 0, -1], ['ArrowDown', 0, 1], ['ArrowLeft', -1, 0], ['ArrowRight', 1, 0]]

/**
 * **물가 체육관 — 톱니를 돌려 가며 목표 칸까지** (`SunyshoreGym_*`).
 *
 * 상태는 (칸 x · z · 회전 상태)다. 한 걸음은 **지금 회전 상태**에서 안 막힌 이웃 칸으로 가는
 * 것이고, 들어선 칸이 단추(톱니 한가운데의 좌표 이벤트)면 그 단추가 회전 상태를 바꾼다
 * (`PressSunyshoreGymButton`). 좌표 이벤트는 **들어설 때만** 걸리므로 단추 위에 선 채로는 다시
 * 안 눌린다 — 내렸다가 다시 들어서야 한다. 탐색이 칸 단위라 그대로 맞는다.
 *
 * @param start `{x, z}` 주인공
 * @param state 지금 회전 상태 — 제품의 `sunyshoreState()`
 * @param blocked `(state, x, z) => boolean` 격자 + 그 회전 상태의 톱니 상자 + 선 사람
 * @param buttons `Map<'x,z', button>` 단추 칸 → 단추 종류(`SUNYSHORE_BUTTON`)
 * @param next `(state, button) => state` — 제품의 `sunyshoreNextState`
 * @param goal `(x, z) => boolean`
 * @returns `{ steps: [{key, want:{x,z}, press, state}], presses }` 또는 `null`(못 닿는다)
 */
export function solveSunyshore({ start, state, blocked, buttons, next, goal, cap = 400_000 }) {
  const keyOf = (x, z, s) => `${x},${z},${s}`
  const first = { x: start.x, z: start.z, s: state, from: null, step: null }
  const seen = new Map([[keyOf(first.x, first.z, first.s), first]])
  const queue = [first]
  for (let head = 0; head < queue.length && head < cap; head++) {
    const at = queue[head]
    if (goal(at.x, at.z)) {
      const steps = []
      for (let s = at; s.step !== null; s = s.from) steps.push(s.step)
      steps.reverse()
      return { steps, presses: steps.filter((one) => one.press !== null).length, explored: head }
    }
    for (const [key, dx, dz] of STEPS) {
      const nx = at.x + dx
      const nz = at.z + dz
      if (blocked(at.s, nx, nz)) continue
      const button = buttons.get(`${nx},${nz}`)
      const s = button === undefined ? at.s : next(at.s, button)
      const k = keyOf(nx, nz, s)
      if (seen.has(k)) continue
      const step = { key, want: { x: nx, z: nz }, press: button ?? null, state: s }
      const node = { x: nx, z: nz, s, from: at, step }
      seen.set(k, node)
      queue.push(node)
    }
  }
  return null
}
