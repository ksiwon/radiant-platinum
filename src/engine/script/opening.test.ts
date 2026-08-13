// 오프닝의 고비 — 201번도로의 서류가방 (DATA.md §2.10)
//
// 여기가 오프닝에서 제일 많은 것이 한 번에 걸리는 자리다. 원작 바이트코드
// 그대로 돌리면 이 순서로 지나간다:
//
//   FadeScreenOut → 가방을 지우고 → **고르는 화면**(StartChooseStarterScene)
//   → 고른 것을 적고(SaveChosenStarter) → 필드로 돌아와 → 그 종을 받는다
//   (GetPlayerStarterSpecies · GivePokemon) → 라이벌 이름과 **라이벌의 파트너**를
//   글에 끼우고 → 한판 붙자 → StartFirstBattle
//
// ⚠️ 이 고리는 **하나가 끊겨도 조용하다.** 고르는 화면이 결과를 안 주면
// `VAR_PLAYER_STARTER`가 0으로 남고, 그러면 `GivePokemon`이 0번 종을 주려다
// 실패하고, 스크립트는 "가방이 가득 찼다" 쪽으로 흘러 대사만 이상해진다.
// 그래서 **받은 종족 번호**까지 본다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, expect, it } from 'vitest'
import { buildCommands, VAR_PLAYER_STARTER, type CommandTable } from './commands'
import { entryOffset, fileBytes, parseScriptMeta, type ScriptData } from './data'
import { ScriptContext } from './context'
import { MENU_YES, FieldWorld, type FieldServices } from './world'
import { TEXT_SPEED } from './printer'
import { VarStore } from './vars'
import type { MapHeader } from '../map/world'
import { withData } from '../../data/romData.testkit'
import { stubLabels, stubParty } from './services.testkit'

const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('scripts.bin', 'maps.json')
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

/** 201번도로. `map_headers.txt`의 342번 (`R201`) */
const ROUTE_201 = 342
/** `scripts_route_201.s`의 진입점 표에서 열세 번째 — `Route201_Briefcase` */
const BRIEFCASE_ENTRY = 12

/** `generated/species.txt` */
const TURTWIG = 387
const CHIMCHAR = 390
const PIPLUP = 393

/** 원작이 주는 레벨 (`GivePokemon VAR_0x8000, 5, ITEM_NONE, VAR_RESULT`) */
const STARTER_LEVEL = 5

maybe('오프닝 — 서류가방', () => {
  const meta = parseScriptMeta(read('scripts.json'))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const data: ScriptData = {
    meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength),
  }
  const maps = (read('maps.json') as { maps: MapHeader[] }).maps
  const file = maps[ROUTE_201]!.scripts
  let commands: CommandTable

  beforeEach(() => { commands = buildCommands(meta.commands) })

  interface Run {
    vars: VarStore
    given: { species: number, level: number }[]
    battles: number[]
    /** 창에 올라간 글 번호 순서 */
    messages: number[]
    /** `BufferRivalStarterSpeciesName 2`가 채우는 칸에 들어온 값들 */
    slot2: string[]
  }

  /**
   * 서류가방 진입점을 끝까지 돌린다.
   *
   * 프레임 고리다 — `Message`가 프레임을 넘기고 `WaitFadeScreen`이 덮개를
   * 기다린다. 버튼은 늘 눌려 있는 것으로 친다
   */
  function runBriefcase(chosen: number, won: boolean): Run {
    const vars = new VarStore()
    const given: { species: number, level: number }[] = []
    const battles: number[] = []
    const messages: number[] = []
    const slot2: string[] = []

    const services: FieldServices = {
      chooseStarter: { open: () => { /* 곧바로 끝난다 */ }, chosen: () => chosen },
      party: {
        ...stubParty,
        count: () => given.length,
        species: (slot) => given[slot]?.species ?? 0,
        hasSpecies: (s) => given.some((g) => g.species === s),
        give: (species, level) => { given.push({ species, level }); return true },
        level: () => STARTER_LEVEL,
      },
      labels: { ...stubLabels, species: (id) => `종${String(id)}` },
      startFirstBattle: (id) => { battles.push(id) },
      battleResult: () => (won ? 'win' : 'loss'),
      healParty: () => { /* 집으로 돌아가기 전에 회복한다 */ },
      sound: {
        playEffect: () => { /* 소리는 안 본다 */ },
        stopEffect: () => { /* 소리는 안 본다 */ },
        effectPlaying: () => false,
        playCry: () => { /* 소리는 안 본다 */ },
        cryPlaying: () => false,
        playFanfare: () => { /* 소리는 안 본다 */ },
        fanfarePlaying: () => false,
        setMusic: () => { /* 소리는 안 본다 */ },
        sequencePlaying: () => false,
        fadeVolume: () => { /* 소리는 안 본다 */ },
      },
    }

    const world = new FieldWorld({
      vars,
      messages: [],
      options: { speed: TEXT_SPEED.instant, canSkip: true, autoScroll: false },
      input: () => ({ pressed: true, held: true }),
      movements: meta.movements,
      services,
    })
    const ctx = new ScriptContext(
      { vars, world, commands: commands.map }, fileBytes(data, file), file,
    )
    ctx.start(entryOffset(data, file, BRIEFCASE_ENTRY))
    for (let frame = 0; frame < 5000; frame++) {
      if (!ctx.step(100_000)) break
      if (world.lastMessage !== null && messages.at(-1) !== world.lastMessage) {
        messages.push(world.lastMessage)
      }
      // "한판 붙자!"에는 예로 답한다 — 아니오는 되물어 오는 자리라 안 끝난다
      if (world.menu !== null) world.choose(MENU_YES)
      const two = world.slots.get(2)
      if (two !== '' && slot2.at(-1) !== two) slot2.push(two)
      world.tick()
    }
    return { vars, given, battles, messages, slot2 }
  }

  it('고른 종이 세이브 변수에 적히고 그대로 파티에 들어간다', () => {
    const run = runBriefcase(CHIMCHAR, true)
    // `SaveChosenStarter` → `SystemVars_SetPlayerStarter`
    expect(run.vars.get(VAR_PLAYER_STARTER)).toBe(CHIMCHAR)
    // `GetPlayerStarterSpecies VAR_0x8000` → `GivePokemon VAR_0x8000, 5, …`
    expect(run.given).toEqual([{ species: CHIMCHAR, level: STARTER_LEVEL }])
  })

  it('라이벌은 내 것에 강한 쪽을 든다', () => {
    // `BufferRivalStarterSpeciesName 2` — 대사에 그 이름이 들어간다.
    // 모부기를 고르면 불꽃숭이, 불꽃숭이면 팽도리, 팽도리면 모부기다
    for (const [mine, rival] of [
      [TURTWIG, CHIMCHAR], [CHIMCHAR, PIPLUP], [PIPLUP, TURTWIG],
    ] as const) {
      const run = runBriefcase(mine, true)
      expect(run.slot2).toContain(`종${String(rival)}`)
    }
  })

  it('라이벌 배틀은 고른 파트너에 맞춰 상대가 갈린다', () => {
    // 세 트레이너가 따로 있다 (`TRAINER_RIVAL_ROUTE_201_*`). 번호를 안 보고
    // **서로 다른가**만 본다 — 어느 번호인지는 트레이너 표가 정한다
    const ids = [TURTWIG, CHIMCHAR, PIPLUP].map((s) => runBriefcase(s, true).battles)
    for (const got of ids) expect(got).toHaveLength(1)
    expect(new Set(ids.flat()).size).toBe(3)
  })

  it('져도 이야기가 이어진다', () => {
    // ⚠️ 첫 배틀은 **져도 된다.** 원작은 지면 라이벌이 "내가 이겼네,
    // 집에 가자"라고 하고 같은 자리로 흘러간다 — 여기서 스크립트가 멎으면
    // 전멸 처리로 새는 것이다
    const lost = runBriefcase(TURTWIG, false)
    const won = runBriefcase(TURTWIG, true)
    expect(lost.battles).toHaveLength(1)
    // 마지막에 도는 것은 같다: 집으로 옮기기 전 대사까지 간다
    expect(lost.messages.length).toBeGreaterThan(0)
    expect(lost.messages.at(-1)).not.toBe(won.messages.at(-1))
  })
})
