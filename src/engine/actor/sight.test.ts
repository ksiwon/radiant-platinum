// 트레이너 시선 (`trainer_encounter.c`)
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  SIGHT_STEP_LIMIT, TRAINER_TYPE, seesPlayer, sightRange, trainerInSight, type Watcher,
} from './sight'
import type { Npc } from '../map/world'
import { DIR } from '../script/movement'
import { withData } from '../../data/romData.testkit'

const flat = { blocked: () => false, heightAt: () => 0 }
/** (5,3)에 벽이 하나 */
const walled = {
  blocked: (x: number, z: number) => x === 5 && z === 3,
  heightAt: () => 0,
}

function npc(over: Partial<Npc> = {}): Npc {
  const raw = Array.from({ length: 16 }, () => 0)
  raw[7] = over.raw?.[7] ?? 4
  return {
    x: 5, z: 5, height: 0, localID: 1, sprite: 0, move: 0,
    trainerType: TRAINER_TYPE.normal, facing: DIR.south, script: 3100, flag: null,
    range: [0, 0], raw,
    ...over,
    // `raw`를 넘겨받았으면 그대로 쓰고, 아니면 위에서 만든 것을 쓴다
    ...(over.raw ? { raw: over.raw } : {}),
  }
}

/** (5,5)에 서서 남쪽(+z)을 보는 사람. 자리는 배치표와 따로 준다 */
const at = (over: Partial<Watcher & { range: number }> = {}): Watcher => {
  const raw = Array.from({ length: 16 }, () => 0)
  raw[7] = over.range ?? 4
  return {
    npc: over.npc ?? npc({ raw }),
    x: over.x ?? 5, z: over.z ?? 5, facing: over.facing ?? DIR.south,
  }
}

describe('시야 거리', () => {
  it('배치표의 data[0]이다 — 원시 7번 워드', () => {
    expect(sightRange(at({ range: 3 }).npc)).toBe(3)
  })

  it('0이면 아무도 못 본다', () => {
    // `IsPathInterrupted`가 거리 0을 곧바로 막는다. 트레이너 446명 중 56명이 이 값이다
    expect(seesPlayer(at({ range: 0 }), 5, 6, flat)).toBeNull()
  })
})

// ⚠️ **여기가 한 번 통째로 뒤집혀 있었다.** 시선이 제 방향표를 따로 들고 있었고
// 그 표가 `DIR`과 한 칸씩 어긋나 있어서, 모든 트레이너가 **90° 옆을** 보고 있었다.
// 시험도 그 뒤집힌 규약으로 적혀 있어서 초록인 채로 넘어갔다. 그래서 이제
// **방향은 `DIR`로만 쓴다** — 이름을 쓰면 표가 어긋나도 시험이 잡는다
describe('방향은 DIR 규약이다 — 이동·배치표와 같은 표', () => {
  const seen = (facing: number, px: number, pz: number) =>
    seesPlayer(at({ facing }), px, pz, flat)

  it('북쪽을 보면 z가 작아지는 쪽을 본다', () => {
    expect(seen(DIR.north, 5, 4)).toBe(1)
    expect(seen(DIR.north, 5, 6)).toBeNull()
  })

  it('남쪽을 보면 z가 커지는 쪽을 본다', () => {
    expect(seen(DIR.south, 5, 6)).toBe(1)
    expect(seen(DIR.south, 5, 4)).toBeNull()
  })

  it('서쪽을 보면 x가 작아지는 쪽을 본다', () => {
    expect(seen(DIR.west, 4, 5)).toBe(1)
    expect(seen(DIR.west, 6, 5)).toBeNull()
  })

  it('동쪽을 보면 x가 커지는 쪽을 본다', () => {
    expect(seen(DIR.east, 6, 5)).toBe(1)
    expect(seen(DIR.east, 4, 5)).toBeNull()
  })
})

describe('직선만 본다', () => {
  it('보는 방향으로 사거리 안이면 본다', () => {
    expect(seesPlayer(at(), 5, 6, flat)).toBe(1)
    expect(seesPlayer(at(), 5, 9, flat)).toBe(4)
  })

  it('사거리 밖은 못 본다', () => {
    expect(seesPlayer(at(), 5, 10, flat)).toBeNull()
  })

  it('등 뒤는 못 본다', () => {
    expect(seesPlayer(at(), 5, 3, flat)).toBeNull()
  })

  it('옆으로 한 칸만 비켜도 못 본다 — 대각선은 안 본다', () => {
    expect(seesPlayer(at(), 6, 7, flat)).toBeNull()
  })

  it('같은 칸은 못 본다. 거리는 1부터다', () => {
    expect(seesPlayer(at(), 5, 5, flat)).toBeNull()
  })

  it('막힌 칸 너머는 못 본다', () => {
    // 북쪽으로 보면 (5,4) → (5,3)이 막혀 있다
    expect(seesPlayer(at({ facing: DIR.north }), 5, 4, walled)).toBe(1)
    expect(seesPlayer(at({ facing: DIR.north }), 5, 2, walled)).toBeNull()
  })

  it('사람이 선 칸 자체는 막힘 검사에서 뺀다', () => {
    // 벽이 곧 사람이 선 자리면 보인다 — 원작도 마지막 한 칸을 따로 다룬다
    expect(seesPlayer(at({ facing: DIR.north }), 5, 3, walled)).toBe(2)
  })
})

// ⚠️ **배치표는 「어디서 시작했는가」다.** 순회·배회 유형은 걸어 다니므로
// 그 자리에 없다 — 실측으로 217번도로 아홉 중 넷이 30칸 넘게 떠나 있었다
describe('지금 선 칸에서 본다 — 배치표 자리가 아니다', () => {
  it('걸어간 자리에서 시선이 나간다', () => {
    // 배치표는 (5,5)인데 지금은 (20,20)에 서 있다
    const who = at({ x: 20, z: 20 })
    expect(who.npc.x).toBe(5)
    expect(seesPlayer(who, 20, 21, flat)).toBe(1)
    expect(seesPlayer(who, 5, 6, flat)).toBeNull()
  })
})

describe('단차와 사람이 시선을 끊는다', () => {
  /** z가 7 이상인 칸만 `rise`만큼 높다 */
  const step = (rise: number) => ({
    blocked: () => false,
    heightAt: (_x: number, z: number) => (z >= 7 ? rise : 0),
  })

  it(`${String(SIGHT_STEP_LIMIT)}칸 이상 차이 나면 그 너머를 못 본다`, () => {
    // 원작의 20/16이다 — 한 칸짜리 턱은 안 막고 두 칸부터 막는다
    expect(seesPlayer(at(), 5, 8, step(1))).toBe(3)
    expect(seesPlayer(at(), 5, 8, step(2))).toBeNull()
  })

  it('⚠️ 사람이 선 칸도 단차를 본다 — 턱 위에서 아래를 내려다보는 것은 시선이 아니다', () => {
    // 마지막 칸에서 원작이 `collisionFlags == (1 << 2)`를 요구한다:
    // 「사람만 있고 지형도 단차도 없다」
    expect(seesPlayer(at(), 5, 7, step(2))).toBeNull()
  })

  it('앞에 사람이 서 있으면 그 뒤는 못 본다 (`sub_02063F00`)', () => {
    const crowd = {
      blocked: (x: number, z: number) => x === 5 && z === 7,
      heightAt: () => 0,
    }
    expect(seesPlayer(at(), 5, 6, crowd)).toBe(1)
    expect(seesPlayer(at(), 5, 9, crowd)).toBeNull()
  })
})

describe('유형', () => {
  const look = (t: number, facing: number) =>
    trainerInSight([at({ npc: npc({ trainerType: t }), facing })], 5, 6, flat, () => false)

  it('도는 유형도 판정은 지금 보는 방향 하나다', () => {
    // `GetTrainerType`이 옆보기·회전 다섯을 전부 NORMAL로 접는다
    for (const t of [
      TRAINER_TYPE.normal, TRAINER_TYPE.faceSides, TRAINER_TYPE.faceCounterclockwise,
      TRAINER_TYPE.faceClockwise, TRAINER_TYPE.spinCounterclockwise, TRAINER_TYPE.spinClockwise,
    ]) {
      expect(look(t, DIR.south), `유형 ${String(t)}`).not.toBeNull()
      expect(look(t, DIR.north), `유형 ${String(t)} 등 뒤`).toBeNull()
    }
  })

  it('사방을 보는 유형은 등 뒤도 본다', () => {
    expect(look(TRAINER_TYPE.viewAllDirections, DIR.north)).not.toBeNull()
  })

  it('트레이너가 아니면 아무 방향도 안 본다', () => {
    expect(look(TRAINER_TYPE.none, DIR.south)).toBeNull()
    expect(look(TRAINER_TYPE.unk3, DIR.south)).toBeNull()
    expect(look(TRAINER_TYPE.noTalk, DIR.south)).toBeNull()
  })

  it('이미 이긴 트레이너는 안 덤빈다', () => {
    const list = [at()]
    expect(trainerInSight(list, 5, 6, flat, () => true)).toBeNull()
    expect(trainerInSight(list, 5, 6, flat, () => false)).not.toBeNull()
  })

  it('여럿이 봐도 먼저 찾은 쪽이 이긴다', () => {
    const first = at({ npc: npc({ localID: 1 }) })
    const second = at({ npc: npc({ localID: 2 }), x: 5, z: 8, facing: DIR.north })
    const seen = trainerInSight([first, second], 5, 6, flat, () => false)
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

  it('⚠️ 배치표의 방향이 이동 표와 같은 규약이다 — 시선이 그 값을 그대로 쓴다', () => {
    // 「서쪽을 본다」 유형(16)을 단 사람은 배치표에도 대개 `DIR.west`가 적혀
    // 있다. 이 둘이 다른 규약이면 641명이 우연히 맞을 수 없다 — 시선이 제
    // 방향표를 따로 들고 90° 옆을 보던 것이 이 검사로 잡힌다.
    //
    // 어긋난 열넷은 원작이 세우면서 돌려세운다 (`MapObject_TryFace`,
    // `actor/ambient`의 `face`)
    const faceOnly = new Map([[14, DIR.north], [15, DIR.south], [16, DIR.west], [17, DIR.east]])
    const typed = all.filter((n) => faceOnly.has(n.move))
    const wrong = typed.filter((n) => n.facing !== faceOnly.get(n.move))
    expect(typed).toHaveLength(655)
    expect(wrong).toHaveLength(14)
  })
})
