// 어느 칸에서 어느 번호가 실제로 **나가는가.**
//
// 규칙은 `engine/actor/footstep`이 시험한다. 여기서 재는 것은 **이어 붙였는가**다 —
// 걸음을 흉내 내고 `playEffect`로 나간 번호를 모은다. 소리는 `pnpm shot`으로
// 못 재므로 이 시험이 그 자리를 대신한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MapGrid } from '../engine/map/grid'
import { Behavior } from '../engine/map/zone'
import { SFX } from '../engine/audio/sfx'
import { BUMP_FRAMES } from '../engine/actor/footstep'
import { DIR } from '../engine/script/movement'
import { resetBridge } from '../engine/actor/bridge'
import { type PendingWarp, world as mapWorld } from '../engine/map/world'
import { worldState } from '../state/worldState'

/** 나간 번호를 모은다. `music`은 실제로 오디오 문맥을 여니까 갈아 끼운다 */
const played: number[] = []
vi.mock('../engine/audio/music', () => ({
  music: { playEffect: (seq: number) => { played.push(seq); return Promise.resolve() } },
}))

const { resetWalkSound, walkSoundSystem } = await import('./walkSound')

/** 칸마다 거동값을 돌려주는 가짜 격자. `behavior`만 쓰인다 */
function gridOf(at: (tx: number, tz: number) => number): MapGrid {
  return { behavior: at } as unknown as MapGrid
}

/**
 * 거기서 시작한다 — 지나온 칸을 지우고 모은 번호도 비운다.
 *
 * ⚠️ **시험마다 이걸로 시작해야 한다.** `trace`가 모듈 하나짜리라 앞 시험이
 * 끝난 자리가 남고, 그러면 첫 프레임이 그 사이를 통째로 밟은 것으로 센다
 */
function startAt(x: number, z: number): void {
  worldState.player.position.set(x, 0, z)
  worldState.player.bumpDir = -1
  resetWalkSound()
  played.length = 0
}

/** 그 자리에 서서 한 프레임 민다 */
function frameAt(x: number, z: number, bumpDir = -1): void {
  worldState.player.position.set(x, 0, z)
  worldState.player.bumpDir = bumpDir
  walkSoundSystem.fixedUpdate()
}

describe('걸어가면 밟은 칸의 소리가 난다', () => {
  beforeEach(() => {
    played.length = 0
    resetBridge()
    mapWorld.pending = null
    worldState.player.bumpDir = -1
  })

  it('평지를 걸으면 한 소리도 안 난다', () => {
    mapWorld.grid = gridOf(() => Behavior.NORMAL)
    startAt(0.5, 0.5)
    for (let tz = 1; tz < 8; tz += 1) frameAt(0.5, tz + 0.5)
    expect(played).toEqual([])
  })

  it('눈밭을 걸으면 칸마다 한 번씩 난다', () => {
    mapWorld.grid = gridOf(() => Behavior.SNOW_DEEP)
    startAt(0.5, 0.5)
    // 일곱 칸을 지나간다 — 밟은 칸마다 한 번이다
    for (let tz = 1; tz <= 7; tz += 1) frameAt(0.5, tz + 0.5)
    expect(played).toEqual(Array.from({ length: 7 }, () => SFX.SNOW_STEP))
  })

  it('풀숲에 들어갈 때와 나올 때 둘 다 난다', () => {
    // z = 3만 긴 풀이다. 2 → 3(들어감) · 3 → 4(나옴) 둘 다 나야 한다
    mapWorld.grid = gridOf((_tx, tz) => (tz === 3 ? Behavior.VERY_TALL_GRASS : Behavior.NORMAL))
    startAt(0.5, 1.5)
    frameAt(0.5, 2.5)
    frameAt(0.5, 3.5)
    frameAt(0.5, 4.5)
    frameAt(0.5, 5.5)
    expect(played).toEqual([SFX.GRASS_BRUSH, SFX.GRASS_BRUSH])
  })

  it('워프로 도착한 칸은 밟은 것으로 안 센다', () => {
    mapWorld.grid = gridOf(() => Behavior.SNOW_DEEP)
    startAt(0.5, 0.5)
    // 스무 칸 밖으로 옮겨진다 — 걸은 것이 아니다. `MAX_TILES`가 사이를 버리고
    // 닿은 칸 하나만 내므로 소리도 하나다 (`stepTrace`)
    frameAt(0.5, 20.5)
    expect(played).toEqual([SFX.SNOW_STEP])
  })

  it('맵이 바뀌는 중에는 안 난다', () => {
    mapWorld.grid = gridOf(() => Behavior.SNOW_DEEP)
    startAt(0.5, 0.5)
    // 워프가 걸린 프레임이다 — 무엇으로 걸렸는지는 안 본다
    mapWorld.pending = { map: 0, x: 0, z: 0, facing: 0 } as unknown as PendingWarp
    frameAt(0.5, 1.5)
    mapWorld.pending = null
    expect(played).toEqual([])
  })
})

describe('벽에 부딪히면', () => {
  beforeEach(() => {
    played.length = 0
    resetBridge()
    mapWorld.pending = null
    mapWorld.grid = gridOf(() => Behavior.NORMAL)
    startAt(0.5, 0.5)
  })

  it('16프레임마다 한 번이지 프레임마다가 아니다', () => {
    // 1초를 밀고 있는다. 매 프레임 판정이면 60번이 난다
    for (let f = 0; f < 60; f += 1) frameAt(0.5, 0.5, DIR.north)
    expect(played).toEqual(Array.from({ length: 4 }, () => SFX.WALL_HIT))
    expect(BUMP_FRAMES).toBe(16)
  })

  it('안 밀면 안 난다', () => {
    for (let f = 0; f < 60; f += 1) frameAt(0.5, 0.5)
    expect(played).toEqual([])
  })

  it('눈밭에서 벽을 밀면 벽 소리와 눈 소리가 같이 난다', () => {
    // 원작이 막힌 걸음에도 `PlayWalkSE`를 부른다 (`player_move.c` 181줄)
    mapWorld.grid = gridOf(() => Behavior.SNOW_DEEP)
    startAt(0.5, 0.5)
    frameAt(0.5, 0.5, DIR.north)
    expect(played).toEqual([SFX.WALL_HIT, SFX.SNOW_STEP])
  })

  it('긴 풀에서 벽을 밀면 풀 소리는 안 난다', () => {
    // `MovementAction_IsWalkOnSpotSlow`가 풀 하나에만 걸려 있다
    mapWorld.grid = gridOf(() => Behavior.VERY_TALL_GRASS)
    startAt(0.5, 0.5)
    frameAt(0.5, 0.5, DIR.north)
    expect(played).toEqual([SFX.WALL_HIT])
  })
})

describe('워프에 대고 걸으면 조용하다 (PLAYER_COLLISION_WARP)', () => {
  const DOOR = 0x69
  const WARP_ENTRANCE_NORTH = 0x64

  beforeEach(() => {
    played.length = 0
    resetBridge()
    mapWorld.pending = null
  })

  it('앞 칸이 문이면 벽 소리가 안 난다', () => {
    // ⚠️ **우리 격자는 문 타일이 통행 불가다.** 이 갈래가 없으면 원작이 조용히
    // 들어가는 문마다 벽 소리가 난다
    mapWorld.grid = gridOf((_tx, tz) => (tz === 0 ? DOOR : Behavior.NORMAL))
    startAt(0.5, 1.5)
    for (let f = 0; f < 60; f += 1) frameAt(0.5, 1.5, DIR.north)
    expect(played).toEqual([])
  })

  it('선 칸이 그 방향의 워프 어귀여도 안 난다', () => {
    mapWorld.grid = gridOf(() => WARP_ENTRANCE_NORTH)
    startAt(0.5, 1.5)
    frameAt(0.5, 1.5, DIR.north)
    expect(played).toEqual([])
    // 다른 방향으로 밀면 그때는 벽이다 — 어귀는 방향마다 값이 따로다
    for (let f = 0; f < BUMP_FRAMES; f += 1) frameAt(0.5, 1.5, DIR.south)
    expect(played).toEqual([SFX.WALL_HIT])
  })
})
