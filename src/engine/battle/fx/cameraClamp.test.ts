import { describe, expect, it } from 'vitest'
import { buildArenaCollider } from './arenaCollider'
import { clampShot, inFrame, MAX_COVER, screenCover } from './cameraClamp'

const torterra = { min: [-1, 0, 1.2] as const, max: [1, 2.2, 3.2] as const }
const foe = { min: [-0.5, 0, -2.7] as const, max: [0.5, 1, -1.7] as const }
const shot = (pos: [number, number, number], target: [number, number, number]) => ({ pos, target, fov: 30, roll: 0 })

/** 선분이 상자를 지나는가 (시험용 — 잘게 쪼개 잰다) */
function blocked(a: readonly number[], b: readonly number[], box: { min: readonly number[]; max: readonly number[] }): boolean {
  for (let i = 0; i <= 400; i++) {
    const t = i / 400
    const p = [0, 1, 2].map((k) => a[k]! + (b[k]! - a[k]!) * t)
    if (p.every((v, k) => v > box.min[k]! && v < box.max[k]!)) return true
  }
  return false
}

/** 상자 하나를 삼각형 열둘로 (바깥을 보게 감는다) */
function boxTris(min: readonly number[], max: readonly number[]): number[] {
  const c = (i: number) => [i & 1 ? max[0]! : min[0]!, i & 2 ? max[1]! : min[1]!, i & 4 ? max[2]! : min[2]!]
  const quads = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]]
  return quads.flatMap(([a, b, d, e]) => [...c(a!), ...c(b!), ...c(d!), ...c(a!), ...c(d!), ...c(e!)])
}

describe('시퀀스 카메라 거르기', () => {
  it('몸 속이면 보는 곳 → 카메라 쪽으로 상자 밖까지 민다', () => {
    const out = clampShot(shot([0.2, 1.0, 2.0], [0, 1.0, -2.2]), 16, [torterra, foe])
    expect(out.pos[2]).toBeGreaterThan(3.2 + 0.2)
  })

  it('다른 몸이 시선을 막으면 비킨다 — 올리기보다 옆 · 뒤가 먼저', () => {
    const out = clampShot(shot([0, 1.0, 5], [0, 0.5, -2.2]), 16, [torterra, foe])
    // 몸 상자의 가운데 반(모서리는 대개 빈 곳) — 시선이 그 속을 안 지난다
    expect(blocked(out.pos, out.target, { min: [-0.5, 0.55, 1.7], max: [0.5, 1.65, 2.7] })).toBe(false)
    expect(out.pos[1]).toBeCloseTo(1.0, 6)
  })

  it('보는 곳은 바닥 위 · 카메라는 바닥 위 · 실내 천장 아래', () => {
    const out = clampShot(shot([0, -1, 4], [0, -1, 0]), 6, [])
    expect(out.target[1]).toBe(0.1)
    expect(out.pos[1]).toBeGreaterThanOrEqual(0.15)
    expect(clampShot(shot([0, 9, 2], [0, 0.5, 0]), 6, []).pos[1]).toBeLessThanOrEqual(3)
  })

  it('반지름 밖이면 시선을 따라 당긴다', () => {
    const out = clampShot(shot([0, 1, 20], [0, 1, 0]), 12, [])
    expect(Math.hypot(out.pos[0], out.pos[2])).toBeCloseTo(11.5, 6)
    expect(out.pos[0]).toBeCloseTo(0, 6)
  })
})

describe('화면 검사 — 주인공이 아닌 몸은 15% 이하 · 주인공은 화면 안에', () => {
  const aspect = 16 / 9
  // 토대부기(내 쪽 +Z, −Z를 본다) — glb 상자를 무대에 세운 크기
  const big = { min: [-1.04, 0.02, 0.95] as const, max: [0.92, 2.24, 3.96] as const }
  const spiritomb = { min: [-0.76, 0, -2.47] as const, max: [0.75, 1.44, -1.68] as const }

  it('어깨 너머 샷 — 큰 몸이 시선 옆에 붙어 화면을 덮으면 물리고 올려 15% 이하로', () => {
    // 토대부기 옆 · 낮게 서서 상대를 본다 (리프스톰 · 씨뿌리기 꼴)
    const raw = shot([1.6, 1.2, 1.6], [0, 0.7, -2.2])
    expect(screenCover(raw.pos, raw.target, raw.fov, raw.roll, aspect, big)).toBeGreaterThan(MAX_COVER)
    const out = clampShot(raw, 16, [big, spiritomb], aspect)
    expect(out.target).toEqual(raw.target)
    expect(screenCover(out.pos, out.target, out.fov, out.roll, aspect, big)).toBeLessThanOrEqual(MAX_COVER + 1e-9)
    expect(inFrame(out.pos, out.target, out.fov, out.roll, aspect, spiritomb)).toBe(true)
    expect(Math.hypot(out.pos[0], out.pos[2])).toBeLessThanOrEqual(15.5 + 1e-9)
  })

  it('제 몸을 잡는 샷이면 그 몸이 주인공 — 화면 안에 다 들게 물린다', () => {
    const raw = shot([0.5, 1.2, -0.2], [0, 1.2, 2.2])
    const out = clampShot(raw, 16, [big, spiritomb], aspect)
    expect(inFrame(out.pos, out.target, out.fov, out.roll, aspect, big)).toBe(true)
    expect(screenCover(out.pos, out.target, out.fov, out.roll, aspect, spiritomb)).toBeLessThanOrEqual(MAX_COVER + 1e-9)
  })

  it('이미 지키는 샷은 안 건드린다', () => {
    const raw = shot([2.7, 1.5, 5], [0, 0.5, -2.2])
    const before = screenCover(raw.pos, raw.target, raw.fov, raw.roll, aspect, big)
    if (before <= MAX_COVER && inFrame(raw.pos, raw.target, raw.fov, raw.roll, aspect, spiritomb)) {
      expect(clampShot(raw, 16, [big, spiritomb], aspect).pos).toEqual(raw.pos)
    }
  })
})

describe('무대 지오메트리 — 천장 · 벽 (리요 방의 매달린 구조물)', () => {
  const aspect = 16 / 9
  // 무대 위 3.0~3.4m에 넓은 판이 매달려 있다
  const ceilMin = [-6, 3.0, -6], ceilMax = [6, 3.4, 6]
  const room = buildArenaCollider(boxTris(ceilMin, ceilMax), 12)

  it('천장은 매달린 판의 아랫면에서 여유만큼 아래다', () => {
    expect(room.ceilingAt(0, 0)).toBeCloseTo(2.5, 6)
    expect(room.ceilingAt(4, -3)).toBeCloseTo(2.5, 6)
  })

  it('높은 샷도 판 속이나 판 위에 서지 않는다 — 판 아래로 내려온다', () => {
    for (const pos of [[0, 3.2, 6], [0, 6, 6], [2, 9, 3]] as const) {
      const out = clampShot(shot([...pos], [0, 0.5, -2.2]), 12, [torterra, foe], aspect, room)
      expect(out.pos[1]).toBeLessThanOrEqual(2.5 + 1e-9)
      expect(blocked(out.pos, out.target, { min: ceilMin, max: ceilMax })).toBe(false)
    }
  })

  it('화면 검사가 비키는 후보도 판 아래에서만 찾는다', () => {
    // 토대부기 바로 뒤 · 낮게 — 비켜야 하는 샷
    const out = clampShot(shot([1.8, 1.2, 4.0], [0, 0.7, -2.2]), 12, [torterra, foe], aspect, room)
    expect(out.pos[1]).toBeLessThanOrEqual(2.5 + 1e-9)
    expect(screenCover(out.pos, out.target, out.fov, out.roll, aspect, torterra)).toBeLessThanOrEqual(MAX_COVER + 1e-9)
  })

  it('보는 곳과 카메라 사이에 벽이 서면 벽 바로 앞으로 당긴다', () => {
    const wall = buildArenaCollider(boxTris([-8, 0, 6], [8, 6, 6.4]), 12)
    const out = clampShot(shot([0, 1.5, 9], [0, 0.5, -2.2]), 12, [], aspect, wall)
    expect(out.pos[2]).toBeLessThan(6)
    expect(out.pos[2]).toBeGreaterThan(5.5)
  })

  it('올리기보다 물리기 · 비키기 — 둘 다 되면 높이는 그대로', () => {
    const raw = shot([1.6, 1.2, 1.6], [0, 0.7, -2.2])
    const out = clampShot(raw, 16, [torterra, foe], aspect, room)
    // 시선을 따라 물리면 그 기울기만큼은 오른다(보는 곳보다 0.5m 높은 샷) — 따로 올린 것은 없다
    const along = (raw.pos[1] - raw.target[1]) / Math.hypot(raw.pos[0] - raw.target[0], raw.pos[2] - raw.target[2])
    const went = Math.hypot(out.pos[0] - raw.pos[0], out.pos[2] - raw.pos[2])
    expect(out.pos[1]).toBeLessThanOrEqual(raw.pos[1] + along * went + 1e-6)
    expect(screenCover(out.pos, out.target, out.fov, out.roll, aspect, torterra)).toBeLessThanOrEqual(MAX_COVER + 1e-9)
  })

  it('BDSP 샷보다 25°를 넘게 내려다보지 않는다', () => {
    // 좁은 무대(반지름 3) — 물러날 데가 없어 올리기만 남은 샷
    const raw = shot([0.2, 0.9, 2.4], [0, 0.8, -1.2])
    const out = clampShot(raw, 3, [torterra, foe], aspect)
    const pitch = (p: readonly number[], t: readonly number[]) =>
      (Math.atan2(p[1]! - t[1]!, Math.hypot(p[0]! - t[0]!, p[2]! - t[2]!)) * 180) / Math.PI
    expect(pitch(out.pos, out.target)).toBeLessThanOrEqual(pitch(raw.pos, raw.target) + 25 + 1e-6)
  })
})
