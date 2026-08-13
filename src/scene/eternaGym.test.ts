// 영원시티 체육관의 꽃시계 (PARITY §7.12)
//
// ⚠️ 여기서 재는 것은 **바늘이 실제로 길을 여는가**다. 둘째 뱃지의 방이고
// 시계 판 전체가 처음에는 막혀 있어서, 상태 표가 하나만 어긋나도 첫 트레이너
// 에게도 못 간다.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ETERNA_CLOCK, ETERNA_CLOCK_COLLISION, ETERNA_CLOCK_DIAMETER, ETERNA_CLOCK_LEFT,
  ETERNA_CLOCK_STATES, ETERNA_CLOCK_TIMES, ETERNA_CLOCK_TOP, ETERNA_FOUNTAIN_COLLISION,
  ETERNA_FOUNTAIN_Z, ETERNA_GYM_MAP, ETERNA_GYM_WIDTH, ETERNA_JUMP_TILES,
  eternaBlocked, eternaHandAngles, eternaNextState,
} from '../engine/world/eternaGym'
import {
  advanceEternaClock, eternaBlockedAt, eternaBusy, eternaJumpAt, eternaProps, eternaState,
  eternaTick, initEternaGym, resetEternaGym,
} from './eternaGym'

/** 다 돌 때까지 굴린다 */
function settle(): void {
  for (let i = 0; i < 600 && eternaBusy(); i++) eternaTick(1 / 60)
  if (eternaBusy()) throw new Error('바늘이 안 멈춘다')
}

describe('표가 롬과 맞는가', () => {
  it('상태가 다섯이고 표가 다 있다', () => {
    expect(ETERNA_CLOCK_TIMES).toHaveLength(ETERNA_CLOCK_STATES)
    expect(ETERNA_CLOCK_COLLISION).toHaveLength(ETERNA_CLOCK_STATES)
    expect(ETERNA_FOUNTAIN_COLLISION).toHaveLength(ETERNA_CLOCK_STATES)
    expect(ETERNA_JUMP_TILES).toHaveLength(ETERNA_CLOCK_STATES)
  })

  it('시계 판이 13×13이고 분수 줄이 21칸이다', () => {
    for (const board of ETERNA_CLOCK_COLLISION) {
      expect(board).toHaveLength(ETERNA_CLOCK_DIAMETER * ETERNA_CLOCK_DIAMETER)
    }
    for (const row of ETERNA_FOUNTAIN_COLLISION) expect(row).toHaveLength(ETERNA_GYM_WIDTH)
  })

  it('⚠️ 처음에는 판이 통째로 막혀 있고 맨 아랫줄만 뚫려 있다', () => {
    const first = ETERNA_CLOCK_COLLISION[ETERNA_CLOCK.initial]!
    const top = first.slice(0, ETERNA_CLOCK_DIAMETER * 12)
    expect(top.every((v) => v === 1)).toBe(true)
    expect(first.slice(ETERNA_CLOCK_DIAMETER * 12))
      .toEqual([0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0])
  })

  it('상태가 오를수록 뚫린 칸이 는다', () => {
    // 줄어드는 자리가 있으면 표를 잘못 옮긴 것이다 — 이긴 뒤에 길이 좁아질 수 없다
    const open = ETERNA_CLOCK_COLLISION.map((b) => b.filter((v) => v === 0).length)
    for (let i = 1; i < open.length - 1; i++) {
      expect(open[i]!, `${String(i)}번 상태`).toBeGreaterThan(open[i - 1]!)
    }
  })

  it('상태 다섯이 서로 다르다', () => {
    const seen = new Set(ETERNA_CLOCK_COLLISION.map((b) => b.join('')))
    expect(seen.size).toBe(ETERNA_CLOCK_STATES)
  })

  it('⚠️ 처음 상태에는 뛸 자리가 없다', () => {
    // 판이 통째로 막혀 있어서 넘을 것도 없다
    expect(ETERNA_JUMP_TILES[ETERNA_CLOCK.initial]).toBeNull()
    for (let s = 1; s < ETERNA_CLOCK_STATES; s++) expect(ETERNA_JUMP_TILES[s]).not.toBeNull()
  })

  it('뛰는 칸이 시계 판 안에 있다', () => {
    for (const jump of ETERNA_JUMP_TILES) {
      if (jump === null) continue
      expect(jump.x).toBeGreaterThanOrEqual(ETERNA_CLOCK_LEFT)
      expect(jump.x).toBeLessThan(ETERNA_CLOCK_LEFT + ETERNA_CLOCK_DIAMETER)
      expect(jump.z).toBeGreaterThanOrEqual(ETERNA_CLOCK_TOP)
      expect(jump.z).toBeLessThan(ETERNA_CLOCK_TOP + ETERNA_CLOCK_DIAMETER)
    }
  })
})

describe('통행', () => {
  beforeEach(() => { resetEternaGym() })

  it('시계 판 밖은 안 본다', () => {
    initEternaGym(ETERNA_GYM_MAP, ETERNA_CLOCK.initial)
    expect(eternaBlockedAt(0, 0)).toBeNull()
    expect(eternaBlockedAt(ETERNA_CLOCK_LEFT - 1, ETERNA_CLOCK_TOP)).toBeNull()
  })

  it('⚠️ 「뚫렸다」는 답이 없다 — 격자로 내려보낸다', () => {
    // 뚫린 칸에 `false`를 내면 그 칸의 벽까지 뚫린다
    expect(eternaBlocked(ETERNA_CLOCK.initial, ETERNA_CLOCK_LEFT, ETERNA_CLOCK_TOP + 12)).toBeNull()
    expect(eternaBlocked(ETERNA_CLOCK.initial, ETERNA_CLOCK_LEFT, ETERNA_CLOCK_TOP)).toBe(true)
  })

  it('시계를 넘기면 막혔던 칸이 뚫린다', () => {
    initEternaGym(ETERNA_GYM_MAP, ETERNA_CLOCK.initial)
    // 판 한가운데를 지나는 여섯째 줄. 처음에는 통째로 막혀 있다
    const z = ETERNA_CLOCK_TOP + 6
    for (let dx = 5; dx <= 8; dx++) expect(eternaBlockedAt(ETERNA_CLOCK_LEFT + dx, z)).toBe(true)
    advanceEternaClock()
    settle()
    // 첫 트레이너를 이기면 그 줄이 오른쪽으로 뚫린다 — 분침이 비켰다
    for (let dx = 5; dx <= 8; dx++) expect(eternaBlockedAt(ETERNA_CLOCK_LEFT + dx, z)).toBeNull()
  })

  it('⚠️ 시계 판의 아랫줄과 분수 줄이 겹친다', () => {
    // 둘 다 z = 19다. **시계가 먼저** 걸리므로, 분수 줄이 통째로 열려도
    // 시계 아랫줄에 막힌 칸은 그대로 막혀 있다 — 차례를 뒤집으면 시계를
    // 안 풀고 그 자리로 지나간다
    initEternaGym(ETERNA_GYM_MAP, ETERNA_CLOCK.thirdTrainer)
    expect(ETERNA_FOUNTAIN_COLLISION[ETERNA_CLOCK.thirdTrainer]!.every((v) => v === 0)).toBe(true)
    expect(eternaBlockedAt(ETERNA_CLOCK_LEFT + 1, ETERNA_FOUNTAIN_Z)).toBe(true)
    // 시계 판 밖의 분수 줄은 뚫렸다
    expect(eternaBlockedAt(1, ETERNA_FOUNTAIN_Z)).toBeNull()
  })

  it('분수 줄이 처음에는 양쪽 끝이 막혀 있다', () => {
    initEternaGym(ETERNA_GYM_MAP, ETERNA_CLOCK.initial)
    expect(eternaBlockedAt(1, ETERNA_FOUNTAIN_Z)).toBe(true)
    expect(eternaBlockedAt(ETERNA_GYM_WIDTH, ETERNA_FOUNTAIN_Z)).toBe(true)
  })
})

describe('시계를 넘긴다', () => {
  beforeEach(() => { resetEternaGym() })

  it('⚠️ 통행은 즉시 바뀌고 바늘만 미끄러진다', () => {
    initEternaGym(ETERNA_GYM_MAP, ETERNA_CLOCK.initial)
    expect(advanceEternaClock()).toBe(ETERNA_CLOCK.firstTrainer)
    // 아직 바늘은 도는 중인데 상태는 이미 바뀌었다
    expect(eternaBusy()).toBe(true)
    expect(eternaState()).toBe(ETERNA_CLOCK.firstTrainer)
    settle()
    expect(eternaState()).toBe(ETERNA_CLOCK.firstTrainer)
  })

  it('관장까지 이기면 더 안 넘어간다', () => {
    expect(eternaNextState(ETERNA_CLOCK.gymLeader)).toBeNull()
    initEternaGym(ETERNA_GYM_MAP, ETERNA_CLOCK.gymLeader)
    expect(advanceEternaClock()).toBeNull()
    expect(eternaBusy()).toBe(false)
  })

  it('다 돌면 바늘 각이 그 시각의 값과 딱 맞는다', () => {
    initEternaGym(ETERNA_GYM_MAP, ETERNA_CLOCK.initial)
    advanceEternaClock()
    settle()
    const want = eternaHandAngles(
      ETERNA_CLOCK_TIMES[ETERNA_CLOCK.firstTrainer]!.hour,
      ETERNA_CLOCK_TIMES[ETERNA_CLOCK.firstTrainer]!.minute)
    const props = eternaProps()
    expect(props[0]!.rotY).toBeCloseTo(want.hour, 10)
    expect(props[1]!.rotY).toBeCloseTo(want.minute, 10)
  })

  it('바늘 둘이 같은 칸 위에 높이만 달리 선다', () => {
    initEternaGym(ETERNA_GYM_MAP, ETERNA_CLOCK.initial)
    const [hour, minute] = eternaProps()
    expect(hour!.x).toBe(minute!.x)
    expect(hour!.z).toBe(minute!.z)
    // 분침이 한 칸 위다 — 겹쳐 두면 서로 파고든다
    expect(minute!.y).toBe(hour!.y + 1)
  })
})

describe('시침을 뛰어넘는다', () => {
  beforeEach(() => { resetEternaGym() })

  it('⚠️ 바늘과 직각인 쪽으로만 뛴다', () => {
    initEternaGym(ETERNA_GYM_MAP, ETERNA_CLOCK.firstTrainer)
    const jump = ETERNA_JUMP_TILES[ETERNA_CLOCK.firstTrainer]!
    // 남북(0·1)으로는 뛰고 동서(2·3)로는 안 뛴다
    expect(eternaJumpAt(jump.x, jump.z, 0)).toBe(true)
    expect(eternaJumpAt(jump.x, jump.z, 1)).toBe(true)
    expect(eternaJumpAt(jump.x, jump.z, 2)).toBe(false)
    expect(eternaJumpAt(jump.x, jump.z, 3)).toBe(false)
  })

  it('둘째 트레이너 자리는 동서로만 뛴다', () => {
    initEternaGym(ETERNA_GYM_MAP, ETERNA_CLOCK.secondTrainer)
    const jump = ETERNA_JUMP_TILES[ETERNA_CLOCK.secondTrainer]!
    expect(eternaJumpAt(jump.x, jump.z, 2)).toBe(true)
    expect(eternaJumpAt(jump.x, jump.z, 0)).toBe(false)
  })

  it('그 칸이 아니면 안 뛴다', () => {
    initEternaGym(ETERNA_GYM_MAP, ETERNA_CLOCK.firstTrainer)
    expect(eternaJumpAt(0, 0, 0)).toBe(false)
  })

  it('이 체육관이 아니면 안 뛴다', () => {
    expect(eternaJumpAt(11, 18, 0)).toBe(false)
  })
})
