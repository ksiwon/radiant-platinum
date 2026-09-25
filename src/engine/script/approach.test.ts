// 다가오는 트레이너를 **실제 스크립트로** 돌린다 (PARITY §1.13)
//
// 눈이 마주치면 원작이 그 사람의 스크립트가 아니라 **공용 스크립트 3928**을
// 돌린다 (`SCRIPT_ID(SINGLE_BATTLES, MAX_TRAINERS)`). 그 안에서 곡이 깔리고,
// 걸어오고, 다 온 뒤에야 대사가 뜬다 — 명령 넷이 다 붙어 있어야 배틀까지 간다.
//
// ⚠️ **`CheckIsApproachingTrainerTaskDone`이 없으면 스크립트가 영영 돈다.**
// `Battles_WaitTrainerSinglesTaskDone`이 제 답을 보고 자기를 다시 부른다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildCommands, SCRIPT_ID_OFFSET_DOUBLE_BATTLES, SCRIPT_ID_OFFSET_SINGLE_BATTLES,
} from './commands'
import { ScriptContext } from './context'
import { entryOffset, fileBytes, parseScriptMeta, resolveScript } from './data'
import { VarStore } from './vars'
import { FieldWorld, type FieldServices } from './world'
import { DIR } from './movement'
import { addNpcFrom, clearNpcs, npcActors } from '../actor/npcs'
import { APPROACH_TYPE, approachMovements, approachSteps, delaySteps } from '../actor/approach'
import { EMOTE_FRAMES } from '../actor/emote'
import type { Npc } from '../map/world'
import { DATA, withData } from '../../data/romData.testkit'

const maybe = withData('scripts.json', 'scripts.bin')

const ALWAYS_PRESSED = () => ({ pressed: true, held: true })

/**
 * 대사 종류 → 글 번호. 어느 종류로 물었는지가 곧 어느 갈래로 갔는지다.
 *
 * ⚠️ **더블의 두 번째는 4가 아니라 7이다** — 갈래 사이에 「졌을 때」·「이긴 뒤」·
 * 「마리가 모자랄 때」가 하나씩 끼어 있다 (`generated/trainer_message_types.txt`)
 */
const TRMSG = { pre: 0, preDouble1: 3, preDouble2: 7 }
const MSG = { pre: 100, preDouble1: 103, preDouble2: 107 }

const LOCAL_ID = 3
const TRAINER = 5
/** `SCRIPT_ID(SINGLE_BATTLES, MAX_TRAINERS)` — 트레이너가 아니라 공용 자리다 */
const APPROACH_SCRIPT = SCRIPT_ID_OFFSET_SINGLE_BATTLES + 928

maybe('다가오는 트레이너 — 실제 스크립트', () => {
  const meta = parseScriptMeta(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
  const { map } = buildCommands(meta.commands)

  afterEach(() => { clearNpcs() })

  /** 주인공 북쪽 네 칸에 서서 남쪽(주인공 쪽)을 보는 트레이너 */
  const placed = (localID = LOCAL_ID, x = 10, base = SCRIPT_ID_OFFSET_SINGLE_BATTLES): Npc => ({
    x, z: 6, height: 0, localID, sprite: 1, move: 0,
    trainerType: 1, facing: DIR.south, script: base + TRAINER - 1,
    flag: null, range: [0, 0], raw: [0, 0, 0, 0, 0, 0, 0, 4],
  })

  /**
   * 더블 한 쌍의 나머지 하나. **스크립트가 다르고 트레이너 번호가 같다** — 첫 사람은
   * 3000+번호−1, 짝은 5000+번호−1이다 (`tools/jsoncnv/convert.py` 81 · 209번도로
   * 쌍둥이가 3293·5293). 원작은 번호로 짝을 찾는다 (`FindTrainerPartner` · 363)
   */
  const PARTNER_ID = 4

  interface Log {
    battle: number | null
    /** 둘째 상대 (`StartTrainerBattle`의 둘째 인자). 싱글이면 0 */
    second: number | null
    messages: number[]
    /** 다 걸어온 뒤 트레이너가 선 자리 */
    stopped: { x: number, z: number }
    /** 주인공이 보고 있는 방향 */
    playerDir: number
    frames: number
  }

  const play = (sightRange: number, double = false, vs2 = false): Log => {
    const vars = new VarStore()
    clearNpcs()
    addNpcFrom(placed(), vars)
    if (double) addNpcFrom(placed(PARTNER_ID, 11, SCRIPT_ID_OFFSET_DOUBLE_BATTLES), vars)
    else if (vs2) addNpcFrom(placed(PARTNER_ID, 11), vars)
    const actor = npcActors.byLocalID.get(LOCAL_ID)!
    const log: Log = {
      battle: null, second: null, messages: [],
      stopped: { x: 0, z: 0 }, playerDir: DIR.south, frames: 0,
    }
    const player = { x: 10, z: 10, dir: DIR.south, visible: true }

    const services: FieldServices = {
      trainer: () => ({
        double,
        msg: {
          [TRMSG.pre]: MSG.pre,
          [TRMSG.preDouble1]: MSG.preDouble1,
          [TRMSG.preDouble2]: MSG.preDouble2,
        },
        class: 0,
      }),
      trainerMessage: (index) => { log.messages.push(index); return '{PLAYER}!' },
      startTrainerBattle: (id, second) => {
        log.battle = id
        log.second = second ?? 0
        log.stopped = { x: actor.x, z: actor.z }
        log.playerDir = player.dir
      },
      battleResult: () => 'win',
      aliveMons: () => 2,
    }
    const world = new FieldWorld({
      vars, input: ALWAYS_PRESSED, movements: meta.movements, services,
      objects: (id) => npcActors.byLocalID.get(id) ?? null,
    })
    world.scriptID = APPROACH_SCRIPT
    world.target = actor
    world.player = player
    vars.set(0x800d, LOCAL_ID)

    const at = resolveScript(meta, APPROACH_SCRIPT, -1)!
    const ctx = new ScriptContext(
      { vars, world, commands: map }, fileBytes(data, at.file), at.file,
    )
    ctx.start(entryOffset(data, at.file, at.entry))
    // 스크립트를 시작한 **뒤에** 적는다 — 시작이 `world.reset()`을 부른다
    world.approaching[0] = {
      localID: LOCAL_ID, trainerID: TRAINER, direction: DIR.south, sightRange,
      type: double ? APPROACH_TYPE.doubles : APPROACH_TYPE.singles,
    }
    if (double) {
      world.approaching[1] = {
        localID: PARTNER_ID, trainerID: TRAINER, direction: DIR.south, sightRange,
        type: APPROACH_TYPE.doubles,
      }
    }
    // 서로 다른 둘이 한꺼번에 본 자리 (`APPROACH_TYPE_VS2`). 갈래는 0번 자리의
    // 것을 묻는다(`GetApproachingTrainerType`) — 둘 다 VS2다
    if (vs2) {
      world.approaching[0] = { ...world.approaching[0], type: APPROACH_TYPE.vs2 }
      world.approaching[1] = {
        localID: PARTNER_ID, trainerID: TRAINER + 1, direction: DIR.south, sightRange,
        type: APPROACH_TYPE.vs2,
      }
    }
    for (let frame = 0; frame < 4000; frame++) {
      log.frames = frame
      if (!ctx.step(100_000)) break
      world.tick()
    }
    return log
  }

  it('공용 스크립트 3928이 진짜 있다 — 트레이너 번호가 아니라 표의 끝자리다', () => {
    expect(resolveScript(meta, APPROACH_SCRIPT, -1)).not.toBeNull()
  })

  it('⚠️ 네 칸 밖에서 보면 세 칸 걸어와 **한 칸 앞에** 선다', () => {
    const log = play(4)
    expect(approachSteps(4)).toBe(3)
    expect(log.stopped).toEqual({ x: 10, z: 9 })
    expect(log.battle).toBe(TRAINER)
    expect(log.messages).toEqual([MSG.pre])
  })

  it('⚠️ 바로 앞에서 마주치면 안 움직인다 — 주인공 칸으로 걸어 들어가지 않는다', () => {
    const log = play(1)
    expect(approachSteps(1)).toBe(0)
    expect(log.stopped).toEqual({ x: 10, z: 6 })
    expect(log.battle).toBe(TRAINER)
  })

  it('주인공이 그쪽으로 돌아본다 — 등을 보고 대화하지 않는다', () => {
    // 트레이너가 북쪽에 있으므로 주인공은 북쪽을 본다
    expect(play(4).playerDir).toBe(DIR.north)
  })

  it('⚠️ 다 걸어올 때까지 기다린다 — 걷는 프레임만큼 배틀이 늦다', () => {
    const near = play(1)
    const far = play(6)
    expect(far.frames).toBeGreaterThan(near.frames)
  })

  it('⚠️ 스크립트가 안 선다 — 「다 왔는가」에 답이 없으면 영영 돈다', () => {
    // 4,000프레임을 다 쓰기 전에 배틀까지 갔다는 뜻이다
    const log = play(4)
    expect(log.frames).toBeLessThan(3999)
  })

  it('더블은 둘의 대사가 차례로 뜬다', () => {
    const log = play(3, true)
    expect(log.messages).toEqual([MSG.preDouble1, MSG.preDouble2])
    expect(log.battle).toBe(TRAINER)
    // 한 사람의 더블은 같은 번호를 두 번 넘긴다 (`Encounter_NewVsTrainer`의 가운데 갈래)
    expect(log.second).toBe(TRAINER)
  })

  /**
   * ⚠️ **서로 다른 두 트레이너가 한꺼번에 보면 둘과 싸운다** (PARITY §2.2b).
   *
   * `Battles_ApproachingTrainerVS2`: 첫 사람이 걸어와 제 싱글 대사를 하고, 둘째가
   * 걸어와 제 싱글 대사를 한 뒤 `StartTrainerBattle 첫째, 둘째`다 — 둘째 인자가
   * 다른 번호라 트레이너 둘과의 2vs2가 열린다
   */
  it('VS2는 둘이 차례로 걸어와 말하고, 두 번호로 배틀을 연다', () => {
    const log = play(3, false, true)
    expect(log.messages).toEqual([MSG.pre, MSG.pre])
    expect(log.battle).toBe(TRAINER)
    expect(log.second).toBe(TRAINER + 1)
  })

  it('싱글은 둘째 상대가 0이다', () => {
    expect(play(4).second).toBe(0)
  })
})

// ⚠️ **느낌표는 여기가 아니라 `trySight`가 띄운다** (`FieldServices.emote`).
// 이 시험은 스크립트를 직접 돌리므로 그 자리를 안 지난다 — 여기서 볼 수 있는
// 것은 **걷기 전에 그만큼 멈춰 서는가**다. 안 멈추면 느낌표가 걸어오는 사람을
// 따라다닌다
describe('쉬는 길이', () => {
  const frames = (steps: { action: number, count: number }[]): number => {
    const table: Record<number, number> = { 60: 1, 61: 2, 62: 4, 63: 8, 64: 15, 65: 16, 66: 32 }
    return steps.reduce((n, s) => n + (table[s.action] ?? 0) * s.count, 0)
  }

  it('표에 있는 칸만 써서 원하는 프레임을 정확히 채운다', () => {
    for (const want of [0, 1, 3, 8, 30, 37, 100]) {
      expect(frames(delaySteps(want)), `${String(want)}프레임`).toBe(want)
    }
  })

  it('큰 칸부터 담는다 — 37은 32+4+1이다', () => {
    expect(delaySteps(37)).toEqual([
      { action: 66, count: 1 }, { action: 62, count: 1 }, { action: 60, count: 1 },
    ])
  })

  it('⚠️ 걷기 전에 느낌표만큼 멈춘다 — 원작이 그것이 끝나기를 기다린다', () => {
    // 돌아보기(1) + 느낌표(37) + 원작의 30을 옮긴 32 = 70프레임을 서 있는다
    const still = approachMovements(DIR.south, 4).slice(0, -2)
    expect(frames(still)).toBe(EMOTE_FRAMES + 32)
  })

  it('바로 앞에서 마주쳐도 느낌표는 기다린다 — 안 걸을 뿐이다', () => {
    const near = approachMovements(DIR.south, 1)
    // 돌아보기 · 느낌표 셋 · DELAY_32 · DELAY_8 = 여섯. 걸음은 없다
    expect(near).toHaveLength(6)
    expect(frames(near)).toBe(EMOTE_FRAMES + 32 + 8)
  })
})
