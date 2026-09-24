// 호수의 셋의 바위 안내 — 프레임 수와 표 (PARITY §6.10 · REPAIR §86)
//
// 프레임 수는 원작의 정수 산술을 손으로 편 값이다. 같은 함수로 다시 세면
// 시험이 제 자신을 베끼므로, 여기 적힌 수는 전부 **식으로 따로 낸 것**이다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EVENT_CMD, FLAG_COND, flagHolds, newDistortionState } from './distortion'
import { PUZZLE_FLAG } from './distortionBoulder'
import { DIST_OBJ } from './distortionElevator'
import {
  AZELF_ANIM, MESPRIT_ANIM_PLAYER_BOTTOM, MESPRIT_ANIM_PLAYER_TOP, MESPRIT_ANIM_POKEMON_BOTTOM,
  MESPRIT_ANIM_POKEMON_TOP, TUTO_SPECS, TUTO_TILE_FX, fxTiles, mespritAnims, newTutoRun,
  tutoFinishedFlags, tutoFrame, type TutoAnimCmd, type TutoState,
} from './distortionTuto'
import { withDecomp } from '../../data/romData.testkit'

/** 상태마다 몇 프레임 머물렀는가. 목록은 `animFrames` 프레임 뒤에 끝난 것으로 친다 */
function phases(kind: number, animFrames = 0): { frames: Map<TutoState, number>; run: ReturnType<typeof newTutoRun> } {
  const run = newTutoRun(TUTO_SPECS[kind]!)
  const frames = new Map<TutoState, number>()
  let animLeft = -1
  for (let i = 0; i < 5000; i++) {
    const at = run.state
    if (animLeft > 0) animLeft -= 1
    const res = tutoFrame(run, animLeft === 0)
    frames.set(at, (frames.get(at) ?? 0) + 1)
    if (res === 'startAnim') animLeft = animFrames
    if (res === 'finish') return { frames, run }
  }
  throw new Error('안 끝난다')
}

describe('C 산술 그대로 자른다', () => {
  it('`(v >> 4) / FX32_ONE`은 0 쪽으로 자른다 — 음수에서 내림이 아니다', () => {
    expect(fxTiles(TUTO_TILE_FX * 17)).toBe(17)
    expect(fxTiles(TUTO_TILE_FX - 1)).toBe(0)
    // −1.9칸은 −1이다 (내림이면 −2가 되어 유크시가 한 칸 일찍 선다)
    expect(fxTiles(-TUTO_TILE_FX * 1.9)).toBe(-1)
    expect(fxTiles(-TUTO_TILE_FX * 2)).toBe(-2)
  })
})

describe('유크시 (`sShowUxieBoulderTutoHandlers`)', () => {
  const { frames, run } = phases(EVENT_CMD.showUxieBoulderTuto)

  it('솟기 72프레임 — 16칸까지 프레임당 1/4칸(64), 17칸까지 1/8칸(8)', () => {
    expect(frames.get('ascend')).toBe(64 + 8)
  })

  it('바위 쪽으로 32프레임 — 프레임당 1/16칸, −2칸이 되는 첫 프레임', () => {
    expect(frames.get('moveToBoulder')).toBe(32)
  })

  it('오르내림 90프레임 — 한 번에 0→15→0 서른 프레임, 세 번', () => {
    expect(frames.get('hover')).toBe(30 * 3)
  })

  it('물러나기 48프레임 — −2칸에서 +1칸이 되는 첫 프레임 (32 + 16)', () => {
    expect(frames.get('moveAway')).toBe(48)
    // 끝난 자리는 +1칸이다 (`..._MOVE_AWAY_Z_TARGET`)
    expect(run.offset.z).toBe(TUTO_TILE_FX)
  })

  it('가라앉기 136프레임 — 16프레임 동안 0x200씩 붙고 그 뒤 프레임당 1/8칸', () => {
    // 17칸에서 1칸 아래로: 0x200 × (1+…+16) = 69632, 남은 978945 ÷ 8192 → 120
    expect(frames.get('descend')).toBe(16 + 120)
    expect(fxTiles(run.offset.y)).toBe(0)
  })

  it('오르내림의 꼭대기는 반 칸이다 (`yOffsets[7]` = 32768)', () => {
    const r = newTutoRun(TUTO_SPECS[EVENT_CMD.showUxieBoulderTuto]!)
    let top = 0
    let base = -1
    for (let i = 0; i < 1000 && r.state !== 'moveAway'; i++) {
      tutoFrame(r, true)
      if (r.state === 'hover') { base = r.finalY; top = Math.max(top, r.offset.y) }
    }
    expect(top - base).toBe(32768)
  })
})

describe('아그놈 (`sShowAzelfBoulderTutoHandlers`)', () => {
  it('솟기 56프레임 (48 + 8) → 목록 → 같은 프레임에 가라앉기 시작, 104프레임', () => {
    const { frames } = phases(EVENT_CMD.showAzelfBoulderTuto, 160)
    expect(frames.get('ascend')).toBe(48 + 8)
    // 목록이 끝난 프레임은 가라앉기의 첫 프레임과 같다 (`RES_LOOP`)
    expect(frames.get('waitForAnimation')).toBe(160)
    // 13칸에서 1칸 아래로: 69632 + n × 8192 > 786432 → n = 88
    expect(frames.get('descend')).toBe(16 + 88 - 1)
  })
})

describe('엠라이트 (`sShowMespritBoulderTutoHandlers`)', () => {
  it('솟기 40프레임 (32 + 8), 가라앉기 72프레임', () => {
    const { frames } = phases(EVENT_CMD.showMespritBoulderTuto, 256)
    expect(frames.get('ascend')).toBe(32 + 8)
    // 9칸에서 1칸 아래로: 69632 + n × 8192 > 524288 → n = 56
    expect(frames.get('descend')).toBe(16 + 56 - 1)
  })

  it('주인공의 세계 z가 67이면 Top, 아니면 Bottom', () => {
    expect(mespritAnims(67).top).toBe(true)
    expect(mespritAnims(67).pokemon).toBe(MESPRIT_ANIM_POKEMON_TOP)
    expect(mespritAnims(68).top).toBe(false)
    expect(mespritAnims(68).pokemon).toBe(MESPRIT_ANIM_POKEMON_BOTTOM)
  })
})

describe('끝나면 B6F의 그 마리가 설 조건이 선다', () => {
  it.each([
    [EVENT_CMD.showUxieBoulderTuto, DIST_OBJ.b6fUxie, PUZZLE_FLAG.uxieTutoSeen, PUZZLE_FLAG.uxieInB6F],
    [EVENT_CMD.showAzelfBoulderTuto, DIST_OBJ.b6fAzelf, PUZZLE_FLAG.azelfTutoSeen, PUZZLE_FLAG.azelfInB6F],
    [EVENT_CMD.showMespritBoulderTuto, DIST_OBJ.b6fMesprit, PUZZLE_FLAG.mespritTutoSeen, PUZZLE_FLAG.mespritInB6F],
  ])('명령 %i → B6F #%i', (kind, b6f, seen, inB6F) => {
    const spec = TUTO_SPECS[kind]!
    expect(spec.b6f).toBe(b6f)
    const flags = tutoFinishedFlags(0, spec)
    expect(flags).toBe((1 << seen) | (1 << inB6F))
    const ctx = {
      progress: 0, state: { ...newDistortionState(), puzzleFlags: flags },
      giratinaAnim: () => false, cyrusAppearance: 0,
    }
    expect(flagHolds(FLAG_COND.boulderTrue, inB6F, ctx)).toBe(true)
    // 사건 칸의 조건(`boulderFalse *_TUTO_SEEN`)은 이제 거짓이라 다시 안 돈다
    expect(flagHolds(FLAG_COND.boulderFalse, seen, ctx)).toBe(false)
  })
})

// ── 디컴프와 맞대 본다 ──────────────────────────────────────────────────────
const SOURCE = 'src/overlay009/ov9_02249960.c'

withDecomp(SOURCE)('표가 디컴프와 같다', () => {
  const c = readFileSync(resolve(__dirname, '../../../raw/decomp', SOURCE), 'utf8')

  /** `static const MapObjectAnimCmd 이름[] = { … END … }`을 읽는다 */
  function table(name: string): TutoAnimCmd[] {
    const at = c.indexOf(`static const MapObjectAnimCmd ${name}[]`)
    if (at < 0) throw new Error(`${name}이 없다`)
    const body = c.slice(at, c.indexOf('};', at))
    const out: TutoAnimCmd[] = []
    for (const m of body.matchAll(/MOVEMENT_ACTION_(\w+), \.count = (\d+)/g)) {
      if (m[1] === 'END') break
      out.push([m[1]!, Number(m[2])])
    }
    return out
  }

  function define(name: string): number {
    const m = new RegExp(`#define ${name}\\s+(-?\\d+)`).exec(c)
    if (m === null) throw new Error(`${name}이 없다`)
    return Number(m[1])
  }

  it('이동 동작 목록 다섯', () => {
    expect(AZELF_ANIM).toEqual(table('sAzelfBoulderTutoAnimation'))
    expect(MESPRIT_ANIM_POKEMON_TOP).toEqual(table('sMespritBoulderTutoAnimationPokemonTop'))
    expect(MESPRIT_ANIM_POKEMON_BOTTOM).toEqual(table('sMespritBoulderTutoAnimationPokemonBottom'))
    expect(MESPRIT_ANIM_PLAYER_TOP).toEqual(table('sMespritBoulderTutoAnimationPlayerTop'))
    expect(MESPRIT_ANIM_PLAYER_BOTTOM).toEqual(table('sMespritBoulderTutoAnimationPlayerBottom'))
  })

  it('솟는 높이 셋', () => {
    expect(TUTO_SPECS[EVENT_CMD.showUxieBoulderTuto]!.ascendTarget)
      .toBe(define('UXIE_BOULDER_TUTO_ASCEND_Y_TARGET'))
    expect(TUTO_SPECS[EVENT_CMD.showAzelfBoulderTuto]!.ascendTarget)
      .toBe(define('AZELF_BOULDER_TUTO_ASCEND_Y_TARGET'))
    expect(TUTO_SPECS[EVENT_CMD.showMespritBoulderTuto]!.ascendTarget)
      .toBe(define('MESPRIT_BOULDER_TUTO_ASCEND_Y_TARGET'))
  })

  it('유크시의 오르내림 표', () => {
    const m = /fx32 yOffsets\[UXIE_BOULDER_TUTO_HOVER_STEP_COUNT\] = \{ ([^}]+) \}/.exec(c)
    expect(m).not.toBeNull()
    const want = m![1]!.split(',').map((s) => Number(s.trim()))
    // 표를 다시 적지 않고 돌려서 본다 — 오르내림 한 번의 높이 열이 표와 같아야 한다
    const r = newTutoRun(TUTO_SPECS[EVENT_CMD.showUxieBoulderTuto]!)
    const seen: number[] = []
    for (let i = 0; i < 1000 && r.state !== 'moveAway'; i++) {
      const before = r.state
      tutoFrame(r, true)
      if (before === 'hover') seen.push(r.offset.y - r.finalY)
    }
    expect([...new Set(seen)].sort((a, b) => a - b)).toEqual(want)
  })

  it('맵 물체 번호 — B5F는 유크시·아그놈·엠라이트, B6F는 엠라이트·유크시·아그놈', () => {
    const h = readFileSync(
      resolve(__dirname, '../../../raw/decomp/include/constants/distortion_world.h'), 'utf8')
    const order = (e: string): string[] => {
      const at = h.indexOf(`enum ${e}`)
      return [...h.slice(at, h.indexOf('};', at)).matchAll(/DIST_WORLD_MAP_OBJECT_(\w+)/g)]
        .map((m) => m[1]!).filter((n) => n !== 'BASE_LOCAL_ID')
    }
    const b5f = order('DistWorldMapObjectEventB5FLocalID')
    const b6f = order('DistWorldMapObjectEventB6FLocalID')
    expect(b5f.indexOf('B5F_UXIE') + 128).toBe(DIST_OBJ.b5fUxie)
    expect(b5f.indexOf('B5F_AZELF') + 128).toBe(DIST_OBJ.b5fAzelf)
    expect(b5f.indexOf('B5F_MESPRIT') + 128).toBe(DIST_OBJ.b5fMesprit)
    expect(b6f.indexOf('B6F_MESPRIT') + 128).toBe(DIST_OBJ.b6fMesprit)
    expect(b6f.indexOf('B6F_UXIE') + 128).toBe(DIST_OBJ.b6fUxie)
    expect(b6f.indexOf('B6F_AZELF') + 128).toBe(DIST_OBJ.b6fAzelf)
  })
})
