// 1인칭 시선이 **몸이 보는 쪽에서 출발하는가** (`actor/player`의 `seatLook`)
//
// ⚠️ **들어가자마자 북쪽을 봤다.** 1인칭은 고정 스텝마다 시선(yaw)으로 몸을 덮는데
// (`facingFromYaw`), yaw는 마우스만 움직이고 시작값이 0(북쪽)이다. 그래서 남쪽을
// 보던 사람이 V를 누르면 화면도 몸도 북쪽으로 홱 돌았고, 워프가 정해 준 도착
// 방향(`ScrCmd_Warp`)도 다음 스텝에 지워졌다 — 집에서 나오자마자 방금 나온 문을
// 보고 W를 누르면 그 문으로 되돌아 들어갔다.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEEP_MUD_PRESSES, MUD_JUMP_TIME, MUD_TURN_FRAMES, deepMud, mudPressDir, playerSystem,
  resetDeepMud, stuckInDeepMud, terrainSink,
} from './player'
import { cameraSystem } from './camera'
import { drainBikeCues } from './bikeTerrain'
import { facingFromYaw } from '../input/mouse'
import { activeZone, Behavior, isDeepMudWithGrass, type CollisionGrid } from '../map/zone'
import { mudEncounter } from '../battle/encounter'
import { DIR } from '../script/movement'
import { worldState } from '../../state/worldState'

/** 원작 방향 번호로 접는다 — 남 0 · 동 1 · 북 2 · 서 3 (`turnInPlace.test`와 같다) */
const quarter = (facing: number): number =>
  ((Math.round(facing / (Math.PI / 2)) % 4) + 4) % 4

/** 빈 판에 세워 두고 스텝을 돌린다. 아무 키도 안 누른다 */
function stand(steps = 1): void {
  for (let i = 0; i < steps; i++) playerSystem.fixedUpdate(1 / 60)
}

function reset(mode: 'first' | 'third', facing: number): void {
  activeZone.grid = null
  const p = worldState.player
  p.position.set(0.5, 0, 0.5)
  p.prevPosition.copy(p.position)
  p.velocity.set(0, 0, 0)
  p.facing = facing
  p.hop.active = false
  p.surfing = false
  p.cycling = false
  p.riding = false
  p.flying = false
  worldState.input.move.set(0, 0)
  worldState.camera.mode = mode
  worldState.camera.yaw = 0
  worldState.camera.pitch = 0
  cameraSystem.free = null
}

afterEach(() => {
  worldState.camera.mode = 'third'
  cameraSystem.free = null
  // 1인칭을 떠난 스텝을 한 번 돌려 적어 둔 얼굴을 비운다 — 다음 시험이 새로 들어온다
  stand()
})

describe('1인칭은 몸이 보던 쪽에서 출발한다', () => {
  it('남쪽을 보던 사람이 1인칭에 들어가면 남쪽을 본다 — yaw π', () => {
    reset('third', 0)
    stand()
    worldState.camera.mode = 'first'
    worldState.camera.pitch = 0.4
    stand()
    expect(worldState.camera.yaw).toBeCloseTo(Math.PI, 10)
    // 고개도 바로 든다
    expect(worldState.camera.pitch).toBe(0)
    // 몸은 안 돈다 — 얼굴이 그대로 남쪽이다
    expect(worldState.player.facing).toBe(0)
  })

  it('동쪽을 보던 사람은 동쪽이다', () => {
    reset('third', Math.PI / 2)
    stand()
    worldState.camera.mode = 'first'
    stand(5)
    expect(quarter(facingFromYaw(worldState.camera.yaw))).toBe(1)
    expect(quarter(worldState.player.facing)).toBe(1)
  })

  it('1인칭 동안은 시선이 몸을 돌린다 — 마우스로 돌린 쪽이 앞이다', () => {
    reset('first', 0)
    stand()
    // 마우스가 서쪽으로 돌렸다 (`input/mouse`가 yaw만 바꾼다)
    worldState.camera.yaw = Math.PI * 1.5
    stand()
    expect(quarter(worldState.player.facing)).toBe(3)
    // 그 뒤로는 다시 심지 않는다 — 시선이 그대로다
    stand(5)
    expect(worldState.camera.yaw).toBe(Math.PI * 1.5)
  })

  // ⚠️ 워프 도착 방향 · 문을 나서는 얼굴 · 스크립트의 돌려세우기 · 불러오기가 이 길이다
  it('⚠️ 1인칭 중에 바깥에서 얼굴을 바꾸면 시선이 거기서 다시 심긴다', () => {
    reset('first', Math.PI)
    stand(3)
    expect(worldState.camera.yaw).toBeCloseTo(0, 10)
    worldState.camera.pitch = -0.3
    // `MapStreamer`의 `worldState.player.facing = facingOfDir(target.facing)` 자리
    worldState.player.facing = 0
    stand()
    expect(worldState.camera.yaw).toBeCloseTo(Math.PI, 10)
    expect(worldState.camera.pitch).toBe(0)
    expect(worldState.player.facing).toBe(0)
  })

  // 스크립트가 카메라를 쥔 동안은 3인칭 렌즈다 (`camera`의 `firstPersonView`) —
  // 마우스가 돌릴 시선이 화면에 없으니 몸이 마우스를 따라 돌면 안 된다
  it('스크립트 카메라 동안은 마우스가 몸을 못 돌린다', () => {
    reset('first', 0)
    stand()
    cameraSystem.free = { x: 10, z: 10 }
    worldState.camera.yaw = Math.PI / 2
    stand()
    expect(worldState.player.facing).toBe(0)
    expect(worldState.camera.yaw).toBeCloseTo(Math.PI, 10)
    // 그동안 스크립트가 돌려세우면 그 쪽을 따른다
    worldState.player.facing = Math.PI / 2
    stand()
    expect(quarter(worldState.player.facing)).toBe(1)
    // 놓으면 그 얼굴에서 다시 마우스가 쥔다
    cameraSystem.free = null
    stand()
    expect(quarter(facingFromYaw(worldState.camera.yaw))).toBe(1)
  })

  it('3인칭은 yaw를 안 건드린다 — 원작처럼 카메라가 북쪽에 고정이다', () => {
    reset('third', 0)
    worldState.camera.yaw = 1.234
    stand(3)
    expect(worldState.camera.yaw).toBe(1.234)
  })
})

// ── 깊은 진흙 (`FieldTask_StuckInDeepMud`, `overlay005/ov5_021DFB54.c` 861~956줄) ──

/** SDAT 목차 번호 — 우리가 구운 `public/data/sound/index.json`에서 이름으로 찾았다 */
const ZUPO = 1617
const ZUPO2 = 1618
const DANSA = 1547
const SUTYA2 = 1607

/** (5,5) 한 칸만 `mud`이고 나머지는 평지인 판 */
function marsh(mud: number): CollisionGrid {
  const at = (tx: number, tz: number) => (tx === 5 && tz === 5 ? mud : Behavior.NORMAL)
  return {
    isBlockedAtWorld: () => false,
    behaviorAtWorld: (x, z) => at(Math.floor(x), Math.floor(z)),
    heightAtWorld: () => 0,
    bakedHeightAtWorld: () => 0,
    behavior: at,
    isBlocked: () => false,
  }
}

/** 그 쪽으로 `frames`프레임 누른다 (3인칭이라 월드 축 그대로다) */
function hold([x, z]: readonly [number, number], frames: number): void {
  worldState.input.move.set(x, z)
  stand(frames)
  worldState.input.move.set(0, 0)
}
const EAST = [1, 0] as const
const NORTH = [0, -1] as const

/** 진흙 서쪽 칸 (4,5)에 동쪽을 보고 세워 두고, 동쪽으로 걸어 들어가 붙들린다 */
function walkIn(mud: number): void {
  reset('third', Math.PI / 2)
  activeZone.grid = marsh(mud)
  worldState.player.position.set(4.5, 0, 5.5)
  worldState.player.prevPosition.copy(worldState.player.position)
  resetDeepMud()
  stand()
  drainBikeCues()
  hold(EAST, 30)
}

describe('깊은 진흙은 붙든다', () => {
  beforeEach(() => { mudEncounter.roll = null })
  afterEach(() => {
    mudEncounter.roll = null
    activeZone.grid = null
    resetDeepMud()
    drainBikeCues()
  })

  it('붙드는 칸은 깊은 진흙과 깊은 풀숲 둘이다 (870줄)', () => {
    expect(stuckInDeepMud(Behavior.MUD_DEEP)).toBe(true)
    expect(stuckInDeepMud(Behavior.MUD_DEEP_WITH_GRASS)).toBe(true)
    expect(stuckInDeepMud(Behavior.MUD)).toBe(false)
    expect(stuckInDeepMud(Behavior.MUD_WITH_GRASS)).toBe(false)
    // `TileBehavior_IsDeepMudWithGrass` (`map_tile_behavior.c` 501줄)
    expect(isDeepMudWithGrass(Behavior.MUD_DEEP_WITH_GRASS)).toBe(true)
    expect(isDeepMudWithGrass(Behavior.MUD_DEEP)).toBe(false)
  })

  it('들어서면 칸 가운데까지 걸어 들어가 붙들리고 ZUPO가 난다 (896줄)', () => {
    walkIn(Behavior.MUD_DEEP)
    const p = worldState.player
    expect(deepMud.stuck).toBe(true)
    expect([p.position.x, p.position.z]).toEqual([5.5, 5.5])
    expect(drainBikeCues()).toEqual([ZUPO])
    // ⚠️ 지금 얼굴과 같은 쪽은 안 센다 (920줄) — 동쪽을 아무리 밀어도 그대로다
    hold(EAST, 120)
    expect(deepMud.presses).toBe(0)
    expect([p.position.x, p.position.z]).toEqual([5.5, 5.5])
  })

  it('방향을 바꿔 다섯 번 — 넷은 제자리 걸음, 다섯째는 제자리 뛰기로 빠져나온다 (905~945줄)', () => {
    walkIn(Behavior.MUD_DEEP)
    drainBikeCues()
    const p = worldState.player
    const turns = [NORTH, EAST, NORTH, EAST] as const
    turns.forEach((d, i) => {
      // 걸음이 끝날 때까지는 다음 누름을 안 받는다 — 눌러 둔 채라도 한 번이다
      hold(d, MUD_TURN_FRAMES + 2)
      expect(deepMud.presses).toBe(i + 1)
      expect(p.hop.active).toBe(false)
    })
    expect(Math.round(p.facing / (Math.PI / 2))).toBe(1) // 마지막이 동쪽
    expect(terrainSink(Behavior.MUD_DEEP, deepMud.doNotSink)).toBe(-14 / 16)
    hold(NORTH, 1)
    expect(deepMud.presses).toBe(DEEP_MUD_PRESSES)
    expect(p.hop.active).toBe(true)
    // 「안 가라앉음」은 뛰기 시작할 때 켠다 (945줄)
    expect(deepMud.doNotSink).toBe(true)
    expect(terrainSink(Behavior.MUD_DEEP, deepMud.doNotSink)).toBe(0)
    stand(Math.ceil(MUD_JUMP_TIME * 60) + 3)
    expect(drainBikeCues()).toEqual([DANSA, SUTYA2, ZUPO2])
    expect(deepMud.stuck).toBe(false)
    expect(deepMud.escaped).toBe(true)
    // 자리는 끝내 그 칸 가운데다
    expect([p.position.x, p.position.z]).toEqual([5.5, 5.5])
  })

  it('빠져나온 뒤에는 걸어 나가고, 그 칸을 떠나면 깃발 둘을 지운다 (`player_move.c` 275~278줄)', () => {
    walkIn(Behavior.MUD_DEEP)
    for (const d of [NORTH, EAST, NORTH, EAST, NORTH]) hold(d, MUD_TURN_FRAMES + 2)
    stand(30)
    expect(deepMud.escaped).toBe(true)
    // 같은 칸 안에서는 아직 켜져 있다 — 여기서 지우면 그 자리에서 다시 붙든다
    hold(EAST, 3)
    expect(Math.floor(worldState.player.position.x)).toBe(5)
    expect(deepMud.escaped).toBe(true)
    expect(deepMud.stuck).toBe(false)
    hold(EAST, 30)
    expect(Math.floor(worldState.player.position.x)).toBeGreaterThan(5)
    expect([deepMud.escaped, deepMud.doNotSink]).toEqual([false, false])
  })

  it('깊은 풀숲은 누를 때마다 조우를 굴리고, 걸리면 돌지 않고 놓는다 (929~938줄)', () => {
    let rolls = 0
    mudEncounter.roll = () => ++rolls === 2
    walkIn(Behavior.MUD_DEEP_WITH_GRASS)
    hold(NORTH, MUD_TURN_FRAMES + 2)
    expect(rolls).toBe(1)
    const facing = worldState.player.facing
    // 한 프레임만 누른다 — 놓인 뒤로도 누르고 있으면 그대로 걸어 나간다
    hold(EAST, 1)
    expect(rolls).toBe(2)
    expect(deepMud.stuck).toBe(false)
    expect(deepMud.escaped).toBe(true)
    // 걸린 누름은 몸을 안 돌린다 — 굴림이 돌기 앞이다
    expect(worldState.player.facing).toBe(facing)
    // 가라앉은 채다 — 「안 가라앉음」은 다섯째에만 켠다
    expect(deepMud.doNotSink).toBe(false)
  })

  it('풀 없는 깊은 진흙은 굴리지 않는다', () => {
    let rolls = 0
    mudEncounter.roll = () => { rolls++; return true }
    walkIn(Behavior.MUD_DEEP)
    for (const d of [NORTH, EAST, NORTH]) hold(d, MUD_TURN_FRAMES + 2)
    expect(rolls).toBe(0)
    expect(deepMud.presses).toBe(3)
  })

  it('⚠️ 그 칸에 새로 서면 안 붙든다 — 주인공을 새로 세울 때 깃발을 켠다 (`player_avatar.c` 161줄)', () => {
    reset('third', 0)
    activeZone.grid = marsh(Behavior.MUD_DEEP)
    resetDeepMud()
    stand()
    // 워프·불러오기가 진흙 위에 세웠다 — 한 칸 넘게 튀었다
    worldState.player.position.set(5.5, 0, 5.5)
    stand()
    expect(deepMud.stuck).toBe(false)
    expect(deepMud.escaped).toBe(true)
    hold(EAST, 30)
    expect(Math.floor(worldState.player.position.x)).toBeGreaterThan(5)
  })

  it('진흙 깊이는 원작 fx32 유닛을 16으로 나눈 값이다 (`map_object_move.c` 32~36 · 270~310줄)', () => {
    expect(terrainSink(Behavior.MUD_DEEP, false)).toBe(-14 / 16)
    expect(terrainSink(Behavior.MUD_DEEP_WITH_GRASS, false)).toBe(-14 / 16)
    expect(terrainSink(Behavior.MUD, false)).toBe(-12 / 16)
    expect(terrainSink(Behavior.MUD_WITH_GRASS, false)).toBe(-12 / 16)
    expect(terrainSink(Behavior.SNOW_DEEPEST, false)).toBe(-1)
    expect(terrainSink(Behavior.SNOW_DEEPER, false)).toBe(-14 / 16)
    expect(terrainSink(Behavior.SNOW_DEEP, false)).toBe(-12 / 16)
    expect(terrainSink(Behavior.SNOW_SHALLOW, false)).toBe(0)
    expect(terrainSink(Behavior.NORMAL, false)).toBe(0)
    for (const b of [Behavior.MUD_DEEP, Behavior.MUD, Behavior.SNOW_DEEPEST]) {
      expect(terrainSink(b, true)).toBe(0)
    }
  })

  it('누른 방향은 지금 얼굴과 다를 때만 센다', () => {
    expect(mudPressDir({ x: 0, z: -1 }, DIR.east)).toBe(DIR.north)
    expect(mudPressDir({ x: 1, z: 0 }, DIR.east)).toBe(-1)
    expect(mudPressDir({ x: 0, z: 0 }, DIR.east)).toBe(-1)
    // 비스듬하면 크게 민 쪽, 같으면 위아래다
    expect(mudPressDir({ x: -0.9, z: 0.3 }, DIR.north)).toBe(DIR.west)
    expect(mudPressDir({ x: 0.707, z: 0.707 }, DIR.north)).toBe(DIR.south)
  })
})
