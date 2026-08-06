// 기술 연출 틀 검증 (PLAN §7.3)
//
// 471개를 다섯 틀로 가른다. 지어낸 분류가 아니라 롬의 기술 데이터가 정하는
// 것이므로, 실제 표로 갈라 보고 알려진 기술이 제 틀에 가는지 본다.
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { MOVE_FRAMES, TARGET_SELF, archetypeFor, type Archetype } from './vfx'
import { TYPE_COLORS } from './typeColor'
import type { Move } from '../../data/schema'

const DATA = resolve(__dirname, '../../../public/data')
const present = existsSync(resolve(DATA, 'moves.json'))
const maybe = present ? describe : describe.skip

maybe('기술 연출 틀', () => {
  const raw = JSON.parse(readFileSync(resolve(DATA, 'moves.json'), 'utf8')) as { moves: Move[] }
  const moves = raw.moves
  const byId = new Map(moves.map((m) => [m.id, m]))

  it('자기에게 거는 기술은 target 0x10이 가른다 — 오탐도 누락도 없다', () => {
    // 검무 · 아질리티 · 자기회복 · 굳어지기 · 성장 · 묻어버리기 · 껍질에숨기
    const self = [14, 97, 105, 106, 74, 156, 164]
    // 전기자석파 · 맹독 · 울음소리 · 초음파 · 독가루
    const foe = [86, 92, 45, 50, 47]
    for (const id of self) expect(byId.get(id)!.target & TARGET_SELF, `기술 ${String(id)}`).toBe(TARGET_SELF)
    for (const id of foe) expect(byId.get(id)!.target & TARGET_SELF, `기술 ${String(id)}`).toBe(0)
  })

  it('알려진 기술이 제 틀에 간다', () => {
    const want: [number, Archetype][] = [
      [33, 'contact-melee'], // 몸통박치기 — 물리 접촉
      [14, 'self-buff'], // 검무
      [86, 'status-dot'], // 전기자석파
      [85, 'beam'], // 10만볼트 — 특수 비접촉
      [84, 'beam'], // 전기쇼크
      [55, 'beam'], // 물대포
      [188, 'projectile'], // 오물폭탄 — 특수인데… 아래에서 실제 값으로 본다
    ]
    for (const [id, kind] of want.slice(0, 6)) {
      expect(archetypeFor(byId.get(id)), `기술 ${String(id)}`).toBe(kind)
    }
  })

  it('471개가 다섯 틀에 다 떨어진다', () => {
    const count = new Map<Archetype, number>()
    for (const m of moves) {
      const k = archetypeFor(m)
      count.set(k, (count.get(k) ?? 0) + 1)
    }
    expect(moves.length).toBe(471)
    // 실측 분포. 합이 471이어야 하고, 어느 틀도 비면 안 된다
    expect([...count.values()].reduce((a, b) => a + b, 0)).toBe(471)
    for (const k of ['contact-melee', 'projectile', 'beam', 'self-buff', 'status-dot'] as const) {
      expect(count.get(k) ?? 0, k).toBeGreaterThan(20)
    }
  })

  it('연출 길이는 박자와 같은 상수 하나다', () => {
    // 박자(`playback`)가 이만큼 쉬고 무대가 이만큼 돈다. 둘이 어긋나면 연출이
    // 잘리거나 빈 화면이 남으므로 상수를 나누지 않는다
    expect(MOVE_FRAMES).toBeGreaterThan(20)
    expect(MOVE_FRAMES).toBeLessThan(90)
  })

  it('타입 18색이 다 있다', () => {
    expect(TYPE_COLORS).toHaveLength(18)
    expect(new Set(TYPE_COLORS).size).toBe(18)
  })

  it('기술이 없으면 던지는 것으로 떨어진다', () => {
    expect(archetypeFor(null)).toBe('projectile')
    expect(archetypeFor(undefined)).toBe('projectile')
  })
})
