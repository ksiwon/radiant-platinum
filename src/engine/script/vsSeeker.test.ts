// VS시커 재대결을 **실제 스크립트로** 돌린다 (PARITY §7.9)
//
// `world/vsSeeker.test.ts`가 고르는 규칙을 보고, 여기서는 트레이너에게 말을
// 거는 롬의 스크립트(`scripts_battles`)가 그 규칙까지 실제로 닿는지를 본다 —
// 명령 넷이 다 붙어 있어야 재대결이 열린다.
//
// ⚠️ **문은 이동 유형 하나다.** 말을 건 사람이 `MOVEMENT_TYPE_VS_SEEKER_SPIN`이
// 아니면 `GetRematchTrainerID`가 `TRAINER_NONE`을 내고, 스크립트는 그걸 보고
// 「이미 이긴 사람」 대사로 빠진다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  buildCommands, SCRIPT_ID_OFFSET_SINGLE_BATTLES, TRAINER_DEFEATED_FLAGS_START,
} from './commands'
import { ScriptContext } from './context'
import { entryOffset, fileBytes, parseScriptMeta, resolveScript } from './data'
import { VarStore } from './vars'
import { FieldWorld, type FieldServices } from './world'
import { DIR } from './movement'
import { addNpcFrom, clearNpcs, npcActors } from '../actor/npcs'
import type { Npc } from '../map/world'
import {
  FLAG_UNLOCKED_VS_SEEKER_LVL_1, MOVEMENT_TYPE_LOOK, MOVEMENT_TYPE_LOOK_AROUND,
  MOVEMENT_TYPE_VS_SEEKER_SPIN, REMATCH_END, REMATCH_NONE, VS_SEEKER_REMATCHES,
} from '../world/vsSeekerTable'
import { DATA, withData } from '../../data/romData.testkit'

const maybe = withData('scripts.json', 'scripts.bin')

const ALWAYS_PRESSED = () => ({ pressed: true, held: true })

/**
 * 대사 종류 → 글 번호. **종류를 그대로 알아보려고 100을 더해 둔다** —
 * 어느 종류로 물었는지가 곧 어느 갈래로 갔는지다 (`generated/trainer_message_types.txt`)
 */
const MSG = { pre: 100, post: 102, rematch: 117 }

const LOCAL_ID = 3

maybe('재대결 — 실제 스크립트', () => {
  const meta = parseScriptMeta(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
  const { map } = buildCommands(meta.commands)

  /** 재대결이 **다른 트레이너**인 첫 줄. 같은 사람을 다시 싸우는 줄은 못 가른다 */
  const row = VS_SEEKER_REMATCHES.find(
    (r) => r[1] !== undefined && r[1] !== r[0] && r[1] !== REMATCH_NONE && r[1] !== REMATCH_END,
  )!
  const TRAINER = row[0]!
  const REMATCH = row[1]!
  const SCRIPT = SCRIPT_ID_OFFSET_SINGLE_BATTLES + TRAINER - 1

  afterEach(() => { clearNpcs() })

  /** 배치표에 선 트레이너 하나 */
  const placed = (movementType: number): Npc => ({
    x: 4, z: 4, height: 0, localID: LOCAL_ID, sprite: 1, move: movementType,
    trainerType: 1, facing: DIR.south, script: SCRIPT, flag: null, range: [0, 0],
    raw: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  })

  interface Options {
    /** 말을 건 사람이 돌고 있는가 */
    spinning?: boolean
    /** 그 트레이너를 이미 이겼는가 */
    defeated?: boolean
    /** 재대결 첫 단계가 열려 있는가 */
    unlocked?: boolean
  }

  interface Log {
    /** 실제로 시작된 배틀의 트레이너 번호. 안 열렸으면 null */
    battle: number | null
    /** 어느 종류의 대사를 물었는가 */
    messages: number[]
    /** 배틀이 시작될 때 굳은 이동 유형 */
    movement: number
  }

  const play = (opt: Options = {}): Log => {
    const log: Log = { battle: null, messages: [], movement: -1 }
    const vars = new VarStore()
    if (opt.defeated !== false) vars.setFlag(TRAINER_DEFEATED_FLAGS_START + TRAINER)
    if (opt.unlocked !== false) vars.setFlag(FLAG_UNLOCKED_VS_SEEKER_LVL_1)

    clearNpcs()
    addNpcFrom(placed(opt.spinning === false
      ? MOVEMENT_TYPE_LOOK_AROUND : MOVEMENT_TYPE_VS_SEEKER_SPIN), vars)
    const actor = npcActors.byLocalID.get(LOCAL_ID)!

    const services: FieldServices = {
      // 더블이 아니라 짝을 안 찾는다 — 싱글 하나만 보는 시험이다
      trainer: () => ({
        double: false,
        msg: { '0': MSG.pre, '2': MSG.post, '17': MSG.rematch },
        class: 0,
      }),
      trainerMessage: (index) => { log.messages.push(index); return '{PLAYER}!' },
      startTrainerBattle: (id) => {
        log.battle = id
        // 배틀이 열리는 **그 순간**의 값이어야 한다 — 배틀 뒤에 재면 늦다
        log.movement = actor.movementType
      },
      battleResult: () => 'win',
      aliveMons: () => 2,
    }
    const world = new FieldWorld({
      vars, input: ALWAYS_PRESSED, movements: meta.movements, services,
      objects: (id) => npcActors.byLocalID.get(id) ?? null,
    })
    world.scriptID = SCRIPT
    world.target = actor
    vars.set(0x800d, LOCAL_ID) // `VAR_LAST_TALKED`

    const at = resolveScript(meta, SCRIPT, -1)!
    const ctx = new ScriptContext(
      { vars, world, commands: map }, fileBytes(data, at.file), at.file,
    )
    ctx.start(entryOffset(data, at.file, at.entry))
    for (let frame = 0; frame < 2000; frame++) {
      if (!ctx.step(100_000)) break
      world.tick()
    }
    return log
  }

  it('표에서 고른 줄이 실제로 다른 팀이다 — 시험이 성립하는 조건이다', () => {
    expect(REMATCH).not.toBe(TRAINER)
    expect(REMATCH).toBeGreaterThan(0)
  })

  it('⚠️ 돌고 있는 사람에게 말을 걸면 **재대결 상대**와 싸운다', () => {
    const log = play({ spinning: true })
    expect(log.battle).toBe(REMATCH)
    // 대사도 재대결 것이다 (`GetTrainerRematchMessageTypes`의 `TRMSG_REMATCH`)
    expect(log.messages).toEqual([MSG.rematch])
  })

  it('⚠️ 안 돌면 배틀이 아예 안 열린다 — 「이미 이긴 사람」 대사로 빠진다', () => {
    const log = play({ spinning: false })
    expect(log.battle).toBe(null)
    expect(log.messages).toEqual([MSG.post])
  })

  it('아직 안 이긴 사람은 원래 팀과 싸운다 — 재대결 갈래로 안 간다', () => {
    const log = play({ spinning: true, defeated: false })
    expect(log.battle).toBe(TRAINER)
    expect(log.messages).toEqual([MSG.pre])
  })

  it('⚠️ 단계가 안 열려 있으면 원래 팀이다 — 한 칸 내려간 자리가 0번이다', () => {
    const log = play({ spinning: true, unlocked: false })
    expect(log.battle).toBe(TRAINER)
    // 그래도 **재대결로 들어온 것**이라 대사는 재대결 것이다
    expect(log.messages).toEqual([MSG.rematch])
  })

  it('⚠️ 배틀이 시작되면 회전이 풀린다 (`SetMoveCodeForFacingDirection`)', () => {
    const log = play({ spinning: true })
    expect(log.movement).not.toBe(MOVEMENT_TYPE_VS_SEEKER_SPIN)
    // 보고 있던 쪽으로 굳는다 — 배치표의 남쪽이다
    expect(log.movement).toBe(MOVEMENT_TYPE_LOOK[DIR.south])
  })
})
