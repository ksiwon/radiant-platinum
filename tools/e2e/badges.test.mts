// 다리들의 **표**가 롬·제품과 갈리지 않았는가 (`badges.mjs` · 지시서 §4·§5)
//
// ⚠️ **걸음을 재는 시험이 아니다.** 실제로 걸어지는가는 탐침과 `pnpm journey`가
// 잰다. 여기서 잠그는 것은 **표가 하나인가** 하나다 — 하네스가 손으로 옮겨 적은
// 좌표는 언젠가 한쪽만 고쳐지고, 그때 판은 「길이 없다」로 조용히 떨어진다
// (`two-bakers-must-match`).
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Behavior, isSurfable } from '../../src/engine/map/zone'
import { edgeBlocks as productEdgeBlocks } from '../../src/engine/actor/edgeBlock'
import { PASTORIA_WATER } from '../../src/engine/world/pastoriaGym'
import { VEILSTONE_GYM_MAP } from '../../src/engine/world/veilstoneGym'
import { MAP, PASTORIA, pastoriaButtons, VEILSTONE } from './badges.mjs'
import {
  bikeSlopes, edgeBlocks, gridOf, matrixOf, missingData, npcsOf, planPath, slopeClimbBan, SURFABLE, waterAt,
  warpsOf,
} from './route.mjs'

/** 자료를 아직 안 구운 기계에서는 **미실행**이다. 통과가 아니다 */
const HAVE = missingData().length === 0
const ROOT = resolve(import.meta.dirname, '../..')
const DECOMP = resolve(ROOT, 'raw/decomp/res/field/events')
/** 디컴프가 없는 기계에서는 롬 대조를 **안 돈다** — 건너뛴 것은 통과가 아니다 */
const HAVE_ROM = existsSync(DECOMP)

const romEvents = (name: string): {
  coord_events?: { script: number, x: number, z: number, width: number, length: number }[]
  object_events?: { id: string, script: number, x: number, z: number }[]
} => JSON.parse(readFileSync(resolve(DECOMP, `${name}.json`), 'utf8')) as never

describe.skipIf(!HAVE)('진흙 비탈', () => {
  /**
   * ⚠️ **거동값이 두 군데에 적혀 있다.** 제품은 `Behavior.BIKE_SLOPE_*`로,
   * 하네스는 `route.mjs`가 훑을 때 쓰는 숫자로. 한쪽만 고치면 계획이 다시
   * 걸어서 비탈을 오르려 든다 — 그때 판은 「길이 있다」고 말하며 선다
   */
  it('하네스가 쓰는 거동값이 제품의 그것이다', () => {
    expect(Behavior.BIKE_SLOPE_TOP).toBe(0xd9)
    expect(Behavior.BIKE_SLOPE_BOTTOM).toBe(0xda)
  })

  it('오버월드의 비탈을 전부 찾는다', () => {
    const slopes = bikeSlopes(0)
    expect(slopes.size).toBeGreaterThan(0)
    const grid = gridOf(0)
    for (const key of slopes) {
      const [x, z] = key.split(',').map(Number)
      const behavior = grid.at(x, z) & 0x7fff
      expect([Behavior.BIKE_SLOPE_TOP, Behavior.BIKE_SLOPE_BOTTOM]).toContain(behavior)
      // 비탈은 걸을 수 있는 칸으로 표시돼 있다 — 그래서 계획이 속았다
      expect(grid.blocked(x, z)).toBe(false)
    }
  })

  /**
   * 209번도로의 그 자리 (실측 2026-09-22 · 배지4 탐침 1판에서 9분을 섰다).
   * 걸어서는 **돌아가는 길**이 있고, 그것이 이 규칙을 쓸 수 있는 근거다 —
   * 돌아갈 길이 없으면 막는 것이 곧 못 가는 것이 된다
   */
  it('209번도로는 걸어서도 돌아갈 길이 있다', () => {
    const grid = gridOf(0)
    const slopes = bikeSlopes(0)
    const from = { x: 562, z: 693 }
    const toSolaceon = (x: number, z: number): boolean => grid.zoneAt(x, z) === MAP.solaceon
    const riding = planPath(0, from, toSolaceon, {})
    const walking = planPath(0, from, toSolaceon, {
      avoidStep: (nx: number, nz: number, key: string) =>
        key === 'ArrowUp' && slopes.has(`${String(nx)},${String(nz)}`),
    })
    expect(riding.keys).not.toBeNull()
    expect(walking.keys).not.toBeNull()
    // 돌아가는 길이라 더 길다 — 같으면 비탈을 안 지나고 있다는 뜻이라 시험이 헛돈다
    expect(walking.keys!.length).toBeGreaterThan(riding.keys!.length)
    expect(riding.keys!.length).toBe(22)
    expect(walking.keys!.length).toBe(38)
  })

  /**
   * ⚠️ **탄 채로도 막는다** (`slopeClimbBan`). 하네스의 자전거는 3단이라 전속력이
   * 안 되고, 전속력이 아니면 비탈에서 미끄러져 내려온다. 실측(2026-09-24 대표 구간
   * 9판): 탄 채로 22걸음짜리 비탈 길을 골라 (562,693)에서 20분을 미끄러졌다.
   *
   * 막는 판단은 **타고 있는지를 묻지 않는다** — 묻는 인자가 없는 것이 잠금이다
   */
  it('계획은 탄 채로도 비탈을 오르지 않는다', () => {
    const grid = gridOf(0)
    const ban = slopeClimbBan(0)
    expect(ban).not.toBeNull()
    const toSolaceon = (x: number, z: number): boolean => grid.zoneAt(x, z) === MAP.solaceon
    const slopes = bikeSlopes(0)
    for (const from of [{ x: 562, z: 693 }, { x: 560, z: 707 }]) {
      const plan = planPath(0, from, toSolaceon, { avoidStep: ban })
      expect(plan.keys).not.toBeNull()
      let x = from.x, z = from.z
      for (const key of plan.keys!) {
        const [dx, dz] = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[key as 'ArrowUp']
        x += dx; z += dz
        expect(key === 'ArrowUp' && slopes.has(`${String(x)},${String(z)}`)).toBe(false)
      }
    }
    // 내려오는 걸음은 막지 않는다 — 비탈 꼭대기에서 남쪽으로
    expect(ban!(562, 692, 'ArrowDown')).toBe(false)
    expect(ban!(562, 692, 'ArrowUp')).toBe(true)
  })

  it('비탈이 없는 행렬에서는 아무것도 안 막는다', () => {
    // 무쇠 체육관(47)은 실내 행렬이고 비탈이 없다
    const inside = matrixOf(47)
    expect(bikeSlopes(inside).size).toBe(0)
    expect(slopeClimbBan(inside)).toBeNull()
  })
})

/**
 * **물** (`route.mjs`의 `SURFABLE` · JOURNEY_BADGE67 §6.1). 격자에 통행 불가로 안
 * 찍혀 있어서 모르면 계획이 물 위를 걷는 길을 낸다
 */
describe('물', () => {
  it('하네스의 한쪽 막음 표가 제품의 것과 같다 — 거동값 짝 전부 · 네 방향', () => {
    let mismatch = 0
    for (let a = 0; a < 0x100; a++) {
      for (let b = 0; b < 0x100; b++) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (edgeBlocks(a, b, dx, dz) !== productEdgeBlocks(a, b, dx, dz)) mismatch++
        }
      }
    }
    expect(mismatch).toBe(0)
  })

  it('하네스의 물 표가 제품의 isSurfable과 같다 — 거동값 전부', () => {
    for (let b = 0; b < 0x100; b++) expect(SURFABLE.has(b), `거동값 0x${b.toString(16)}`).toBe(isSurfable(b))
  })
})

describe.skipIf(!HAVE)('물 (자료)', () => {
  /**
   * 218번도로 — 축복 쪽 게이트에서 들어선 칸 (120,758) → 운하 쪽 게이트 워프.
   * 파도타기 없이는 못 건넌다(롬의 길 그대로). 값은 2026-09-24에 이 계획으로 잰 것이다
   */
  it('218번도로는 파도타기로만 건넌다', () => {
    const from = { x: 120, z: 758 }
    const doors = warpsOf(MAP.route218).filter((w) => w.to === MAP.gate218Canalave)
    expect(doors.length).toBeGreaterThan(0)
    const goal = (x: number, z: number): boolean => doors.some((w) => w.x === x && w.z === z)
    expect(planPath(0, from, goal, { enterBlockedGoal: true }).status).toBe('unreachable')
    const wet = planPath(0, from, goal, { enterBlockedGoal: true, surf: true })
    expect(wet.keys).not.toBeNull()
    expect(wet.keys!.length).toBe(64)
  })

  it('물 위에서 출발하면 파도타기 중으로 본다 — 물을 막으면 한 걸음도 못 간다', () => {
    const grid = gridOf(0)
    let start: { x: number, z: number } | null = null
    for (let x = 80; x < 120 && start === null; x++) if (waterAt(0, x, 758)) start = { x, z: 758 }
    expect(start).not.toBeNull()
    const land = (x: number, z: number): boolean => !waterAt(0, x, z) && !grid.blocked(x, z)
    expect(planPath(0, start!, land).keys).not.toBeNull()
  })
})

describe.skipIf(!HAVE)('들판 체육관 단추', () => {
  it('구운 좌표 이벤트에서 열 자리를 읽는다', () => {
    const buttons = pastoriaButtons()
    expect(buttons).toHaveLength(10)
    // 물 높이 셋은 **제품의 값**이다. 하네스가 0·2·4를 따로 적지 않는다
    const by = (w: number) => buttons.filter((b) => b.water === w).length
    expect(by(PASTORIA_WATER.high), '파랑').toBe(2)
    expect(by(PASTORIA_WATER.middle), '초록').toBe(4)
    expect(by(PASTORIA_WATER.low), '노랑').toBe(4)
  })

  it.skipIf(!HAVE_ROM)('그 열 자리가 롬의 좌표 이벤트와 같다', () => {
    const rom = romEvents('events_pastoria_city_gym').coord_events ?? []
    /** 항목 차례: 1 `BlueButton` → 2 · 2 `GreenButton` → 3 · 3 `YellowButton` → 4 */
    const want = rom
      .filter((c) => c.script >= 2 && c.script <= 4)
      .map((c) => `${String(c.x)},${String(c.z)}@${String(c.script)}`)
      .sort()
    const script = { [PASTORIA_WATER.high]: 2, [PASTORIA_WATER.middle]: 3, [PASTORIA_WATER.low]: 4 }
    const got = pastoriaButtons()
      .map((b) => `${String(b.x)},${String(b.z)}@${String(script[b.water])}`)
      .sort()
    expect(got).toEqual(want)
    // 단추는 **한 칸짜리**다 — 넓으면 밟을 자리를 우리가 잘못 고르고 있다는 뜻이다
    for (const c of rom.filter((one) => one.script >= 2 && one.script <= 4)) {
      expect(c.width, `${String(c.x)},${String(c.z)}의 너비`).toBe(1)
      expect(c.length, `${String(c.x)},${String(c.z)}의 길이`).toBe(1)
    }
  })

  it('문 위 칸과 맥실러 아래 칸은 격자가 안 막는다 — 전제', () => {
    const g = gridOf(matrixOf(PASTORIA.map))
    expect(g.blocked(PASTORIA.door.x, PASTORIA.door.z), '문 위 칸').toBe(false)
    expect(g.blocked(PASTORIA.front.x, PASTORIA.front.z), '맥실러 아래 칸').toBe(false)
  })
})

describe.skipIf(!HAVE)('장막 체육관 자리', () => {
  it('상수가 제품의 맵 번호와 같다', () => {
    expect(VEILSTONE.map).toBe(VEILSTONE_GYM_MAP)
  })

  it('문 위 칸과 자두 아래 칸은 격자가 안 막는다 — 전제', () => {
    const g = gridOf(matrixOf(VEILSTONE.map))
    expect(g.blocked(VEILSTONE.door.x, VEILSTONE.door.z), '문 위 칸').toBe(false)
    expect(g.blocked(VEILSTONE.front.x, VEILSTONE.front.z), '자두 아래 칸').toBe(false)
  })
})

describe.skipIf(!HAVE || !HAVE_ROM)('넷째·다섯째 배지 길의 자리들', () => {
  /**
   * 맥실러는 배치표에 **체육관 문 칸**으로 적혀 있고 숨어 있다 — 좌표 이벤트가
   * 그 문을 열어 그를 꺼냈다가 다시 치운다. 이 자리가 바뀌면 §4.1 ④의 이야기가
   * 다른 곳에서 벌어진다는 뜻이다
   */
  it('장막시티의 맥실러가 체육관 문 칸에 적혀 있다', () => {
    const rom = romEvents('events_veilstone_city')
    const wake = (rom.object_events ?? []).find((o) => o.id === 'LOCALID_CRASHER_WAKE')
    const door = warpsOf(MAP.veilstone).find((w) => w.to === VEILSTONE.map)
    expect(wake, '맥실러').toBeDefined()
    expect(door, '체육관 문').toBeDefined()
    expect([wake?.x, wake?.z]).toEqual([door?.x, door?.z])
  })

  /** 동행 상대는 **스크립트 16**이다 (지시서 §4.1 ⑦ — 엔트리 차례로 셌다) */
  it('장막시티 동행 상대가 스크립트 16이다', () => {
    const rom = romEvents('events_veilstone_city')
    const one = (rom.object_events ?? []).find((o) => o.id === 'LOCALID_COUNTERPART')
    expect(one?.script).toBe(16)
    expect(npcsOf(MAP.veilstone).some((n) => n.script === 16), '구운 명부에도 있다').toBe(true)
  })

  /**
   * ⚠️ **비전머신02는 창고 바닥의 도구 볼이다** (지시서 §4.1 ⑧′).
   * 핸섬은 말만 한다 — 이 자리가 바뀌면 줍는 걸음이 빈 칸을 친다
   */
  it('비전머신02가 창고 (13,8)의 도구 볼이다', () => {
    const rom = romEvents('events_veilstone_city_galactic_warehouse')
    const ball = (rom.object_events ?? []).find((o) => o.id === 'LOCALID_ITEM_HM02')
    expect([ball?.x, ball?.z]).toEqual([13, 8])
  })

  /** 들판 체육관 문 앞의 라이벌전은 **한 칸**이다 — 정확히 그 칸을 밟아야 선다 */
  it('들판 라이벌전이 체육관 문 아래 한 칸이다', () => {
    const rom = romEvents('events_pastoria_city')
    const rival = (rom.coord_events ?? []).find((c) => c.script === 18)
    const door = warpsOf(MAP.pastoria).find((w) => w.to === PASTORIA.map)
    expect(rival?.width).toBe(1)
    expect(rival?.length).toBe(1)
    expect([rival?.x, rival?.z]).toEqual([door?.x, (door?.z ?? 0) + 1])
  })
})
