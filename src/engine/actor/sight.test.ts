// 트레이너 시선 (`trainer_encounter.c`)
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { TRAINER_TYPE, seesPlayer, sightRange, trainerInSight } from './sight'
import type { Npc } from '../map/world'
import { withData } from '../../data/romData.testkit'

const open = { blocked: () => false }
const walled = { blocked: (x: number, z: number) => x === 5 && z === 3 }

function npc(over: Partial<Npc> = {}): Npc {
  const raw = Array.from({ length: 16 }, () => 0)
  raw[7] = over.raw?.[7] ?? 4
  return {
    x: 5, z: 5, height: 0, localID: 1, sprite: 0, move: 0,
    trainerType: TRAINER_TYPE.normal, facing: 0, script: 3100, flag: null,
    range: [0, 0], raw,
    ...over,
    // `raw`를 넘겨받았으면 그대로 쓰고, 아니면 위에서 만든 것을 쓴다
    ...(over.raw ? { raw: over.raw } : {}),
  }
}

/** 시야 거리만 다른 트레이너 */
const withRange = (range: number): Npc => {
  const raw = Array.from({ length: 16 }, () => 0)
  raw[7] = range
  return npc({ raw })
}

describe('시야 거리', () => {
  it('배치표의 data[0]이다 — 원시 7번 워드', () => {
    expect(sightRange(withRange(3))).toBe(3)
  })

  it('0이면 아무도 못 본다', () => {
    // `IsPathInterrupted`가 거리 0을 곧바로 막는다. 트레이너 446명 중 56명이 이 값이다
    expect(seesPlayer(withRange(0), 0, 5, 6, open)).toBeNull()
  })
})

describe('직선만 본다', () => {
  // 트레이너는 (5,5)에 서서 facing 0(+z, 남쪽)을 본다
  it('보는 방향으로 사거리 안이면 본다', () => {
    expect(seesPlayer(withRange(4), 0, 5, 6, open)).toBe(1)
    expect(seesPlayer(withRange(4), 0, 5, 9, open)).toBe(4)
  })

  it('사거리 밖은 못 본다', () => {
    expect(seesPlayer(withRange(4), 0, 5, 10, open)).toBeNull()
  })

  it('등 뒤는 못 본다', () => {
    expect(seesPlayer(withRange(4), 0, 5, 3, open)).toBeNull()
  })

  it('옆으로 한 칸만 비켜도 못 본다 — 대각선은 안 본다', () => {
    expect(seesPlayer(withRange(4), 0, 6, 7, open)).toBeNull()
  })

  it('같은 칸은 못 본다. 거리는 1부터다', () => {
    expect(seesPlayer(withRange(4), 0, 5, 5, open)).toBeNull()
  })

  it('막힌 칸 너머는 못 본다', () => {
    // 북쪽(facing 2)으로 보면 (5,4) → (5,3)이 막혀 있다
    expect(seesPlayer(withRange(4), 2, 5, 4, walled)).toBe(1)
    expect(seesPlayer(withRange(4), 2, 5, 2, walled)).toBeNull()
  })

  it('사람이 선 칸 자체는 막힘 검사에서 뺀다', () => {
    // 벽이 곧 사람이 선 자리면 보인다 — 원작도 마지막 한 칸을 따로 다룬다
    expect(seesPlayer(withRange(4), 2, 5, 3, walled)).toBe(2)
  })
})

describe('유형', () => {
  const at = (t: number, facing: number) =>
    trainerInSight([{ npc: npc({ trainerType: t }), facing }], 5, 6, open, () => false)

  it('도는 유형도 판정은 지금 보는 방향 하나다', () => {
    // `GetTrainerType`이 옆보기·회전 다섯을 전부 NORMAL로 접는다
    for (const t of [
      TRAINER_TYPE.normal, TRAINER_TYPE.faceSides, TRAINER_TYPE.faceCounterclockwise,
      TRAINER_TYPE.faceClockwise, TRAINER_TYPE.spinCounterclockwise, TRAINER_TYPE.spinClockwise,
    ]) {
      expect(at(t, 0), `유형 ${String(t)}`).not.toBeNull()
      expect(at(t, 2), `유형 ${String(t)} 등 뒤`).toBeNull()
    }
  })

  it('사방을 보는 유형은 등 뒤도 본다', () => {
    expect(at(TRAINER_TYPE.viewAllDirections, 2)).not.toBeNull()
  })

  it('트레이너가 아니면 아무 방향도 안 본다', () => {
    expect(at(TRAINER_TYPE.none, 0)).toBeNull()
    expect(at(TRAINER_TYPE.unk3, 0)).toBeNull()
    expect(at(TRAINER_TYPE.noTalk, 0)).toBeNull()
  })

  it('이미 이긴 트레이너는 안 덤빈다', () => {
    const list = [{ npc: npc(), facing: 0 }]
    expect(trainerInSight(list, 5, 6, open, () => true)).toBeNull()
    expect(trainerInSight(list, 5, 6, open, () => false)).not.toBeNull()
  })

  it('여럿이 봐도 먼저 찾은 쪽이 이긴다', () => {
    const a = npc({ localID: 1 })
    const b = npc({ localID: 2, x: 5, z: 8, facing: 2 })
    const seen = trainerInSight(
      [{ npc: a, facing: 0 }, { npc: b, facing: 2 }], 5, 6, open, () => false,
    )
    expect(seen?.npc.localID).toBe(1)
  })
})

// 실제 자료에 붙여 본다. 여기서 어긋나면 자리를 잘못 짚은 것이다
const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('events.json')

maybe('실제 배치표', () => {
  const all: Npc[] = []
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) { o.forEach(walk); return }
    if (o === null || typeof o !== 'object') return
    const rec = o as Record<string, unknown>
    if (Array.isArray(rec.npcs)) { all.push(...(rec.npcs as Npc[])); return }
    Object.values(rec).forEach(walk)
  }
  walk(JSON.parse(readFileSync(resolve(DATA, 'events.json'), 'utf8')))

  it('⚠️ data[0]은 트레이너에게만 시야 거리다', () => {
    // 트레이너는 0~6에만 떨어지고, 트레이너가 아닌 쪽은 117까지 아무 값이나 나온다.
    // **같은 칸을 다른 뜻으로 쓴다** — 그래서 트레이너가 아니면 아예 안 본다
    const trainers = all.filter((n) => n.trainerType !== TRAINER_TYPE.none)
    expect(trainers.length).toBeGreaterThan(400)
    expect(Math.max(...trainers.map(sightRange))).toBeLessThanOrEqual(8)

    const others = all.filter((n) => n.trainerType === TRAINER_TYPE.none)
    expect(Math.max(...others.map(sightRange))).toBeGreaterThan(50)
  })

  it('트레이너 유형이 전부 아는 값이다', () => {
    const known = new Set<number>(Object.values(TRAINER_TYPE))
    const unknown = all.map((n) => n.trainerType).filter((t) => !known.has(t))
    expect(unknown).toEqual([])
  })
})
