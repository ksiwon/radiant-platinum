// 배틀팩토리 시설 장면 — 원작 스크립트(`frontier_scripts_battle_factory.s`)의 갈래를 차례대로 밟는다
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ChallengeType } from './factory'
import {
  LOAD_ACTION, PRINT_STATE, runFactoryScene, SCENE_RECORD, SCENE_SOUND, SCENE_TEXT,
  type FactorySceneHost, type SceneVar,
} from './factoryScene'

const T = SCENE_TEXT
const NAME = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k]))

interface Plan {
  challenge?: ChallengeType
  streak?: number
  battle?: number
  /** 판마다 이기는가. 모자라면 이긴다 */
  results?: boolean[]
  /** 판 사이 메뉴에서 차례로 고를 것 — 0 계속 · 1 쉰다 · 2 포기 · null B. 모자라면 계속 */
  menu?: (number | null)[]
  /** 예/아니오 답. 모자라면 예 */
  answers?: boolean[]
  printState?: number
  commonType?: string | null
}

function fake(plan: Plan) {
  const log: string[] = []
  const vars: Record<SceneVar, number> = { loadAction: LOAD_ACTION.inProgress, printState: plan.printState ?? 0 }
  let streak = plan.streak ?? 0
  let battle = plan.battle ?? 0
  const round = Math.min(Math.floor(streak / 7), 8)
  const results = [...(plan.results ?? [])]
  const menu = [...(plan.menu ?? [])]
  const answers = [...(plan.answers ?? [])]
  const host: FactorySceneHost = {
    say: (text, slots) => {
      log.push(slots === undefined ? NAME[text]! : `${NAME[text]!}(${slots.filter(Boolean).join(',')})`)
      return Promise.resolve()
    },
    yesNo: (text, yes) => {
      const answer = answers.length > 0 ? answers.shift()! : true
      log.push(`${NAME[text]!}?${yes ? 'Y' : 'N'}=${answer ? 'yes' : 'no'}`)
      return Promise.resolve(answer)
    },
    list: (text, options, slots) => {
      const pick = menu.length > 0 ? menu.shift()! : 0
      log.push(`${NAME[text]!}(${(slots ?? []).join(',')})[${options.map((o) => NAME[o]).join('/')}]=${String(pick)}`)
      return Promise.resolve(pick)
    },
    trainerIntro: (trainer) => { log.push(`intro:${String(trainer)}`); return Promise.resolve() },
    // 무대는 차례에 안 적는다 — 수철의 등장만 글 자리를 가르므로 적는다
    stage: (cue) => { if (cue === 'thorton') log.push('stage:thorton'); return Promise.resolve() },
    sound: (seq) => { log.push(`se:${String(seq)}`); return Promise.resolve() },
    fanfare: (seq) => { log.push(`fanfare:${String(seq)}`); return Promise.resolve() },
    save: () => { log.push('save'); return Promise.resolve() },
    reset: () => { log.push('reset') },
    getVar: (w) => vars[w],
    setVar: (w, v) => { vars[w] = v; log.push(`${w}=${String(v)}`) },
    addRecord: (id) => { log.push(`record:${String(id)}`) },
    playerName: () => '빛나',
    challenge: () => plan.challenge ?? ChallengeType.SINGLE,
    streak: () => streak,
    battle: () => battle,
    round: () => round,
    trainer: () => 100 + battle,
    opponentInfo: () => ({ species: ['가', '나', '다'], firstMove: '몸통박치기', commonType: plan.commonType ?? null }),
    partyNames: () => ['하', '나', '둘'],
    rental: () => { log.push('rental'); return Promise.resolve() },
    trade: () => { log.push('trade'); return Promise.resolve() },
    fight: () => { log.push('fight'); return Promise.resolve(results.length > 0 ? results.shift()! : true) },
    won: () => { battle++; streak = Math.min(streak + 1, 9999) },
    finishRound: () => { log.push('finishRound'); return 5 },
    giveBattlePoints: (bp) => { log.push(`bp+${String(bp)}`) },
    endChallenge: () => { log.push('endChallenge') },
    suspend: () => { log.push('suspend') },
    random: () => 7,
  }
  return { host, log, vars }
}

const DOOR = `se:${String(SCENE_SOUND.door)}`

describe('새 도전 — 일곱 판을 다 이긴다', () => {
  it('상대 정보 → 대여 → 판마다 「안으로」·인사·배틀 → 회복 팡파르 → 메뉴 → 정보 → 교환 물음', async () => {
    const { host, log, vars } = fake({})
    expect(await runFactoryScene(host, false)).toBe('roundDone')
    expect(log.slice(0, 13)).toEqual([
      'info3Mon(가,나,다)', 'choosePokemon', 'rental',
      'goIn', DOOR, 'intro:100', 'fight', `record:${String(SCENE_RECORD.victories)}`,
      'wellDone', `fanfare:${String(SCENE_SOUND.wellDone)}`,
      'areYouReady(2)[continueOption/restOption/retireOption]=0',
      'info3Mon(가,나,다)', 'tradeQuestion?Y=yes',
    ])
    expect(log[13]).toBe('trade')
    expect(log.filter((l) => l === 'fight')).toHaveLength(7)
    // 일곱째 판 뒤에는 회복도 메뉴도 없이 곧바로 BP다
    expect(log.slice(-11)).toEqual([
      'fight', `record:${String(SCENE_RECORD.victories)}`, 'finishRound', 'loadAction=1', 'bpEarned', 'bp+5',
      'receiveBp(빛나,5)', `fanfare:${String(SCENE_SOUND.bp)}`, 'returnPokemon', 'save', `se:${String(SCENE_SOUND.save)}`,
    ])
    expect(vars.loadAction).toBe(LOAD_ACTION.roundDone)
  })
})

describe('끝맺음마다 로비에 남기는 값', () => {
  it('셋째 판에서 진다 — 「교환」 안내 · 저장 · LOAD_ACTION 3', async () => {
    const { host, log, vars } = fake({ results: [true, true, false] })
    expect(await runFactoryScene(host, false)).toBe('lost')
    expect(log.slice(-5)).toEqual(['endChallenge', 'loadAction=3', 'returnPokemon', 'save', `se:${String(SCENE_SOUND.save)}`])
    expect(vars.loadAction).toBe(LOAD_ACTION.ended)
  })

  it('둘째 판 뒤에 쉰다 — 접어 두고 저장하고 끈다. 「교환」 안내는 없다', async () => {
    const { host, log, vars } = fake({ menu: [0, 1] })
    expect(await runFactoryScene(host, false)).toBe('rested')
    expect(log.slice(-7)).toEqual([
      'areYouReady(3)[continueOption/restOption/retireOption]=1', 'breakQuestion?Y=yes',
      'loadAction=2', 'suspend', 'save', `se:${String(SCENE_SOUND.save)}`, 'reset',
    ])
    expect(vars.loadAction).toBe(LOAD_ACTION.rested)
  })

  it('쉬기를 「아니오」하면 메뉴로 돌아간다', async () => {
    const { host, log } = fake({ menu: [1, 0], answers: [false] })
    await runFactoryScene(host, false)
    expect(log.slice(10, 13)).toEqual([
      'areYouReady(2)[continueOption/restOption/retireOption]=1', 'breakQuestion?Y=no',
      'areYouReady(2)[continueOption/restOption/retireOption]=0',
    ])
  })

  it('포기한다 — 처음 커서는 「아니오」 · 「교환」 안내 뒤 기록 · LOAD_ACTION 3', async () => {
    const { host, log, vars } = fake({ menu: [2] })
    expect(await runFactoryScene(host, false)).toBe('retired')
    expect(log.slice(-7)).toEqual([
      'areYouReady(2)[continueOption/restOption/retireOption]=2', 'retireQuestion?N=yes',
      'returnPokemon', 'endChallenge', 'loadAction=3', 'save', `se:${String(SCENE_SOUND.save)}`,
    ])
    expect(vars.loadAction).toBe(LOAD_ACTION.ended)
  })

  it('메뉴에서 B는 포기 물음이다', async () => {
    const { host, log } = fake({ menu: [null], answers: [false] })
    await runFactoryScene(host, false)
    expect(log[11]).toBe('retireQuestion?N=no')
  })
})

describe('쉬었던 도전을 잇는다', () => {
  it('곧바로 「다음은 N번째」 메뉴다 — 대여도 상대 정보도 없다', async () => {
    const { host, log } = fake({ battle: 3, streak: 10 })
    await runFactoryScene(host, true)
    expect(log[0]).toBe('areYouReady(4)[continueOption/restOption/retireOption]=0')
    expect(log[1]).toBe('info2Mon(가,나)')
    expect(log).not.toContain('rental')
  })
})

describe('상대 정보는 라운드로 갈린다 (`unk_0E`)', () => {
  const first = async (streak: number, commonType: string | null = null) => {
    const { host, log } = fake({ streak, commonType, results: [false] })
    await runFactoryScene(host, false)
    return log[0]
  }
  it('0 종족 셋 · 1 둘 · 2 기술과 종족 · 3 첫 기술 · 4부터 타입', async () => {
    expect(await first(0)).toBe('info3Mon(가,나,다)')
    expect(await first(7)).toBe('info2Mon(가,나)')
    expect(await first(14)).toBe('info1Mon(몸통박치기,가)')
    expect(await first(21)).toBe('infoFirstMove(몸통박치기)')
    expect(await first(28, '불꽃')).toBe('infoCommonType(불꽃)')
    expect(await first(63)).toBe('infoVariedTypes')
  })
})

describe('시설장 수철 (싱글만 · 스물한·마흔아홉 판째)', () => {
  it('스무 판째를 이긴 뒤 예고가 한 번 · 연기 속 등장 · 이기면 은 인쇄가 「받을 차례」가 된다', async () => {
    const { host, log, vars } = fake({ streak: 14 })
    await runFactoryScene(host, false)
    const notice = log.indexOf('headApproaching(21)')
    expect(notice).toBeGreaterThan(0)
    expect(log.filter((l) => l.startsWith('headApproaching'))).toHaveLength(1)
    const intro = log.indexOf('thortonIntro(하,나,둘,17)')
    expect(intro).toBeGreaterThan(notice)
    // 연기 속 수철 — 소리는 무대가 낸다 (`_154A`)
    expect(log[intro - 1]).toBe('stage:thorton')
    expect(log[intro + 1]).toBe(`record:${String(SCENE_RECORD.headBattles)}`)
    expect(log.slice(intro + 2, intro + 6)).toEqual([
      'fight', `record:${String(SCENE_RECORD.victories)}`, `printState=${String(PRINT_STATE.silverPending)}`, 'beatThorton(21)',
    ])
    expect(vars.printState).toBe(PRINT_STATE.silverPending)
  })

  it('은을 이미 가졌으면 스물한 판째 인쇄는 그대로다 · 금은 은이 있어야 선다', async () => {
    const silver = fake({ streak: 14, printState: PRINT_STATE.silver })
    await runFactoryScene(silver.host, false)
    expect(silver.vars.printState).toBe(PRINT_STATE.silver)
    const gold = fake({ streak: 42, printState: PRINT_STATE.silver })
    await runFactoryScene(gold.host, false)
    expect(gold.vars.printState).toBe(PRINT_STATE.goldPending)
    expect(gold.log).toContain('beatThortonGold(49)')
  })

  it('더블에는 시설장이 없다', async () => {
    const { host, log } = fake({ streak: 14, challenge: ChallengeType.DOUBLE })
    await runFactoryScene(host, false)
    expect(log.some((l) => l.startsWith('thorton') || l.startsWith('headApproaching'))).toBe(false)
  })
})

const SCRIPT = 'raw/decomp/res/field/frontier_scripts/frontier_scripts_battle_factory.s'
const BANK = 'raw/decomp/res/text/battle_factory_scene.json'

describe.runIf(existsSync(SCRIPT) && existsSync(BANK))('원작과 맞대기', () => {
  it('글 번호가 뱅크의 차례와 같다', () => {
    const ids = (JSON.parse(readFileSync(BANK, 'utf8')) as { messages: { id: string }[] }).messages.map((m) => m.id)
    const want: Record<keyof typeof SCENE_TEXT, string> = {
      choosePokemon: 'ChoosePokemon', goIn: 'GoIn', wellDone: 'WellDone', areYouReady: 'AreYouReady',
      tradeQuestion: 'TradeQuestion', breakQuestion: 'BreakQuestion', retireQuestion: 'RetireQuestion',
      bpEarned: 'BPEarned', receiveBp: 'ReceiveBP', returnPokemon: 'ReturnPokemon', saving: 'Saving2',
      info3Mon: 'OpponentInfo3Mon', info2Mon: 'OpponentInfo2Mon', info1Mon: 'OpponentInfo1Mon',
      infoFirstMove: 'OpponentInfoFirstMove', infoCommonType: 'OpponentInfoCommonType',
      infoVariedTypes: 'OpponentInfoVariedTypes', continueOption: 'ContinueOption', restOption: 'RestOption',
      retireOption: 'RetireOption', headApproaching: 'FactoryHeadApproaching', thortonIntro: 'ThortonIntro',
      thortonIntroGold: 'ThortonIntroGold', beatThorton: 'BeatThorton', beatThortonGold: 'BeatThortonGold',
    }
    for (const [key, name] of Object.entries(want)) {
      expect(ids[SCENE_TEXT[key as keyof typeof SCENE_TEXT]]).toBe(`BattleFactoryScene_Text_${name}`)
    }
  })

  it('끝맺음 값과 인쇄 값이 스크립트에 적힌 그대로다', () => {
    const s = readFileSync(SCRIPT, 'utf8')
    expect(s).toMatch(/_0BD9:\n\s+CallBattleFactoryFunction BF_FUNC_UNK_22[^\n]*\n\s+SetSystemVar VAR_BATTLE_FACTORY_LOBBY_LOAD_ACTION, 1/)
    expect(s).toMatch(/_115C:\n\s+SetSystemVar VAR_BATTLE_FACTORY_LOBBY_LOAD_ACTION, 2/)
    expect(s).toMatch(/_1216:\n[^\n]*\n\s+SetSystemVar VAR_BATTLE_FACTORY_LOBBY_LOAD_ACTION, 3/)
    expect(s).toMatch(/_15D6:\n\s+SetSystemVar VAR_BATTLE_FACTORY_PRINT_STATE, 1/)
    expect(s).toMatch(/_160A:\n\s+SetSystemVar VAR_BATTLE_FACTORY_PRINT_STATE, 3/)
    // 포기 물음의 처음 커서는 「아니오」, 쉬기 · 교환은 「예」
    expect(s).toMatch(/BreakQuestion\n\s+ShowYesNoMenu VAR_0x8008, MENU_YES/)
    expect(s).toMatch(/RetireQuestion\n\s+ShowYesNoMenu VAR_0x8008, MENU_NO/)
    expect(s).toMatch(/TradeQuestion\n\s+ShowYesNoMenu VAR_0x8008, MENU_YES/)
  })
})
