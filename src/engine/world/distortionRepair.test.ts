// 깨어진 세계 엔진 규칙의 수리 (REPAIR §103 · §104 · §108 · §109 · §112 · §115).
//
// 값은 디컴프에서 따로 편다 — 제품 상수를 제품 상수로 재지 않는다.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { MAP, cynthiaBlocksJump } from './distortion'
import {
  DIST_OBJ, ELEVATOR_DIR, ELEVATOR_VIBRATION, cyrusB4FAnim, cyrusLeavesB4F,
} from './distortionElevator'
import { CASCADES, cascadeTiles } from './distortionCascade'
import { PUZZLE_FLAG, fellIntoPit } from './distortionBoulder'
import { DISTORTION_TABLES } from './distortionTables'
import { MovementRunner, WALL_STEP_ACTIONS, type Movable } from '../script/movement'
import { SFX } from '../audio/sfx'

describe('§103 시로나가 막는 칸은 넘는 칸이다 (`DistWorld_IsBlockedByCynthia`)', () => {
  it('(15,14)에서 남쪽으로 넘는 (15,15)에서만, 진행도 14에서만', () => {
    expect(cynthiaBlocksJump(MAP.giratinaRoom, 15, 15, 1, 14)).toBe(true)
    // 서 있는 칸을 넘기면 한 번도 안 걸린다 — 예전 제품이 그랬다
    expect(cynthiaBlocksJump(MAP.giratinaRoom, 15, 14, 1, 14)).toBe(false)
    // 셋째 인자가 방향이다 — 남쪽(1)뿐
    for (const dir of [0, 2, 3]) expect(cynthiaBlocksJump(MAP.giratinaRoom, 15, 15, dir, 14)).toBe(false)
    expect(cynthiaBlocksJump(MAP.giratinaRoom, 15, 15, 1, 13)).toBe(false)
    expect(cynthiaBlocksJump(MAP.b7f, 15, 15, 1, 14)).toBe(false)
  })
})

describe('§104 B4F 태홍은 닿은 층의 발판 번호로 걸어 나간다', () => {
  const b3f = DISTORTION_TABLES.movingPlatforms.find((m) => m.map === MAP.b3f)!.platforms
  it('B3F (95,193,70)에서 처음 내려오면 걸린다 — 닿는 번호가 1이다', () => {
    const t = b3f.find((p) => p.tileX === 95 && p.tileZ === 70)!
    expect(t.index).toBe(2)
    expect(t.destIndex).toBe(1)
    expect(cyrusLeavesB4F(MAP.b4f, ELEVATOR_DIR.down, t.destIndex, 0)).toBe(true)
    // 떠난 번호로 보면 안 걸린다 — 예전 제품
    expect(cyrusLeavesB4F(MAP.b4f, ELEVATOR_DIR.down, t.index, 0)).toBe(false)
  })

  it('B3F (79,193,62)는 닿는 번호가 0이라 안 걸린다', () => {
    const t = b3f.find((p) => p.tileX === 79 && p.tileZ === 62)!
    expect(t.index).toBe(1)
    expect(cyrusLeavesB4F(MAP.b4f, ELEVATOR_DIR.down, t.destIndex, 0)).toBe(false)
  })

  it('걸음 목록이 `sCyrusB4F*AnimCmds` 그대로다', () => {
    expect(cyrusB4FAnim(88)).toEqual([['WALK_NORMAL_EAST', 2], ['WALK_NORMAL_NORTH', 4]])
    expect(cyrusB4FAnim(89)).toEqual([['WALK_NORMAL_EAST', 1], ['WALK_NORMAL_NORTH', 4]])
    expect(cyrusB4FAnim(90)).toEqual([['WALK_NORMAL_NORTH', 4]])
    expect(cyrusB4FAnim(91)).toBeNull()
    expect(DIST_OBJ.b4fCyrus).toBe(134)
  })
})

describe('§108 폭포의 카메라·흔들림·걸어 나오기', () => {
  const down = CASCADES.find((c) => c.down)!
  const up = CASCADES.find((c) => !c.down)!
  it('칸은 0 쪽으로 자른다 — `(offset >> 4) / FX32_ONE`', () => {
    expect(cascadeTiles(-305)).toBe(-19)
    expect(cascadeTiles(-320)).toBe(-20)
    expect(cascadeTiles(319)).toBe(19)
  })

  it('올라갈 때의 흔들림은 512 ÷ 4096이다', () => {
    expect(up.bobDelta).toBe(512 / 4096)
    expect(down.bobDelta).toBe(1024 / 4096)
  })

  it('걸어 나오는 걸음 — 내려가면 16·32, 올라가면 2·4·8프레임', () => {
    expect(down.moveAwayFrames).toEqual([16, 32])
    expect(up.moveAwayFrames).toEqual([2, 4, 8])
    expect(down.moveAwayFrames).toHaveLength(down.moveAway)
    expect(up.moveAwayFrames).toHaveLength(up.moveAway)
  })
})

describe('§109 맞는 웅덩이는 웅덩이가 정한다 (`..._TickToCorrectPit`)', () => {
  it('엠라이트 바위를 아그놈 웅덩이에 넣으면 아그놈 웅덩이가 차고 아그놈이 풀려나고 스크립트 7', () => {
    const start = (1 << PUZZLE_FLAG.mespritBoulderInB6FOutside) | (1 << PUZZLE_FLAG.mespritInB6F)
      | (1 << PUZZLE_FLAG.azelfInB6F)
    const r = fellIntoPit(start, DIST_OBJ.b6fMespritBoulderOutside, PUZZLE_FLAG.azelfBoulderInB6FPit)!
    expect(r.script).toBe(7)
    // 웅덩이 속 바위는 바위의 번호다
    expect(r.localID).toBe(DIST_OBJ.b6fMespritBoulderInPit)
    const has = (f: number) => (r.flags & (1 << f)) !== 0
    expect(has(PUZZLE_FLAG.azelfBoulderInB6FPit)).toBe(true)
    expect(has(PUZZLE_FLAG.mespritBoulderInB6FPit)).toBe(false)
    expect(has(PUZZLE_FLAG.mespritBoulderInB6FOutside)).toBe(false)
    expect(has(PUZZLE_FLAG.azelfInB6F)).toBe(false)
    expect(has(PUZZLE_FLAG.mespritInB6F)).toBe(true)
  })

  it('제 웅덩이면 예전과 같다', () => {
    const r = fellIntoPit(0, DIST_OBJ.b6fUxieBoulderOutside, PUZZLE_FLAG.uxieBoulderInB6FPit)!
    expect(r).toEqual(fellIntoPit(0, DIST_OBJ.b6fUxieBoulderOutside))
    expect(r.script).toBe(6)
  })
})

describe('§115 승강 발판의 떨림 (`DistWorldElevatorPlatform_Vibrate`)', () => {
  it('6/16에서 시작해 스물두 프레임, 끝 프레임은 제자리', () => {
    // 원작 산술을 따로 편다: ±6 ±4 ±2 ±1, 1에 닿은 뒤 여덟 번 더
    const want = [6, -6, 4, -4, 2, -2, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, 0]
    expect(ELEVATOR_VIBRATION.map((v) => v * 16)).toEqual(want)
  })
})

describe('§112 서쪽 벽의 한 칸 걸음 (`MOVEMENT_ACTION_105` ~ `108`)', () => {
  it('106은 y − 1, 107은 z + 1 — 여덟 프레임', () => {
    const who: Movable = { x: 15, y: 9, z: 20, dir: 0, visible: true }
    const r = new MovementRunner(who, [{ action: 106, count: 1 }, { action: 107, count: 1 }], [])
    for (let f = 0; f < 8; f++) r.tick()
    expect([who.y, who.z, who.dir]).toEqual([8, 20, 3])
    for (let f = 0; f < 8; f++) r.tick()
    expect([who.y, who.z, who.dir]).toEqual([8, 21, 1])
    expect(r.done).toBe(true)
    expect(Object.keys(WALL_STEP_ACTIONS).map(Number)).toEqual([105, 106, 107, 108])
  })
})

const SDAT = 'raw/decomp/generated/sdat.txt'

describe.runIf(existsSync(SDAT))('깨어진 세계의 효과음 번호 (`generated/sdat.txt`의 닻을 세어서)', () => {
  it('FW089 · FW089B · SYUWA3 · SUTYA2 · FW463', () => {
    const ids = new Map<string, number>()
    let next = 0
    for (const line of readFileSync(SDAT, 'utf8').split(/\r?\n/)) {
      const t = line.trim()
      if (t === '') continue
      const m = /^(\w+)\s*=\s*(\d+)$/.exec(t)
      if (m) { next = Number(m[2]); ids.set(m[1]!, next++); continue }
      if (/^\w+$/.test(t)) ids.set(t, next++)
    }
    expect(ids.get('SEQ_SE_PL_FW463')).toBe(SFX.WATERFALL)
    expect(ids.get('SEQ_SE_PL_FW089')).toBe(SFX.DISTORTION_ELEVATOR)
    expect(ids.get('SEQ_SE_PL_FW089B')).toBe(SFX.DISTORTION_SLIDE)
    expect(ids.get('SEQ_SE_PL_SYUWA3')).toBe(SFX.DISTORTION_APPEAR)
    expect(ids.get('SEQ_SE_DP_SUTYA2')).toBe(SFX.DISTORTION_LAND)
  })
})
