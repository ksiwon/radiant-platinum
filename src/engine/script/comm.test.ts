// 통신은 다 막혀 있다 (PARITY §9.4)
//
// **재는 것은 "우리가 문을 잠갔는가"가 아니다.** 접수원은 원작대로 말을 걸고
// 메뉴를 띄운다 — 다만 통신을 물었을 때 「안 된다」가 답으로 나오고, 원작이
// 제 대사(「통신 오류」·「또 오세요」)로 스스로 닫는다. 지어낸 글이 없다는
// 것이 이 시험의 뜻이다. 리본신드롬과 같은 방법이다 (§9.2).
//
// ⚠️ **안 만들면 우연히 열린다.** 명령을 건너뛰면 결과 변수에 앞 갈래가 쓴
// 값이 그대로 남는다. 리본은 열려도 대사 하나로 끝나지만 **통신은 열리면
// 주인공이 통행 불가인 카운터 뒤로 걸어 들어가 갇힌다** — 그래서 여기가
// 「없다」를 못 박는 자리다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCommands } from './commands'
import { ScriptContext, type CommonScripts } from './context'
import { entryOffset, fileBytes, parseScriptMeta, resolveScript } from './data'
import { VarStore } from './vars'
import { FieldWorld } from './world'
import { DIR } from './movement'
import { DATA, withData, withDecomp } from '../../data/romData.testkit'
import { stubFieldMoves, stubLabels, stubParty, stubTrainerInfo } from './services.testkit'
import {
  COMM_CLUB_RET, COMM_MAPS, FLAG_COMMUNICATION_CLUB_ACCESSIBLE, SCRIPT_UNION_ROOM_ATTENDANT, SCRIPT_WIFI_CLUB_ATTENDANT,
  VAR_COMMUNICATION_LOAD_ACTION,
} from '../world/comm'
import { fadeAlpha, screenFade } from './fade'
import { TILE_BEHAVIOR_SCRIPT_ONLY_WARP } from '../map/world'

const maybe = withData('scripts.json', 'scripts.bin')

/** 통신을 여는 자리들. 파일 이름과 진입점은 디컴프의 `ScriptEntry` 차례다 */
const DOORS = [
  { file: 'scripts_pokemon_center_2f_common', entry: 1, what: '통신 콜로세움 접수원' },
  { file: 'scripts_pokemon_center_2f_common', entry: 3, what: '유니온룸 접수원' },
  { file: 'scripts_pokemon_center_2f_common', entry: 11, what: '트레이너 카드 사인' },
  { file: 'scripts_pokemon_center_2f_common', entry: 2, what: '통신 대전에 들어간 뒤' },
  { file: 'scripts_global_terminal_1f', entry: 2, what: 'GTS 접수원' },
  { file: 'scripts_pal_park_lobby', entry: 1, what: '팔파크 접수원' },
] as const

/** 통신에 넘겨주는 명령들. **하나라도 안 만들면 묵은 값으로 갈라진다** */
const MUST_ANSWER = [
  'StartBattleClient', 'StartBattleServer', 'OpenBattleRegulationMenu', 'TryStartGTSApp',
  'CheckHasWiFiListValidLogin', 'GetWiFListValidFriendsCount', 'CheckNoWiFiPlazaCooldown',
  'IsCommGameCodePlatinum', 'GetGBACartridgeVersion', 'CheckHasEnoughMonForCatchingShow',
  'CheckIsMysteryGiftPhrase', 'MysteryGiftGive', 'UnlockMysteryGift', 'CheckPartyHasBadEgg',
  'ShowUnionRoomMenu', 'GetUnionRoomMessage', 'GetUnionRoomTealaMessage', 'DoUnionRoomGreeting',
  'OpenUnionRoomTrainerCase', 'OpenPartyMenuForUnionRoomBattle',
  'StartLinkBattle', 'FieldCommEnterBattleRoom', 'EndCommunication', 'InitCommFieldCmd',
  'SetCommPlayerDir', 'ClearReceivedTempDataAllPlayers', 'DestroyNetworkIcon',
  'LogLinkInfoInWiFiHistory', 'StartSignatureApp',
] as const

maybe('통신', () => {
  const meta = parseScriptMeta(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
  const { map, unhandled } = buildCommands(meta.commands)

  const fileOf = (name: string): number => {
    const at = meta.files.findIndex((f) => f.name === name)
    if (at < 0) throw new Error(`${name} 파일이 표에 없다`)
    return at
  }

  /**
   * 접수원과 끝까지 대화한다.
   *
   * 메뉴는 `pick`번째 항목을 고른다 — 어느 것을 골라도 닫혀야 하므로 갈래를
   * 전부 밟는다. 저장은 **진짜로 되는 것으로** 답한다: 안 그러면 통신 앞의
   * 저장 갈래를 못 밟아서 시험이 무엇도 안 재게 된다
   */
  /**
   * `start()`가 세우는 값. 공용 구역 9000번대는 **진입점 번호가 곧 끝자리**다
   * (`SCRIPT_ID_OFFSET_POKEMON_CENTER_2F_COMMON`) — 저장 갈래가 이걸 본다
   */
  const POKECENTER_2F_BASE = 9000
  const POKECENTER_B1F_BASE = 9200

  /** `pick`이 배열이면 메뉴를 차례로 그 값으로 고른다 */
  function talk(file: number, entry: number, pick: number | readonly number[]) {
    const vars = new VarStore()
    // ⚠️ 통신이 「성공」으로 읽힐 값을 미리 부어 둔다. 명령이 답을 안 적으면
    // 이 값이 그대로 남아 문이 열린다 — 리본 시험과 같은 장치다
    for (let id = 0x8000; id < 0x8010; id++) vars.set(id, 1)
    let saved = false
    /** 저장을 **쓰는 순간**의 통신 상태 — 리포트에 박히는 값이다 */
    let atSave: { load: number; flag: boolean } | null = null
    const world = new FieldWorld({
      vars, input: () => ({ pressed: true, held: true }),
      movements: meta.movements,
      services: {
        party: stubParty, labels: stubLabels, trainerInfo: stubTrainerInfo,
        fieldMoves: stubFieldMoves,
        saveGame: {
          type: () => 2, showInfo: () => undefined, hideInfo: () => undefined,
          showIcon: () => undefined, hideIcon: () => undefined,
          begin: () => {
            saved = true
            atSave = { load: vars.get(VAR_COMMUNICATION_LOAD_ACTION), flag: vars.checkFlag(FLAG_COMMUNICATION_CLUB_ACCESSIBLE) }
          },
          result: () => true,
        },
      },
    })
    world.player = { x: 8, z: 6, visible: true, dir: DIR.north }
    // ⚠️ **`start()`가 하는 일을 여기서도 한다.** 유니온룸의 저장 갈래가
    // 「누가 부른 저장인가」로 갈리므로, 이게 없으면 시험이 헛돈다
    if (meta.files[file]?.name === 'scripts_pokemon_center_2f_common') {
      world.scriptID = POKECENTER_2F_BASE + entry
    }
    if (meta.files[file]?.name === 'scripts_pokemon_center_b1f_common') {
      world.scriptID = POKECENTER_B1F_BASE + entry
    }
    const ran: string[] = []
    const traced = new Map(map)
    for (const [op, fn] of map) {
      traced.set(op, (ctx) => {
        ran.push(meta.commands[op]?.name ?? `?${op}`)
        return fn(ctx)
      })
    }
    // ⚠️ **공용 스크립트를 붙여야 이 시험이 뜻이 있다.** 통신 앞의 저장은
    // `Common_SaveGame`(0x7D6)이 하는데, 안 붙이면 그 자리가 통째로 지나가서
    // 「저장이 됐을 때 문이 열리는가」를 못 잰다 (`field.ts`의 `commonScripts`)
    const nested: { sub: ScriptContext | null } = { sub: null }
    const common: CommonScripts = {
      call(id) {
        const target = resolveScript(meta, id, file)
        if (!target) return false
        const info = meta.files[target.file]
        if (!info || target.entry >= info.entries) return false
        const inner = new ScriptContext(
          { vars, world, commands: traced, common }, fileBytes(data, target.file), target.file)
        inner.start(entryOffset(data, target.file, target.entry))
        nested.sub = inner
        return true
      },
      running: () => nested.sub !== null,
    }
    const ctx = new ScriptContext(
      { vars, world, commands: traced, common }, fileBytes(data, file), file)
    ctx.start(entryOffset(data, file, entry))
    let ended = false
    let menus = 0
    for (let frame = 0; frame < 6000; frame++) {
      if (nested.sub !== null) {
        if (!nested.sub.step(200_000)) nested.sub = null
      } else if (!ctx.step(200_000)) { ended = true; break }
      world.tick()
      // ⚠️ 안내(Info)를 고르면 원작 스크립트가 **제자리로 되돌아온다** —
      // 끝없이 안내만 읽는 것은 얼어붙은 것이 아니다. 그래서 넷까지만 답하고
      // 그 뒤로는 손을 뗀다. 답을 기다리며 멈춘 것과 얼어붙은 것을 가른다
      if (world.menu !== null && menus < 4) {
        const list = world.menu.entries
        const want = typeof pick === 'number' ? pick : (pick[menus] ?? 0)
        menus++
        world.choose(list[Math.min(want, list.length - 1)]?.value ?? 0)
      }
    }
    return { ran, ended, saved, atSave: atSave as { load: number; flag: boolean } | null, vars, waiting: world.menu !== null }
  }

  it('통신에 넘겨주는 명령이 하나도 안 빠졌다', () => {
    for (const name of MUST_ANSWER) {
      const op = meta.commands.findIndex((c) => c?.name === name)
      expect(op, `${name}이 명령 표에 없다`).toBeGreaterThanOrEqual(0)
      expect(unhandled.has(op), `${name}이 안 만들어져 있다`).toBe(false)
    }
  })

  describe.each(DOORS)('$what', ({ file, entry }) => {
    it.each([0, 1, 2, 3])('고름 %i — 끝까지 돌고 스스로 닫는다', (pick) => {
      const { ran, ended, waiting } = talk(fileOf(file), entry, pick)
      // 끝났거나, 다음 답을 기다리는 중이거나. **얼어붙는 갈래는 없다**
      expect(ended || waiting, `얼어붙었다: ${ran.slice(-8).join(' → ')}`).toBe(true)
      // 건너뛴 명령이 하나라도 있으면 그 자리는 아직 「답을 안 한」 자리다
      const skipped = ran.filter((name) => {
        const op = meta.commands.findIndex((c) => c?.name === name)
        return unhandled.has(op)
      })
      expect([...new Set(skipped)]).toEqual([])
    })
  })

  it('⚠️ 유니온룸은 저장을 마쳐도 안 열린다 — 원작이 제 대사로 닫는다', () => {
    expect(SCRIPT_UNION_ROOM_ATTENDANT).toBe(POKECENTER_2F_BASE + 3)
    const UNION = 3
    const { ran, saved, vars, atSave } = talk(fileOf('scripts_pokemon_center_2f_common'), UNION, 0)
    // 리포트는 **진짜로 쓴다**. 거짓말하는 것은 저장이 아니라 넘겨주기다
    expect(saved).toBe(true)
    // ⚠️ 다만 **쓰는 순간에는** 통신 상태(`LOAD_ACTION=2` · 깃발 2406)가 서 있지 않다 — 서 있으면 이어하기가 없는 방에서
    // 나오는 연출을 돈다 (`OnFrame_ExitUnionRoom`)
    expect(atSave).toEqual({ load: 0, flag: false })
    expect(vars.get(VAR_COMMUNICATION_LOAD_ACTION)).toBe(0)
    // 문을 여는 갈래(`EnterUnionRoom`)만 문을 그린다. 거기 안 갔다는 뜻이다
    expect(ran).not.toContain('LoadDoorAnimation')
    // 원작이 스스로 치운 자국: 깃발이 도로 내려가 있다 (2406)
    expect(vars.checkFlag(2406)).toBe(false)
  })

  it('⚠️ 딴 자리의 저장은 안 막힌다 — 막는 것은 유니온룸 한 자리뿐이다', () => {
    // 공용 저장 스크립트(0x7D6)를 곧바로 돌려서 **부른 사람만 바꿔 본다**.
    // 이게 안 갈리면 저장이 온 게임에서 막힌다
    const COMMON_SAVE = 0x7d6
    /** `VAR_MAP_LOCAL_0x00` — 공용 저장 스크립트가 결과를 적는 칸 */
    const VAR_MAP_LOCAL_0 = 16_384

    const saveAs = (scriptID: number): { saved: boolean; answer: number } => {
      const vars = new VarStore()
      let saved = false
      const world = new FieldWorld({
        vars, input: () => ({ pressed: true, held: true }),
        movements: meta.movements,
        services: {
          party: stubParty, labels: stubLabels, trainerInfo: stubTrainerInfo,
          fieldMoves: stubFieldMoves,
          saveGame: {
            type: () => 2, showInfo: () => undefined, hideInfo: () => undefined,
            showIcon: () => undefined, hideIcon: () => undefined,
            begin: () => { saved = true }, result: () => true,
          },
        },
      })
      world.player = { x: 0, z: 0, visible: true, dir: DIR.north }
      world.scriptID = scriptID
      const target = resolveScript(meta, COMMON_SAVE, -1)!
      const ctx = new ScriptContext(
        { vars, world, commands: map }, fileBytes(data, target.file), target.file)
      ctx.start(entryOffset(data, target.file, target.entry))
      for (let frame = 0; frame < 2000; frame++) {
        if (!ctx.step(200_000)) break
        world.tick()
        if (world.menu !== null) world.choose(world.menu.entries[0]?.value ?? 0)
      }
      return { saved, answer: vars.get(VAR_MAP_LOCAL_0) }
    }

    // 아무 데서나 저장하면 「됐다」
    expect(saveAs(0)).toEqual({ saved: true, answer: 1 })
    // 유니온룸 접수원이 부르면 **쓰기는 하고** 「안 됐다」로 답한다
    expect(saveAs(SCRIPT_UNION_ROOM_ATTENDANT)).toEqual({ saved: true, answer: 0 })
  })

  it('⚠️ Wi-Fi 클럽 접수원 「친구 코드 → 예」는 저장을 해도 문을 안 연다 — 원작이 「또 오세요」로 닫는다', () => {
    expect(SCRIPT_WIFI_CLUB_ATTENDANT).toBe(POKECENTER_B1F_BASE + 2)
    const file = fileOf('scripts_pokemon_center_b1f_common')
    // 메뉴: 클럽에 간다(0) → 친구 코드를 받겠습니까? 예(0)
    const { ran, ended, saved, vars } = talk(file, 2, [0, 0])
    expect(ended).toBe(true)
    // 저장은 진짜로 쓴다. 문을 열고 들어가는 연출(`EnterWiFiClub`)은 안 돈다
    expect(saved).toBe(true)
    expect(ran).not.toContain('LoadDoorAnimation')
    expect(ran).not.toContain('ApplyMovement')
    expect(vars.checkFlag(FLAG_COMMUNICATION_CLUB_ACCESSIBLE)).toBe(false)
  })

  it('⚠️ 접수원 둘은 어느 갈래로도 안 얼고 문을 안 연다 (Wi-Fi 클럽 · 광장)', () => {
    const file = fileOf('scripts_pokemon_center_b1f_common')
    for (const entry of [2, 4]) {
      for (const pick of [0, 1, 2]) {
        const r = talk(file, entry, pick)
        expect(r.ended || r.waiting, `entry ${String(entry)} pick ${String(pick)}`).toBe(true)
        expect(r.ran, `entry ${String(entry)} pick ${String(pick)}`).not.toContain('LoadDoorAnimation')
      }
    }
  })

  describe('콘테스트 접수원 — 대회도 상품도 안 나간다 (PARITY §9.1)', () => {
    const CONTEST_FILE = 'scripts_contests'
    /** 공식전 · 링크전 · 연습전 넷 (`ScriptEntry` 차례) */
    const RECEPTIONISTS = [
      { entry: 6, what: '공식전' }, { entry: 7, what: '링크전' }, { entry: 8, what: '연습전 8' },
      { entry: 9, what: '연습전 9' }, { entry: 10, what: '연습전 10' }, { entry: 11, what: '연습전 11' },
    ] as const

    it('파티 메뉴 · 상품 세 명령이 만들어져 있다', () => {
      for (const name of ['OpenPartyMenuForContest', 'GetContestPartyMenuResult', 'GetFirstTimeVictoryAccessory']) {
        const op = meta.commands.findIndex((c) => c?.name === name)
        expect(op, name).toBeGreaterThanOrEqual(0)
        expect(unhandled.has(op), `${name}이 안 만들어져 있다`).toBe(false)
      }
    })

    describe.each(RECEPTIONISTS)('$what 접수원 (진입점 $entry)', ({ entry }) => {
      // 앞 네 메뉴를 갈래마다 몬다 — 참가/안내/그만(0~2) · 등급(0~3) · 종류(0~5) · 예/아니오
      const picks: number[][] = []
      for (const a of [0, 1, 2]) for (const b of [0, 1, 2, 3]) for (const c of [0, 1, 2, 3, 4, 5]) for (const d of [0, 1]) {
        picks.push([a, b, c, d])
      }
      it.each(picks)('고름 %i · %i · %i · %i — 얼지 않고 대회 · 장식 · 워프가 없다', (a, b, c, d) => {
        const r = talk(fileOf(CONTEST_FILE), entry, [a, b, c, d])
        expect(r.ended || r.waiting, `얼어붙었다: ${r.ran.slice(-8).join(' → ')}`).toBe(true)
        // 대회 본체와 상품 줄은 한 번도 안 돈다
        for (const name of ['NewContest', 'AddAccessory', 'EndContest', 'Warp', 'ChangeIntoContestAttire']) {
          expect(r.ran, name).not.toContain(name)
        }
      })
    })

    it('⚠️ 한 마리도 안 골랐다 — 원작의 「참가를 취소합니까?」에서 「예」면 「또 오세요」로 끝난다', () => {
      // 메뉴: 참가(0) → 등급(0) → 종류(0) → 취소하겠습니까 예(0)
      const r = talk(fileOf(CONTEST_FILE), 6, [0, 0, 0, 0])
      expect(r.ended).toBe(true)
      expect(r.ran).toContain('GetContestPartyMenuResult')
      expect(r.ran).not.toContain('NewContest')
    })

    it('⚠️ 처음 이긴 상품은 「없음」(0xFFFF)이다 — 묵은 등급 번호가 장식이 되지 않는다', () => {
      const op = meta.commands.findIndex((c) => c?.name === 'GetFirstTimeVictoryAccessory')
      const DEST = 0x8004
      for (const stale of [0, 1, 2, 3]) {
        const vars = new VarStore()
        vars.set(DEST, stale)
        const bytes = new Uint8Array(6)
        const view = new DataView(bytes.buffer)
        view.setUint16(0, op, true)
        view.setUint16(2, DEST, true)
        view.setUint16(4, 0x0002, true) // End
        const world = new FieldWorld({ vars, input: () => ({ pressed: true, held: true }), movements: meta.movements, services: {} })
        const ctx = new ScriptContext({ vars, world, commands: map }, bytes, 0)
        ctx.start(0)
        ctx.step(100)
        expect(vars.get(DEST), `묵은 값 ${String(stale)}`).toBe(0xffff)
      }
    })
  })

  describe('글로벌터미널 1층 브리더 남 — 화면을 어둡게 해 두고 끝내지 않는다 (진입점 18)', () => {
    it('「예」를 골라도 화면이 되살아나고 「할 말이 없다」로 끝난다', () => {
      screenFade.now = null
      const r = talk(fileOf('scripts_global_terminal_1f'), 18, [0])
      expect(r.ended).toBe(true)
      expect(r.ran).toContain('ScrCmd_30E')
      expect(fadeAlpha()).toBe(0)
      // 묵은 값이 아니라 우리가 적은 0으로 갈린다
      expect(r.vars.get(0x8004)).toBe(0)
    })

    it('「아니오」도 어둡지 않다', () => {
      screenFade.now = null
      const r = talk(fileOf('scripts_global_terminal_1f'), 18, [1])
      expect(r.ended).toBe(true)
      expect(fadeAlpha()).toBe(0)
    })

    it('`ScrCmd_30E`가 만들어져 있다', () => {
      const op = meta.commands.findIndex((c) => c?.name === 'ScrCmd_30E')
      expect(op).toBeGreaterThanOrEqual(0)
      expect(unhandled.has(op)).toBe(false)
    })
  })

  it('⚠️ 통신 대전은 원작의 「통신 오류」로 닫힌다', () => {
    const op = meta.commands.findIndex((c) => c?.name === 'StartBattleClient')
    const vars = new VarStore()
    const world = new FieldWorld({
      vars, input: () => ({ pressed: true, held: true }),
      movements: meta.movements, services: {},
    })
    world.player = { x: 0, z: 0, visible: true, dir: DIR.north }
    // `StartBattleClient 0x8004, 0x8005, 0, VAR_RESULT` 꼴로 손수 짠다
    const DEST = 0x800c
    const bytes = new Uint8Array(14)
    const view = new DataView(bytes.buffer)
    view.setUint16(0, op, true)
    view.setUint16(2, 0, true)
    view.setUint16(4, 0, true)
    view.setUint16(6, 0, true)
    view.setUint16(8, DEST, true)
    view.setUint16(10, 0x0002, true) // End
    vars.set(DEST, 1)
    const ctx = new ScriptContext({ vars, world, commands: map }, bytes, 0)
    ctx.start(0)
    ctx.step(100)
    expect(vars.get(DEST)).toBe(COMM_CLUB_RET.error)
  })
})

const decomp = withDecomp('generated/vars_flags.txt')

decomp('통신 깃발 번호', () => {
  it('접수원이 세우는 깃발이 2406이다 — 저장 갈래가 이 자리를 설명한다', () => {
    const table = resolve(__dirname, '../../../raw/decomp/generated/vars_flags.txt')
    const out = new Map<string, number>()
    let value = 0
    for (const line of readFileSync(table, 'utf8').split(/\r?\n/).map((s) => s.trim())) {
      if (line === '') continue
      const eq = line.indexOf('=')
      if (eq >= 0) {
        const rhs = line.slice(eq + 1).trim()
        value = out.get(rhs) ?? Number(rhs)
        out.set(line.slice(0, eq).trim(), value)
      } else out.set(line, value)
      value += 1
    }
    expect(out.get('FLAG_COMMUNICATION_CLUB_ACCESSIBLE')).toBe(FLAG_COMMUNICATION_CLUB_ACCESSIBLE)
    expect(out.get('VAR_COMMUNICATION_LOAD_ACTION')).toBe(VAR_COMMUNICATION_LOAD_ACTION)
    expect(FLAG_COMMUNICATION_CLUB_ACCESSIBLE).toBe(2406)
  })
})

const mapData = withData('maps.json', 'events.json', 'matrices/interiors.json')

mapData('통신 맵으로 가는 길', () => {
  const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))
  const maps = (read('maps.json') as { maps: { matrix: number; events: number }[] }).maps
  const events = (read('events.json') as {
    events: { warps: { x: number; z: number; to: number; anchor: number }[]
      npcs: { x: number; z: number }[] }[]
  }).events
  const meta = read('matrices/interiors.json') as {
    matrices: Record<string, {
      id: number; tileWidth: number; tileHeight: number; byteOffset: number
    }>
  }
  const bin = readFileSync(resolve(DATA, 'matrices/interiors.bin'))
  const all = Object.values(meta.matrices)
  const IMPASSABLE = 0x8000
  const MASK = 0x7fff

  const grid = (id: number) => {
    const m = all.find((x) => x.id === id)!
    return { m, t: new Uint16Array(bin.buffer, bin.byteOffset + m.byteOffset, m.tileWidth * m.tileHeight) }
  }

  /** 도착 칸에서 걸어서 닿는 칸 전부. 사람이 선 칸은 못 지나간다 */
  const reach = (mapId: number, from: { x: number; z: number }): Set<number> => {
    const { m, t } = grid(maps[mapId]!.matrix)
    const blocked = new Set(
      (events[maps[mapId]!.events]?.npcs ?? []).map((n) => n.z * m.tileWidth + n.x))
    const seen = new Set<number>()
    const queue = [from.z * m.tileWidth + from.x]
    while (queue.length > 0) {
      const at = queue.pop()!
      if (seen.has(at)) continue
      seen.add(at)
      const x = at % m.tileWidth
      const z = Math.floor(at / m.tileWidth)
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nz < 0 || nx >= m.tileWidth || nz >= m.tileHeight) continue
        const i = nz * m.tileWidth + nx
        if (seen.has(i) || blocked.has(i)) continue
        if (((t[i] ?? IMPASSABLE) & IMPASSABLE) !== 0) continue
        queue.push(i)
      }
    }
    return seen
  }

  /** 포켓몬센터 2층. 열여덟 곳이 다 같은 행렬(`m_pc02_`)을 쓴다 */
  const POKECENTER_2F = 7
  /** 계단으로 올라오는 칸 */
  const STAIRS = { x: 2, z: 10 }

  it('⚠️ 유니온룸 문은 카운터 너머라 걸어서 못 닿는다 — 문이 있는 18곳 전부', () => {
    // 행렬은 같아도 사건 자료(사람이 선 칸)는 곳마다 다르다 — 한 곳만 재면
    // 나머지 열일곱은 「같겠지」가 된다
    const doors = maps.flatMap((mm, id) => (mm?.events == null ? [] : (events[mm.events]?.warps ?? [])
      .filter((w) => w.to === COMM_MAPS.unionRoom).map((w) => ({ id, w }))))
    expect(doors.length).toBe(18)
    expect(doors.map((d) => d.id)).toContain(POKECENTER_2F)
    for (const { id, w } of doors) {
      const { m } = grid(maps[id]!.matrix)
      const walkable = reach(id, STAIRS)
      expect(walkable.size, `맵 ${String(id)}`).toBeGreaterThan(50)
      expect(walkable.has(w.z * m.tileWidth + w.x), `맵 ${String(id)} 유니온룸 문`).toBe(false)
    }
  })

  it('⚠️ 지하통로(맵 2)도 들어오는 워프가 아예 없다 — 입구는 탐험세트뿐이다', () => {
    // 지하통로는 범위 밖이다 (PARITY §9 · 3D_GAP_AUDIT §9). 원작도 워프가 아니라
    // 탐험세트를 쓰는 순간 들어가고, 우리 탐험세트는 「이 게임에서는 지하통로에
    // 갈 수 없다.」로 답한다 (`bag/fieldUse`의 `MISSING`)
    const UNDERGROUND = 2
    const into = maps.flatMap((mm, i) => (mm?.events == null ? [] : (events[mm.events]?.warps ?? [])
      .filter((w) => w.to === UNDERGROUND).map(() => i)))
    expect(into).toEqual([])
  })

  it('⚠️ Wi-Fi 광장은 들어오는 워프가 아예 없다', () => {
    const into = maps.flatMap((mm, i) => (mm?.events == null ? [] : (events[mm.events]?.warps ?? [])
      .filter((w) => w.to === COMM_MAPS.wifiPlazaEntrance).map(() => i)))
    expect(into).toEqual([])
  })

  it('⚠️ 밟아서 뛰는 워프에서 뺀 성질은 온 게임에 하나뿐이다 — 팔파크 문', () => {
    let found = 0
    for (const mm of maps) {
      if (mm?.events == null) continue
      const g = all.find((x) => x.id === mm.matrix)
      if (!g) continue
      const t = new Uint16Array(bin.buffer, bin.byteOffset + g.byteOffset, g.tileWidth * g.tileHeight)
      for (const w of events[mm.events]?.warps ?? []) {
        const v = t[w.z * g.tileWidth + w.x]
        if (v === undefined || (v & IMPASSABLE) !== 0) continue
        if ((v & MASK) === TILE_BEHAVIOR_SCRIPT_ONLY_WARP) found += 1
      }
    }
    expect(found).toBe(1)
  })
})
