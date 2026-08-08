// 혼자 하는 짓 (`ambient.ts`)
//
// 조용히 틀릴 자리가 넷이다:
//
//   ① **표가 밀린다.** 유형 번호 → 방향 묶음을 파일 셋에 걸쳐 이어 붙였다.
//      한 칸만 밀려도 두리번거릴 사람이 걸어가 버린다. 다행히 **이름이 답을
//      적어 두었다** — 뽑기가 그것과 맞는지 여기서 다시 본다.
//   ② **`LockAll`이 안 먹는다.** 이것을 붙인 이유의 절반이 그거였다. 멈춤
//      깃발을 세웠는데 계속 걸어 다니면 대화 중에 상대가 도망간다.
//   ③ **벽을 뚫는다.** 배회는 범위가 아니라 벽이 가둔다(원작도 그렇다) —
//      벽 판정이 빠지면 사람이 집 밖으로 걸어 나간다.
//   ④ **칸 사이에 멈춘다.** 걸음이 8프레임인데 그 도중에 다음 걸음을 걸면
//      좌표가 정수로 안 떨어지고, 그러면 말을 거는 칸 판정이 어긋난다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, expect, it } from 'vitest'
import { parseScriptMeta } from '../script/data'
import { worldState } from '../../state/worldState'
import { activeZone, type CollisionGrid } from '../map/zone'
import { clearAmbient, npcAmbient, setAmbientTables } from './ambient'
import { npcActors, type NpcActor } from './npcs'
import { withData } from '../../data/romData.testkit'

const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('scripts.json')
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

/** `generated/movement_types.txt`의 줄 번호. 실측한 자리 그대로다 */
const TYPE = {
  none: 0,
  lookAround: 2,
  wanderAround: 3,
  wanderWestEast: 5,
  lookSouth: 15,
  rotateCounterclockwise: 18,
  pace: 20,
  route: 21,
} as const

/** `MOVEMENT_ACTION_WALK_NORMAL_*` — 한 칸에 8프레임 */
const WALK_FRAMES = 8

/**
 * 걸음 하나가 실제로 먹는 프레임.
 *
 * 걸음을 **거는 프레임에는 안 걷는다** — 원작도 그렇다. `MapObject_Move`가 한
 * 프레임에 유형을 굴리거나(`sub_02062B14`) 동작을 굴리거나(`DoMovementAction`)
 * 둘 중 하나만 하므로, 유형이 동작을 걸어 둔 프레임은 그대로 지나간다
 */
const STEP_FRAMES = WALK_FRAMES + 1

/**
 * 벽으로 두른 방 하나.
 *
 * 안쪽이 `[1, size-2]`고 테두리가 막혀 있다. 배회가 갇히는지 보려면 나갈 수
 * 있는 자리가 반드시 있어야 한다 — 사방이 다 막히면 안 움직이는 것과 구분이 안 된다
 */
function room(size: number): CollisionGrid {
  const wall = (t: number) => t <= 0 || t >= size - 1
  return {
    isBlockedAtWorld: (x, z) => wall(Math.floor(x)) || wall(Math.floor(z)),
    behaviorAtWorld: () => 0,
    heightAtWorld: () => 0,
  }
}

function actor(move: number, x: number, z: number, dir = 0): NpcActor {
  const npc = { sprite: 0, x, z, move, localID: 1 } as NpcActor['info']
  return { localID: 1, info: npc, gfx: npc.sprite, x, z, y: 0, dir, visible: true, movementType: move, params: [], ambient: null }
}

/** n 프레임 굴린다 */
const run = (n: number): void => { for (let i = 0; i < n; i++) npcAmbient.tick() }

maybe('혼자 하는 짓', () => {
  const meta = parseScriptMeta(read('scripts.json'))

  beforeEach(() => {
    setAmbientTables(meta)
    activeZone.grid = room(8)
    npcActors.list = []
    npcActors.byLocalID.clear()
    npcActors.paused = false
    clearAmbient()
    // 사람 판정에 걸리지 않게 주인공을 방 밖에 둔다
    worldState.player.position.set(-99, 0, -99)
    // 늘 첫 후보를 고른다. 갈래를 보는 시험이라 난수까지 원작을 맞출 이유가 없다
    npcAmbient.random = () => 0
  })

  it('표가 이름과 맞는다 — 갈래·방향·기다림', () => {
    expect(npcAmbient.delays).toEqual([16, 32, 48, 64])
    expect(npcAmbient.rotateFrames).toBe(24)
    expect(npcAmbient.types[TYPE.none]?.kind).toBe('other')
    expect(npcAmbient.types[TYPE.lookAround]).toMatchObject({ kind: 'look', dirs: [0, 1, 2, 3] })
    // 0 북 · 1 남 · 2 서 · 3 동. WEST_AND_EAST가 [2,3]이 아니면 표가 밀린 것이다
    expect(npcAmbient.types[TYPE.wanderWestEast]).toMatchObject({ kind: 'wander', dirs: [2, 3] })
    expect(npcAmbient.types[TYPE.lookSouth]).toMatchObject({ kind: 'face', dirs: [1] })
    // WALK_NORTH_EAST_WEST_SOUTH = 북·동·서·남 = 0·3·2·1
    expect(npcAmbient.types[TYPE.route]).toMatchObject({ kind: 'route', dirs: [0, 3, 2, 1] })
  })

  it('한 쪽만 보는 사람은 아무것도 안 한다', () => {
    const npc = actor(TYPE.lookSouth, 3, 3, 1)
    npcActors.list = [npc]
    run(200)
    expect({ x: npc.x, z: npc.z, dir: npc.dir }).toEqual({ x: 3, z: 3, dir: 1 })
  })

  it('두리번거리는 사람은 제자리에서 방향만 바꾼다', () => {
    const npc = actor(TYPE.lookAround, 3, 3, 1)
    npcActors.list = [npc]
    // 첫 후보(16프레임)를 세고 첫 방향(북)으로 돈다
    run(16)
    expect(npc.dir).toBe(1)
    run(1)
    expect(npc.dir).toBe(0)
    run(300)
    expect({ x: npc.x, z: npc.z }).toEqual({ x: 3, z: 3 })
  })

  it('배회하는 사람은 8프레임에 딱 한 칸 간다', () => {
    // 북(0)을 고르게 두고 방 가운데 세운다
    const npc = actor(TYPE.wanderAround, 3, 3)
    npcActors.list = [npc]
    run(17) // 16프레임 기다리고 17번째에 걸음을 건다
    expect(npc.dir).toBe(0)
    // 걷는 중에는 칸 사이에 있다 — 그래야 화면이 걷는 장을 넘긴다
    run(WALK_FRAMES - 1)
    expect(Number.isInteger(npc.z)).toBe(false)
    run(1)
    expect({ x: npc.x, z: npc.z }).toEqual({ x: 3, z: 2 })
  })

  it('벽 쪽을 고르면 고개만 돌리고 안 움직인다', () => {
    // z=1이 안쪽 끝이다. 북(0)은 벽이라 못 간다
    const npc = actor(TYPE.wanderAround, 3, 1, 1)
    npcActors.list = [npc]
    run(17)
    expect(npc.dir).toBe(0)
    expect({ x: npc.x, z: npc.z }).toEqual({ x: 3, z: 1 })
  })

  it('배회해도 방을 못 나간다 — 가두는 것은 범위가 아니라 벽이다', () => {
    npcAmbient.random = Math.random
    const npc = actor(TYPE.wanderAround, 3, 3)
    npcActors.list = [npc]
    run(5000)
    expect(npc.x).toBeGreaterThanOrEqual(1)
    expect(npc.x).toBeLessThanOrEqual(6)
    expect(npc.z).toBeGreaterThanOrEqual(1)
    expect(npc.z).toBeLessThanOrEqual(6)
  })

  it('LockAll이 실제로 멈춘다', () => {
    const npc = actor(TYPE.wanderAround, 3, 3)
    npcActors.list = [npc]
    npcActors.paused = true
    run(600)
    expect({ x: npc.x, z: npc.z, dir: npc.dir }).toEqual({ x: 3, z: 3, dir: 0 })
    // 놓아주면 다시 움직인다 — 안 그러면 멈춘 게 아니라 죽은 것이다
    npcActors.paused = false
    run(17 + WALK_FRAMES)
    expect(npc.z).toBe(2)
  })

  it('사람이 앞을 막으면 안 지나간다', () => {
    const npc = actor(TYPE.wanderAround, 3, 3)
    // 북쪽 칸에 다른 사람이 서 있다
    const blocker = actor(TYPE.none, 3, 2)
    npcActors.list = [npc, blocker]
    run(17 + WALK_FRAMES)
    expect({ x: npc.x, z: npc.z }).toEqual({ x: 3, z: 3 })
  })

  it('시계 반대로 도는 사람은 24프레임마다 북→서→남→동으로 돈다', () => {
    const npc = actor(TYPE.rotateCounterclockwise, 3, 3, 0)
    npcActors.list = [npc]
    for (const want of [2, 1, 3, 0]) {
      run(npcAmbient.rotateFrames + 1)
      expect(npc.dir).toBe(want)
    }
  })

  it('왔다 갔다 하는 사람은 벽에 닿으면 시작 칸으로 돌아온다', () => {
    // 북쪽을 보고 선다. z=1 벽까지 두 칸 가고 되돌아온다
    const npc = actor(TYPE.pace, 3, 3, 0)
    npcActors.list = [npc]
    run(STEP_FRAMES * 2)
    expect({ z: npc.z, dir: npc.dir }).toEqual({ z: 1, dir: 0 })
    // 벽을 만나 돌아선다
    run(STEP_FRAMES * 2)
    expect({ z: npc.z, dir: npc.dir }).toEqual({ z: 3, dir: 1 })
    // 시작 칸에 닿았으니 다시 북쪽이다 — 오가는 구간이 시작 칸과 벽 사이다
    run(1)
    expect(npc.dir).toBe(0)
  })

  it('차례로 도는 사람은 벽마다 다음 방향으로 넘어간다', () => {
    // 북(0) → 동(3) → 서(2) → 남(1). 방 가운데서 북으로 가다 벽에서 동으로 꺾는다
    const npc = actor(TYPE.route, 3, 3, 0)
    npcActors.list = [npc]
    run(STEP_FRAMES * 2)
    expect({ x: npc.x, z: npc.z, dir: npc.dir }).toEqual({ x: 3, z: 1, dir: 0 })
    // ⚠️ 벽에서 **돌아서는 게 아니라 고리의 다음 방향**으로 간다. 왔다 갔다와
    // 갈리는 자리다 — 반대쪽으로 보내면 이 사람도 왔다 갔다가 된다
    run(STEP_FRAMES)
    expect({ x: npc.x, z: npc.z, dir: npc.dir }).toEqual({ x: 4, z: 1, dir: 3 })
  })

  it('스크립트가 걸어 옮기는 중인 사람은 안 건드린다', () => {
    // 칸 사이에 서 있다 = 남의 걸음이 진행 중이다
    const npc = actor(TYPE.wanderAround, 3, 3)
    npcActors.list = [npc]
    npc.z = 2.5
    run(100)
    expect(npc.z).toBe(2.5)
  })

  it('안 보이는 사람은 안 굴린다', () => {
    const npc = actor(TYPE.wanderAround, 3, 3)
    npc.visible = false
    npcActors.list = [npc]
    run(100)
    expect({ x: npc.x, z: npc.z }).toEqual({ x: 3, z: 3 })
  })
})

maybe('배치표가 실제로 시키는 것', () => {
  const meta = parseScriptMeta(read('scripts.json'))
  const events = read('events.json') as { events: Record<string, { npcs?: { move: number }[] }> }

  it('717명이 혼자 무언가를 한다', () => {
    const count = new Map<string, number>()
    const still = new Map<string, number>()
    let total = 0
    for (const file of Object.values(events.events)) {
      for (const npc of file.npcs ?? []) {
        const type = meta.movementTypes[npc.move]
        const kind = type?.kind ?? 'other'
        count.set(kind, (count.get(kind) ?? 0) + 1)
        if (kind === 'other') still.set(type?.name ?? '?', (still.get(type?.name ?? '?') ?? 0) + 1)
        total++
      }
    }
    expect(total).toBe(3555)

    // 움직이는 사람
    expect(count.get('wander')).toBe(349)
    expect(count.get('look')).toBe(290)
    expect(count.get('pace')).toBe(38)
    expect(count.get('route')).toBe(33)
    expect(count.get('rotate')).toBe(7)
    const moving = ['wander', 'look', 'pace', 'route', 'rotate']
      .reduce((sum, kind) => sum + (count.get(kind) ?? 0), 0)
    expect(moving).toBe(717)

    // 서 있는 것이 맞는 사람 — 원작도 안 움직인다
    expect(count.get('face')).toBe(655)
    expect(still.get('NONE')).toBe(2051)

    // ⚠️ 여기 남은 132명이 **아직 안 옮긴 것**이다. 나무 열매 밭 118곳이
    // 대부분이고(자란 단계에 따라 모습이 바뀐다), 나머지는 변장한 트레이너
    // 11명과 따라오는 파트너 3명이다
    const notYet = total - moving - (count.get('face') ?? 0) - (still.get('NONE') ?? 0)
    expect(notYet).toBe(132)
    expect(still.get('BERRY_SOIL')).toBe(118)
  })
})
