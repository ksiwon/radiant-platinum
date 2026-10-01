// 경험치 · 레벨업 · 교체 · 도구가 화면과 박자에 어떻게 접히는가
//
// 소리를 실제로 내는 것은 `ui/battle/BattleSound`고, 그쪽이 보는 것이 `lastReward`다.
// 여기서 재는 것은 **같은 점수가 이어서 와도 두 번 난다**는 것 — 파티 여섯이
// 같은 몫을 받으면 값이 전부 같아서, 번호가 없으면 뒤 다섯이 조용하다.
//
// 그리고 원작이 사건 하나를 여러 박자로 가르는 자리(경험치 · 교체)를 `buildBeats`가
// 원작 차례대로 펴는지 — 게이지가 차는 프레임, 레벨마다의 체력판, 「돌아와!」의 갈래
import { describe, expect, it } from 'vitest'
import type { Stats } from '../../data/schema'
import type { Actor, BattleEvent } from './events'
import { levelStep, rewardSteps } from './events'
import { buildBeats, expGaugeFrames } from './playback'
import { applyEvent, applyEvents, emptyView, type BattleView } from './view'

const reward = (exp: number, levels: number[] = []): BattleEvent => ({
  kind: 'reward', key: 'p1-0', exp, levels, learned: [], pending: [],
})

const MINE: Actor = { slot: 'p1a', side: 'p1', name: 'p1-0' }
const FOE: Actor = { slot: 'p2a', side: 'p2', name: 'p2-0' }

const enter = (actor: Actor, hp: number, maxHp = hp, extra: Partial<BattleEvent> = {}): BattleEvent => ({
  kind: 'switch', actor, species: 387, speciesName: 'Turtwig', level: 5, gender: 'male', shiny: false,
  condition: { hp, maxHp, status: 'ok' }, forced: false, ...extra,
} as BattleEvent)

const hurt = (actor: Actor, hp: number, maxHp: number): BattleEvent => ({
  kind: 'damage', actor, condition: { hp, maxHp, status: 'ok' }, from: null,
})

const stats = (hp: number, n: number): Stats => ({ hp, atk: n, def: n, spa: n, spd: n, spe: n })

/** 사건을 종류와 몇 가지 값으로 적는 글 — 실제 문구는 UI가 정한다 */
const say = (e: BattleEvent): string | null => {
  switch (e.kind) {
    case 'reward': return `exp ${String(e.exp)}`
    case 'levelup': return `lv ${String(e.level)}`
    case 'learnmove': return `${e.learned ? 'learned' : 'wants'} ${String(e.move)}`
    case 'recall': return `recall ${e.actor.name} ${String(e.percent)}`
    case 'switch': return `go ${e.actor.name}${e.foeHpPermille === undefined ? '' : ` ${String(e.foeHpPermille)}`}`
    case 'item': case 'enditem': return `${e.kind} ${e.actor?.name ?? '-'} ${e.item.id}`
    case 'curestatus': return `cure ${e.curedBy ? `${e.curedBy.item.id}${e.curedBy.all ? ' all' : ''}` : '-'}`
    case 'volatile': return `end ${e.curedBy ? `${e.curedBy.item.id}${e.curedBy.all ? ' all' : ''}` : '-'}`
    default: return null
  }
}

describe('경험치를 받은 자리', () => {
  it('빈 화면에는 아무 값도 없다', () => {
    expect(emptyView().lastReward).toBeNull()
  })

  it('받으면 점수와 레벨이 올랐는가가 남는다', () => {
    const view = applyEvent(emptyView(), reward(160, [6, 7]))
    expect(view.lastReward).toEqual({ exp: 160, levelUp: true, seq: 1 })
  })

  it('레벨이 안 올랐으면 그 소리는 안 난다', () => {
    expect(applyEvent(emptyView(), reward(12)).lastReward)
      .toEqual({ exp: 12, levelUp: false, seq: 1 })
  })

  it('같은 점수가 이어서 와도 번호가 오른다', () => {
    // 파티 여섯이 같은 몫을 받는 자리다 — 번호가 없으면 뒤 다섯이 조용하다
    let view = emptyView()
    for (let i = 0; i < 6; i += 1) view = applyEvent(view, reward(40))
    expect(view.lastReward).toEqual({ exp: 40, levelUp: false, seq: 6 })
  })

  it('0점은 값이 남되 소리 쪽이 거른다', () => {
    // 레벨 100은 한 점도 못 받는다. 그래도 사건이 오면 번호는 오른다 —
    // 「소리를 낼 것인가」는 `BattleSound`가 `exp > 0`으로 가른다
    expect(applyEvent(emptyView(), reward(0, [])).lastReward)
      .toEqual({ exp: 0, levelUp: false, seq: 1 })
  })

  it('⚠️ 보상 사건 자체는 체력판을 안 고친다 — 진실의 뷰가 sim과 갈리지 않게', () => {
    const view = applyEvents(emptyView(), [enter(MINE, 20), reward(160, [6])])
    expect(view.active.p1a).toMatchObject({ level: 5, hp: 20, maxHp: 20 })
  })
})

describe('레벨업이 체력판에 접힌다 (`BattleController_EmitRefreshHPGauge`)', () => {
  const up = (level: number, after: Stats | null): BattleEvent =>
    ({ kind: 'levelup', key: 'p1-0', level, before: null, after })

  it('레벨과 최대 HP가 바뀌고, HP는 최대 HP가 는 만큼 는다', () => {
    // `Pokemon_CalcStats` — 비율이 아니라 차이를 더한다
    const view = applyEvents(emptyView(), [enter(MINE, 12, 20), up(6, stats(23, 10))])
    expect(view.active.p1a).toMatchObject({ level: 6, maxHp: 23, hp: 15 })
  })

  it('같은 사건을 두 번 접어도 HP가 두 번 늘지 않는다', () => {
    const once = applyEvents(emptyView(), [enter(MINE, 12, 20), up(6, stats(23, 10))])
    const twice = applyEvent(once, up(6, stats(23, 10)))
    expect(twice.active.p1a).toMatchObject({ level: 6, maxHp: 23, hp: 15 })
  })

  it('능력치를 모르면 레벨만 바뀐다', () => {
    const view = applyEvents(emptyView(), [enter(MINE, 12, 20), up(6, null)])
    expect(view.active.p1a).toMatchObject({ level: 6, maxHp: 20, hp: 12 })
  })

  it('상대 자리와 무대에 없는 마리는 건드리지 않는다', () => {
    const base = applyEvents(emptyView(), [enter(FOE, 20), enter(MINE, 20)])
    const other: BattleEvent = { kind: 'levelup', key: 'p1-3', level: 9, before: null, after: stats(40, 9) }
    expect(applyEvent(base, other)).toBe(base)
    const foe: BattleEvent = { kind: 'levelup', key: 'p2-0', level: 9, before: null, after: stats(40, 9) }
    expect(applyEvent(base, foe)).toBe(base)
  })

  it('경험치 막대는 우리 쪽만 밀고 0~1로 자른다', () => {
    let view = applyEvents(emptyView(), [enter(FOE, 20), enter(MINE, 20, 20, { expProgress: 0.25 })])
    expect(view.active.p1a?.expProgress).toBe(0.25)
    // 상대는 막대가 없다
    expect(view.active.p2a?.expProgress).toBeUndefined()
    view = applyEvent(view, { kind: 'expgauge', key: 'p1-0', to: 1.4 })
    expect(view.active.p1a?.expProgress).toBe(1)
    // 레벨이 오르면 빈 막대에서 다시 찬다
    view = applyEvent(view, up(6, null))
    expect(view.active.p1a?.expProgress).toBe(0)
  })

  it('막대 값을 몰랐으면 레벨이 올라도 계속 모른다', () => {
    const view = applyEvents(emptyView(), [enter(MINE, 20), up(6, null)])
    expect(view.active.p1a?.expProgress).toBeUndefined()
  })
})

describe('보상 사건의 차례 (`rewardSteps`)', () => {
  it('숫자뿐인 레벨 칸은 레벨만 든 칸이다', () => {
    expect(levelStep(7)).toEqual({ level: 7 })
    expect(levelStep({ level: 7, learned: [33] })).toEqual({ level: 7, learned: [33] })
  })

  it('레벨마다 갈라 든 기술이 없으면 마지막 레벨에 붙는다', () => {
    expect(rewardSteps({ levels: [6, 7], learned: [33], pending: [45] })).toEqual([
      { step: { level: 6 }, learned: [], pending: [] },
      { step: { level: 7 }, learned: [33], pending: [45] },
    ])
  })

  it('레벨마다 갈라 들었으면 그 차례다', () => {
    const got = rewardSteps({
      levels: [{ level: 6, learned: [33] }, { level: 7, pending: [45] }], learned: [33], pending: [45],
    })
    expect(got.map((p) => [p.step?.level, p.learned, p.pending])).toEqual([[6, [33], []], [7, [], [45]]])
  })

  it('레벨이 안 올랐는데 기술이 있으면 레벨 없는 칸으로 남긴다', () => {
    expect(rewardSteps({ levels: [], learned: [33], pending: [] }))
      .toEqual([{ step: null, learned: [33], pending: [] }])
    expect(rewardSteps({ levels: [], learned: [], pending: [] })).toEqual([])
  })
})

describe('경험치 게이지 박자 (`Task_UpdateExpGauge`)', () => {
  it('막대는 프레임당 한 픽셀이고 소리 때문에 8프레임보다 짧지 않다', () => {
    // 96픽셀 — `HEALTHBOX_EXP_CELL_COUNT 12 × 8`
    expect(expGaugeFrames(0, 1)).toBe(96)
    expect(expGaugeFrames(0.5, 1)).toBe(48)
    expect(expGaugeFrames(0, 0.01)).toBe(8)
    expect(expGaugeFrames(0.3, 0.3)).toBe(8)
  })

  const panel = { before: stats(20, 10), after: stats(23, 12) }

  it('레벨을 넘으면 끝까지 차고 → 체력판 → 레벨 줄 → 능력치 창 → 빈 막대에서 남은 만큼', () => {
    const e: BattleEvent = {
      kind: 'reward', key: 'p1-0', exp: 160, learned: [], pending: [],
      levels: [{ level: 6, ...panel }], expFrom: 0.5, expTo: 0.25,
    }
    const beats = buildBeats([enter(FOE, 20), enter(MINE, 20), e], say).slice(4)
    expect(beats.map((b) => [b.text ?? b.events.map((x) => x.kind).join('+'), b.hold])).toEqual([
      // `GET_EXP_MSG_DELAY = 30 / 4` — 이 줄은 단추를 안 기다린다
      ['exp 160', 7],
      // 보상 사건이 게이지가 차기 **시작할 때** 접힌다 — 소리가 여기서 난다
      ['reward+expgauge', 0],
      ['expgauge', 48],
      // 체력판 번쩍임 11프레임 (`Healthbox_Task_LevelUpFlashAnimation`)
      ['levelup', 11],
      ['lv 6', 0],
      ['', 0],
      ['expgauge', 24],
    ])
    expect(beats[2]!.gauge).toBe(true)
    expect(beats[3]!.presentation).toBe(true)
    // 능력치 창은 누를 때까지 서는 박자에 붙는다
    expect(beats[5]).toMatchObject({ press: true, levelPanel: { key: 'p1-0', level: 6, ...panel } })
    // 화면은 레벨이 오른 체력판을 본다
    const view = beats.reduce<BattleView>((v, b) => applyEvents(v, b.events),
      applyEvents(emptyView(), [enter(FOE, 20), enter(MINE, 20)]))
    expect(view.active.p1a).toMatchObject({ level: 6, maxHp: 23, hp: 23, expProgress: 0.25 })
  })

  it('레벨의 기술은 그 레벨 뒤, 남은 게이지보다 앞이다 — 칸이 차 있으면 거기서 묻는다', () => {
    const e: BattleEvent = {
      kind: 'reward', key: 'p1-0', exp: 300, learned: [33], pending: [45],
      levels: [{ level: 6, learned: [33] }, { level: 7, pending: [45] }], expFrom: 0, expTo: 0.5,
    }
    const beats = buildBeats([enter(FOE, 20), enter(MINE, 20), e], say).slice(4)
    const order = beats.map((b) => b.ask ? `ask ${String(b.ask.move)}` : b.text ?? b.events.map((x) => x.kind).join('+'))
    expect(order).toEqual([
      'exp 300', 'reward+expgauge', 'expgauge', 'levelup', 'lv 6', 'learned 33',
      'expgauge', 'levelup', 'lv 7', 'wants 45', 'ask 45', 'expgauge',
    ])
  })

  it('무대에 없는 마리(학습장치)는 게이지도 번쩍임도 없이 글만 흐른다', () => {
    const e: BattleEvent = {
      kind: 'reward', key: 'p1-4', exp: 80, learned: [], pending: [],
      levels: [{ level: 6, ...panel }], expFrom: 0.5, expTo: 0.25,
    }
    const beats = buildBeats([enter(FOE, 20), enter(MINE, 20), e], say).slice(4)
    expect(beats.some((b) => b.gauge === true)).toBe(false)
    expect(beats.find((b) => b.events.some((x) => x.kind === 'levelup'))?.hold).toBe(0)
    // 능력치 창은 원작도 띄운다 (`BattleScript_LoadPartyLevelUpIcon`)
    expect(beats.some((b) => b.levelPanel !== undefined)).toBe(true)
  })

  it('막대 값을 모르는 사건은 예전 길이다 — 레벨만 체력판에 접힌다', () => {
    const beats = buildBeats([enter(FOE, 20), enter(MINE, 20), reward(160, [6, 7])], say).slice(4)
    expect(beats.some((b) => b.gauge === true || b.levelPanel !== undefined)).toBe(false)
    const view = beats.reduce<BattleView>((v, b) => applyEvents(v, b.events),
      applyEvents(emptyView(), [enter(FOE, 20), enter(MINE, 20)]))
    expect(view.active.p1a?.level).toBe(7)
  })
})

describe('판 도중 교체 (`LoadRecallMessage` · `LoadSendOutMessage`)', () => {
  const text = (events: BattleEvent[]) => buildBeats(events, say).map((b) => b.text).filter((t) => t !== null)
  const lead = [enter(FOE, 40), enter(MINE, 20)]

  it('앞 마리를 거두는 줄이 등판 줄보다 먼저다 — 그 사이 상대가 잃은 백분율로 고른다', () => {
    // 상대 40 중 30을 깎았다 → 75 → 「좋아! 돌아와!」 갈래. 등판은 남은 10/40 = 250 천분율
    const got = text([...lead, hurt(FOE, 10, 40), enter({ ...MINE, name: 'p1-1' }, 20)])
    expect(got.slice(-2)).toEqual(['recall p1-0 75', 'go p1-1 250'])
  })

  it('한 점도 못 깎았으면 0이다 — 「교대!」 갈래', () => {
    expect(text([...lead, enter({ ...MINE, name: 'p1-1' }, 20)]).slice(-2))
      .toEqual(['recall p1-0 0', 'go p1-1 1000'])
  })

  it('잰 값은 **누구든** 나올 때마다 다시 적는다', () => {
    // 상대가 바뀌면 새 상대의 체력이 기준이다 (`BtlCmd_SwitchAndUpdateMon`의 `hpTemp`)
    const got = text([...lead, enter({ ...FOE, name: 'p2-1' }, 30), hurt({ ...FOE, name: 'p2-1' }, 15, 30),
      enter({ ...MINE, name: 'p1-1' }, 20)])
    expect(got.slice(-2)).toEqual(['recall p1-0 50', 'go p1-1 500'])
  })

  it('쓰러진 자리와 끌려 나온 자리는 거두지 않는다', () => {
    const fainted = text([...lead, hurt(MINE, 0, 20), { kind: 'faint', actor: MINE },
      enter({ ...MINE, name: 'p1-1' }, 20)])
    expect(fainted.some((t) => t!.startsWith('recall'))).toBe(false)
    // 쓰러진 뒤의 등판도 상대 체력으로 고른다
    expect(fainted.at(-1)).toBe('go p1-1 1000')
    const dragged = text([...lead, enter({ ...MINE, name: 'p1-1' }, 20, 20, { forced: true })])
    expect(dragged.some((t) => t!.startsWith('recall'))).toBe(false)
    expect(dragged.at(-1)).toBe('go p1-1')
  })

  it('첫 등판에는 아무것도 안 싣는다 — `leadLines`가 그 사건을 정체성으로 찾는다', () => {
    const events = [...lead]
    const beats = buildBeats(events, say)
    const shown = beats.flatMap((b) => b.events).filter((e) => e.kind === 'switch')
    expect(shown).toEqual(events)
  })

  it('더블은 갈래가 없다 — 「돌아와!」 하나, 「가랏!」 하나', () => {
    const got = text([enter(FOE, 40), enter({ ...FOE, slot: 'p2b', name: 'p2-1' }, 40),
      ...[MINE, { ...MINE, slot: 'p1b' as const, name: 'p1-1' }].map((a) => enter(a, 20)),
      hurt(FOE, 10, 40), enter({ ...MINE, name: 'p1-2' }, 20)])
    expect(got.slice(-2)).toEqual(['recall p1-0 null', 'go p1-2'])
  })

  it('상대 트레이너가 바꾸면 그쪽도 거둔다', () => {
    const got = text([...lead, enter({ ...FOE, name: 'p2-1' }, 30)])
    expect(got.slice(-2)).toEqual(['recall p2-0 null', 'go p2-1'])
  })
})

describe('도구와 변신이 접히는 자리', () => {
  const base = applyEvents(emptyView(), [enter(FOE, 40), enter(MINE, 20)])

  it('변신은 따라 한 쪽의 종·폼·랭크를 입고 원래 종을 남긴다', () => {
    const foe = applyEvents(base, [
      { kind: 'form', actor: FOE, species: 413, speciesName: 'Wormadam-Sandy', form: 1 },
      { kind: 'boost', actor: FOE, stat: 'atk', amount: 2 },
    ])
    const view = applyEvent(foe, { kind: 'transform', actor: MINE, target: FOE })
    expect(view.active.p1a).toMatchObject({ species: 413, form: 1, baseSpecies: 387 })
    expect(view.active.p1a?.boosts.atk).toBe(2)
    // 교체하면 풀린다
    const back = applyEvent(view, enter(MINE, 20))
    expect(back.active.p1a?.baseSpecies).toBeUndefined()
    expect(back.active.p1a?.species).toBe(387)
  })

  it('하양허브는 내려간 랭크만 되돌린다', () => {
    const view = applyEvents(base, [
      { kind: 'boost', actor: MINE, stat: 'atk', amount: -2 },
      { kind: 'boost', actor: MINE, stat: 'spe', amount: 1 },
      { kind: 'clearnegativeboosts', actor: MINE },
    ])
    expect(view.active.p1a?.boosts).toMatchObject({ atk: 0, spe: 1 })
  })

  it('박자가 변신에 따라 한 쪽의 종을, 반감 열매에 막은 기술을 실어 준다', () => {
    const beats = buildBeats([
      enter(FOE, 40), enter(MINE, 20),
      { kind: 'move', actor: FOE, move: 33, moveName: 'Tackle', target: MINE, miss: false, from: null },
      {
        kind: 'enditem', actor: MINE, item: { id: 'occaberry', num: 184, name: 'Occa Berry' },
        from: null, of: null, how: 'weaken', silent: false,
      },
      { kind: 'transform', actor: FOE, target: MINE },
    ], say)
    const shown = beats.flatMap((b) => b.events)
    expect(shown.find((e) => e.kind === 'enditem')).toMatchObject({ move: 33 })
    expect(shown.find((e) => e.kind === 'transform')).toMatchObject({ species: 387, form: 0 })
  })

  it('열매를 먹은 다음 치료 줄에 그 열매를 붙이고, 둘 다 고쳤으면 한 줄로 몬다', () => {
    const lum = { id: 'lumberry', num: 157, name: 'Lum Berry' }
    const eat: BattleEvent = { kind: 'enditem', actor: MINE, item: lum, from: null, of: null, how: 'eat', silent: false }
    const cure: BattleEvent = { kind: 'curestatus', actor: MINE, status: 'par' }
    const conf: BattleEvent = {
      kind: 'volatile', actor: MINE, start: false, of: null,
      effect: { id: 'confusion', kind: 'other', num: null, name: 'confusion' },
      extra: { num: null, move: null, moveName: null },
    }
    const lines = (events: BattleEvent[]) => buildBeats([...events], say).map((b) => b.text).filter((t) => t !== null)
    expect(lines([enter(MINE, 20), eat, cure, conf]).slice(-2)).toEqual(['cure lumberry all', 'end lumberry all'])
    expect(lines([enter(MINE, 20), eat, cure]).at(-1)).toBe('cure lumberry')
    // 사이에 다른 사건이 끼면 잊는다 — 그 뒤의 치료는 열매와 상관없다
    expect(lines([enter(MINE, 20), eat, { kind: 'turn', turn: 2 }, cure]).at(-1)).toBe('cure -')
  })

  it('트릭은 쓴 쪽이 먼저 「손에 넣었다」 — 쇼다운은 맞은 쪽부터 낸다', () => {
    const item = (actor: Actor, id: string): BattleEvent => ({
      kind: 'item', actor, item: { id, num: null, name: id }, from: { kind: 'move', id: 271, name: 'Trick' }, of: null,
    })
    const got = buildBeats([enter(FOE, 40), enter(MINE, 20), item(FOE, 'choiceband'), item(MINE, 'leftovers')], say)
      .map((b) => b.text).filter((t) => t !== null)
    expect(got.slice(-2)).toEqual(['item p1-0 leftovers', 'item p2-0 choiceband'])
  })
})
