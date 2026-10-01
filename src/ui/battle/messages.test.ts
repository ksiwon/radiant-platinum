// 배틀 문구. 조사가 하나만 틀려도 화면에서 바로 보이는 종류의 버그라 문장을
// 통째로 못박는다 — 조각으로 검사하면 "찌르꼬이(가)"가 그대로 지나간다.
//
// ⚠️ **아래 절반은 롬의 글이다** (PARITY §2.24). 손으로 든 문장이 아니라
// `public/data/dialogue/ko/368.json`의 줄을 칸까지 채운 것이라, 자료가 없는
// 기계에서는 그 묶음이 통째로 빠진다 (`withData`).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { it, expect } from 'vitest'
import type {
  Actor, BattleEvent, BoostStat, Cause, EffectExtra, EffectRef, SafariBeat,
} from '../../engine/battle/events'
import type { Status } from '../../engine/pokemon/instance'
import { DATA, withData } from '../../data/romData.testkit'
import { parseLine, romItem } from '../../engine/battle/sim/protocol'
import {
  ACTIVATE_IDS, battleText, leadLines, learnResultLines, SINGLE_MOVE_IDS, SINGLE_TURN_IDS,
  type BattleNames, type TextContext,
} from './messages'
import { BATTLE_BANK, MOVE_BANK, STAT_BANK } from './romText'

const MINE: Actor = { slot: 'p1a', side: 'p1', name: 'p1-0' }
const FOE: Actor = { slot: 'p2a', side: 'p2', name: 'p2-0' }

const bankAt = (at: string): readonly string[] => {
  try {
    return JSON.parse(readFileSync(resolve(DATA, at), 'utf8')) as string[]
  } catch {
    return []
  }
}

const names: BattleNames = {
  species: [], // 이름은 label이 이미 풀어 준다
  moves: (() => { const m: string[] = []; m[33] = '몸통박치기'; m[73] = '씨뿌리기'; m[201] = '모래바람'; return m })(),
  abilities: (() => { const a: string[] = []; a[22] = '위협'; return a })(),
  items: (() => {
    const i: string[] = []
    i[23] = '회복약'; i[26] = '좋은상처약'
    // 도구가 일하는 줄 — 번호는 롬 도구 번호다 (`names/items.ko.json`)
    i[149] = '버치열매'; i[154] = '과사열매'; i[156] = '시몬열매'; i[157] = '리샘열매'
    i[158] = '자뭉열매'; i[184] = '오카열매'; i[201] = '치리열매'; i[207] = '스타열매'
    i[211] = '자보열매'; i[214] = '하양허브'; i[230] = '기합의머리띠'; i[234] = '먹다남은음식'
    i[270] = '생명의구슬'; i[272] = '맹독구슬'; i[275] = '기합의띠'
    return i
  })(),
  // 랭크 이름은 롬에서 온다 — 자리가 곧 이름이다
  stats: [...bankAt('dialogue/ko/' + String(STAT_BANK) + '.json')],
}

const BANK_AT = 'dialogue/ko/' + String(BATTLE_BANK) + '.json'
const MOVE_AT = 'dialogue/ko/' + String(MOVE_BANK) + '.json'
const withBank = withData(BANK_AT)

/** 롬의 배틀 글. 자료가 없으면 빈 배열이고, 그 줄들은 통째로 조용해진다 */
const lines = bankAt(BANK_AT)
/** 기술을 쓰는 줄만 든 뱅크 */
const moveLines = bankAt(MOVE_AT)

/**
 * 받침이 있는 이름(팬텀)과 없는 이름(모부기)을 일부러 섞는다.
 *
 * ⚠️ **「야생의」가 아니라 「야생 」이다.** 롬의 배틀 글 1,269줄에 「야생의」는
 * 0건이고 「야생 」이 344건이다 — 이름표가 롬의 말을 써야 맨 줄 하나로 세 자리를
 * 다 덮을 수 있다
 */
const ctx: TextContext = {
  names,
  lines,
  moveLines,
  label: (a) => (a.side === 'p1' ? '모부기' : '야생 팬텀'),
  // 야생 등판 줄은 「야생 」이 **문장에 박혀 있어서** 맨 이름을 넣는다
  bare: () => '팬텀',
}

const say = (e: BattleEvent) => battleText(e, ctx)

const damage = (actor: Actor, from: Cause | null = null): BattleEvent =>
  ({ kind: 'damage', actor, condition: { hp: 10, maxHp: 40, status: 'ok' }, from })

withBank('배틀 문구', () => {
  it('등판', () => {
    const enter = (actor: Actor, forced: boolean): BattleEvent => ({
      kind: 'switch', actor, species: 387, speciesName: 'Turtwig', level: 5,
      gender: 'male', shiny: false, condition: { hp: 20, maxHp: 20, status: 'ok' }, forced,
    })
    // ⚠️ 손으로 들 때는 「가라!」였다. 원작은 「가랏!」이다
    expect(say(enter(MINE, false))).toBe('가랏! 모부기!')
    // 받침 있는 이름에는 "이"가 붙어야 한다
    expect(say(enter(FOE, false))).toBe('앗! 야생 팬텀이 튀어나왔다!')
    expect(say(enter(FOE, true))).toBe('야생 팬텀은 배틀에\n끌려 나왔다!')
  })

  it('기술 줄은 롬이 통째로 든다', () => {
    // ⚠️ **이름과 기술을 우리가 붙이지 않는다.** 롬의 `moves_used_in_battle`이
    // 기술마다 한 줄을 들고 있고, 우리는 이름 빈칸 하나만 채운다 —
    // **이름 뒤에서 줄이 바뀌는 것**도 원작 것이다
    expect(say({
      kind: 'move', actor: MINE, move: 33, moveName: 'Tackle', target: FOE, miss: false, from: null,
    })).toBe('모부기의\n몸통박치기!')
    expect(say({
      kind: 'move', actor: FOE, move: 467, moveName: 'Shadow Force', target: MINE,
      miss: false, from: null,
    })).toBe('야생 팬텀의\n섀도다이브!')
  })

  it('모르는 기술 번호면 영어 원문으로 떨어진다', () => {
    // 빈칸이 뜨는 것보다 영어가 낫다. 여기는 조사가 뒤에 안 붙는 자리라
    // 병기형(「Tackle을(를)」)이 날 데가 없다
    expect(say({
      kind: 'move', actor: MINE, move: null, moveName: 'Tackle', target: FOE, miss: false, from: null,
    })).toBe('모부기의 Tackle!')
  })

  it('상성·급소·실패', () => {
    expect(say({ kind: 'effectiveness', actor: FOE, level: 'super' })).toBe('효과가 굉장했다!')
    expect(say({ kind: 'effectiveness', actor: FOE, level: 'resisted' })).toBe('효과가 별로인 듯하다')
    expect(say({ kind: 'effectiveness', actor: FOE, level: 'immune' }))
      .toBe('야생 팬텀에게는\n효과가 없는 것 같다...')
    expect(say({ kind: 'crit', actor: FOE })).toBe('급소에 맞았다!')
    expect(say({ kind: 'fail', actor: MINE })).toBe('그러나 실패하고 말았다!')
    expect(say({ kind: 'faint', actor: FOE })).toBe('야생 팬텀은 쓰러졌다!')
    expect(say({ kind: 'faint', actor: MINE })).toBe('모부기는 쓰러졌다!')
  })

  it('상태이상 여섯 가지가 전부 문장을 갖는다', () => {
    const all: Exclude<Status, 'ok'>[] = ['slp', 'psn', 'tox', 'brn', 'frz', 'par']
    for (const status of all) {
      const onset = say({ kind: 'status', actor: MINE, status })
      expect(onset, `${status} 걸림`).toBeTruthy()
      expect(onset!.startsWith('모부기'), `${status}: ${onset}`).toBe(true)
      const cured = say({ kind: 'curestatus', actor: MINE, status })
      expect(cured, `${status} 나음`).toBeTruthy()
      // 조사 병기형이 새어 나오면 안 된다
      expect(cured!.includes('('), `${status}: ${cured}`).toBe(false)
    }
    expect(say({ kind: 'status', actor: MINE, status: 'par' }))
      .toBe('모부기는 마비되어\n기술이 나오기 어려워졌다!')
    // ⚠️ **나은 줄은 상태마다 다르다.** 손으로 들 때는 한 틀이었는데 원작은 저마다 말한다
    expect(say({ kind: 'curestatus', actor: MINE, status: 'par' }))
      .toBe('모부기의\n마비가 풀렸다!')
    expect(say({ kind: 'curestatus', actor: MINE, status: 'slp' }))
      .toBe('모부기는\n눈을 떴다!')
  })

  it('랭크 일곱 가지가 전부 문장을 갖고 조사가 갈린다', () => {
    const all: BoostStat[] = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion']
    for (const stat of all) {
      const text = say({ kind: 'boost', actor: MINE, stat, amount: 1 })
      expect(text, stat).toBeTruthy()
      expect(text!.includes('('), `${stat}: ${text}`).toBe(false)
    }
    expect(say({ kind: 'boost', actor: MINE, stat: 'atk', amount: 1 }))
      .toBe('모부기의\n공격이 올라갔다!')
    // 방어는 받침이 없으므로 "가"
    expect(say({ kind: 'boost', actor: MINE, stat: 'def', amount: -1 }))
      .toBe('모부기의\n방어가 떨어졌다!')
    expect(say({ kind: 'boost', actor: MINE, stat: 'spe', amount: 2 }))
      .toBe('모부기의\n스피드가 크게 올라갔다!')
    expect(say({ kind: 'boost', actor: MINE, stat: 'atk', amount: -3 }))
      .toBe('모부기의\n공격이 크게 떨어졌다!')
  })

  it('못 움직인 이유', () => {
    expect(say({ kind: 'cant', actor: MINE, reason: 'par', move: null, moveName: '' }))
      .toBe('모부기는\n몸이 저려서 움직일 수 없다')
    expect(say({ kind: 'cant', actor: MINE, reason: 'flinch', move: null, moveName: '' }))
      .toBe('모부기는 풀이 죽어\n움직일 수 없었다!')
    // 도발은 **못 쓴 기술 이름**이 문장에 들어간다
    expect(say({
      kind: 'cant', actor: MINE, reason: 'move: Taunt', move: 33, moveName: 'Tackle',
    })).toBe('모부기는 도발당해서\n몸통박치기를 쓸 수 없다!')
    // ⚠️ **모르는 까닭은 조용하다.** 손으로 들 때는 「기술을 쓸 수 없다!」로
    // 때웠는데 그런 문장은 롬에 없다
    expect(say({ kind: 'cant', actor: MINE, reason: 'move: Imprison', move: null, moveName: '' }))
      .toBeNull()
  })

  it('기술 데미지는 말하지 않는다 — 바로 앞 줄이 이미 기술이다', () => {
    expect(say(damage(FOE))).toBeNull()
  })

  it('지속 데미지는 원인을 말한다', () => {
    expect(say(damage(MINE, { kind: 'status', id: null, name: 'psn' })))
      .toBe('모부기는\n독에 의한 데미지를 입고 있다!')
    expect(say(damage(MINE, { kind: 'status', id: null, name: 'brn' })))
      .toBe('모부기는\n화상 데미지를 입고 있다!')
    // 날씨는 **날씨 이름이 첫 칸**이다 — 롬은 그것도 기술 이름표에서 읽는다
    expect(say(damage(MINE, { kind: 'other', id: null, name: 'Sandstorm' })))
      .toBe('모래바람이 모부기를\n덮쳤다!')
    // 저만의 줄이 있는 기술은 그 줄로 간다
    expect(say(damage(MINE, { kind: 'move', id: 73, name: 'Leech Seed' })))
      .toBe('씨뿌리기가 모부기의\n체력을 빼앗는다!')
    // 없으면 두루 쓰는 줄이다
    expect(say(damage(MINE, { kind: 'move', id: 33, name: 'Tackle' })))
      .toBe('모부기는 몸통박치기의\n데미지를 입고 있다')
  })

  it('날씨는 시작·유지·그침을 저마다 다르게 말한다', () => {
    expect(say({ kind: 'weather', weather: 'Sandstorm', upkeep: false }))
      .toBe('모래바람이 불기 시작했다!')
    expect(say({ kind: 'weather', weather: 'Sandstorm', upkeep: true }))
      .toBe('모래바람이 세차게 분다')
    // 유지 줄은 매 턴 오므로 날씨가 없으면 아무 말도 안 한다
    expect(say({ kind: 'weather', weather: null, upkeep: true })).toBeNull()
  })

  it('그치는 줄은 그친 날씨를 알아야 나온다', () => {
    // `|-weather|none`은 무엇이 그쳤는지를 안 들고 온다. `buildBeats`가 직전
    // 뷰에서 읽어 `ended`로 실어 준 뒤라야 롬의 넷 중 하나를 고를 수 있다
    expect(say({ kind: 'weather', weather: null, upkeep: false })).toBeNull()
    expect(say({ kind: 'weather', weather: null, upkeep: false, ended: 'RainDance' }))
      .toBe('비가 그쳤다!')
    expect(say({ kind: 'weather', weather: null, upkeep: false, ended: 'Sandstorm' }))
      .toBe('모래바람이 가라앉았다!')
    expect(say({ kind: 'weather', weather: null, upkeep: false, ended: 'SunnyDay' }))
      .toBe('햇살이 약해졌다!')
    expect(say({ kind: 'weather', weather: null, upkeep: false, ended: 'Hail' }))
      .toBe('싸라기눈이 그쳤다!')
    // 모르는 이름이면 비운다 — 지어낸 문장을 놓느니 조용한 편이 낫다
    expect(say({ kind: 'weather', weather: null, upkeep: false, ended: 'Nothing' })).toBeNull()
  })

  it('특성 발동', () => {
    expect(say({ kind: 'ability', actor: FOE, ability: 22, abilityName: 'Intimidate' }))
      .toBe('야생 팬텀의 위협!')
  })

  it('문장이 없는 이벤트는 null이다', () => {
    // 텍스트 박스가 그냥 건너뛴다. 빈 줄이 쌓이면 안 된다
    expect(say({ kind: 'turn', turn: 3 })).toBeNull()
    expect(say({ kind: 'start' })).toBeNull()
    expect(say({ kind: 'other', cmd: '-hitcount', args: ['p2a: X', '3'] })).toBeNull()
  })
})

withBank('볼·도망·보상 — 프로토콜에 없는 사건들', () => {
  const ball = (shakes: number, caught: boolean): BattleEvent =>
    ({ kind: 'ball', actor: FOE, ball: 4, shakes, caught })

  it('잡히면 이름에 목적격 조사가 붙는다', () => {
    expect(say(ball(4, true))).toBe('신난다-!\n야생 팬텀을 붙잡았다!')
  })

  it('흔들린 횟수마다 말이 다르다', () => {
    // 롬은 863부터 넷을 차례로 들고 있다 — 자리가 곧 아까움의 크기다
    const texts = [0, 1, 2, 3].map((n) => say(ball(n, false)))
    expect(new Set(texts).size, '전부 같은 문장이면 흔들림을 세는 의미가 없다').toBe(4)
    expect(texts[0]).toBe('안돼! 포켓몬이\n볼에서 나와버렸다!')
    expect(texts[3]).toBe('아깝다!\n조금만 더하면 됐는데!')
  })

  it('도망', () => {
    expect(say({ kind: 'escape', success: true })).toBe('무사히 도망쳤다!')
    expect(say({ kind: 'escape', success: false })).toBe('도망칠 수 없다!')
  })

  it('경험치와 레벨업과 새 기술이 한 덩어리로 나온다 — 레벨마다 한 줄', () => {
    // ⚠️ **오른 레벨마다 말한다.** 원작은 레벨마다 「레벨 N으로 올랐다!」를 찍고 다음
    // 레벨로 간다 (`SEQ_GET_EXP_CHECK_LEARN_MOVE` → `SEQ_GET_EXP_GAUGE`). 한동안 마지막
    // 하나만 말해서 5→8이면 6·7이 사라졌다
    const text = say({
      kind: 'reward', key: 'p1-0', exp: 160, levels: [6, 7], learned: [33], pending: [],
    })
    expect(text).toBe(
      '모부기는\n160 경험치를 얻었다!\n\n'
      + '모부기는\n레벨6으로 올랐다!\n\n'
      + '모부기는\n레벨7로 올랐다!\n\n'
      + '모부기는\n몸통박치기를 배웠다!',
    )
  })

  it('레벨마다 갈라 든 기술은 그 레벨 줄 뒤에 온다', () => {
    // 6에 배운 기술은 7보다 먼저다 — 원작이 레벨마다 기술 차례를 다 본 뒤 게이지를 다시 채운다
    const text = say({
      kind: 'reward', key: 'p1-0', exp: 160,
      levels: [{ level: 6, learned: [33] }, { level: 7, learned: [] }], learned: [33], pending: [],
    })
    expect(text!.split('\n\n').map((p) => p.replace('\n', ' '))).toEqual([
      '모부기는 160 경험치를 얻었다!',
      '모부기는 레벨6으로 올랐다!',
      '모부기는 몸통박치기를 배웠다!',
      '모부기는 레벨7로 올랐다!',
    ])
  })

  it('칸이 차서 못 배운 기술은 다르게 말한다', () => {
    // "배웠다"와 "배우고 싶어 한다"가 같은 문장이면 플레이어가 뭘 해야 하는지 모른다
    const text = say({
      kind: 'reward', key: 'p1-0', exp: 10, levels: [7], learned: [], pending: [33],
    })
    expect(text).toContain('몸통박치기를 배우고 싶다')
    expect(text).not.toContain('배웠다')
    // 그 뒤에 「그러나 … 기술을 4개 알고 있으므로」가 **다른 창**으로 온다 — 묻는 창은 그 다음이다
    // (`SEQ_GET_EXP_WANTS_TO_LEARN_MOVE_PRINT` → `SEQ_GET_EXP_CANT_LEARN_MORE_MOVES_PRINT`)
    expect(text!.split('\n\n').at(-1)).toBe('그러나 모부기는 기술을 4개\n알고 있으므로 더 이상 배울 수 없다!')
  })

  it('레벨이 안 올랐으면 경험치 줄만 나온다', () => {
    expect(say({ kind: 'reward', key: 'p1-0', exp: 12, levels: [], learned: [], pending: [] }))
      .toBe('모부기는\n12 경험치를 얻었다!')
  })

  it('상금 줄', () => {
    // 롬은 주인공을 부르고 **원**으로 센다 — 「엔」은 우리가 적어 둔 것이었다
    expect(battleText({ kind: 'prize', money: 4920 }, { ...ctx, playerName: '빛나' }))
      .toBe('빛나는 상금으로\n4920원을 손에 넣었다!')
  })

  it('말을 안 들으면 갈래마다 다른 줄이 나온다 (PARITY §2.18)', () => {
    // 넷이 같은 문장이면 "왜 내 명령이 안 먹었는가"를 화면에서 알 길이 없다
    expect(say({ kind: 'disobey', actor: MINE, reason: 'otherMove' }))
      .toBe('모부기는 명령을 무시했다!')
    expect(say({ kind: 'disobey', actor: MINE, reason: 'ignoredAsleep' }))
      .toBe('모부기는 잠든 채로\n명령을 무시했다!')
    expect(say({ kind: 'disobey', actor: MINE, reason: 'nap' }))
      .toBe('모부기는 낮잠을 자기 시작했다!')
    expect(say({ kind: 'disobey', actor: MINE, reason: 'hitSelf' }))
      // 창이 둘이다 — 롬도 두 줄을 따로 띄운다. 빈 줄이 그 표시다
      .toBe('모부기는 말을 듣지 않는다!\n\n영문도 모른 채\n자신을 공격했다!')
  })

  it('아무것도 안 한 마디는 넷이고 서로 다르다', () => {
    const said = [0, 1, 2, 3].map((flavor) =>
      say({ kind: 'disobey', actor: MINE, reason: 'nothing', flavor }))
    expect(new Set(said).size).toBe(4)
    // 롬은 828부터 넷을 나란히 들고 있다 — 자리가 곧 뽑은 값이다
    expect(said[0]).toBe('모부기는 게으름을 피우고 있다!')
    expect(said[3]).toBe('모부기는 모른 체했다!')
  })
  it('사파리 일곱 마디 (PARITY §2.19)', () => {
    // ⚠️ **「먹느라 정신이 없다」가 이득 본 판이다.** 뒤집혀 있으면 화면만
    // 보고는 미끼가 좋은지 나쁜지를 영영 못 가린다
    const beat = (b: SafariBeat) =>
      say({ kind: 'safari', actor: FOE, beat: b })
    const me: TextContext = { ...ctx, playerName: '빛나' }
    expect(battleText({ kind: 'safari', actor: FOE, beat: 'bait' }, me))
      .toBe('빛나는\n팬텀에게 먹이를 던졌다!')
    expect(beat('eating')).toBe('팬텀은\n먹이를 먹고 있다!')
    expect(beat('busyEating')).toBe('팬텀은\n먹이를 먹는데 푹 빠졌다!')
    expect(battleText({ kind: 'safari', actor: FOE, beat: 'mud' }, me))
      .toBe('빛나는\n팬텀에게 진흙을 던졌다!')
    expect(beat('angry')).toBe('팬텀은\n화내고 있다!')
    expect(beat('veryAngry')).toBe('팬텀은\n분노로 이성을 잃었다!')
    expect(beat('watching')).toBe('팬텀은\n상황을 살피고 있다!')
  })
})

// ── 글만 내는 열둘 (PARITY §2.24) ─────────────────────────────────────────────
//
// 판마다 3.7줄이 여기로 흘러 화면이 조용했다.
//
// ⚠️ **이 아래는 롬의 글을 그대로 못박는다.** 손으로 든 문장이 아니라
// `public/data/dialogue/ko/368.json`의 줄이라, 여기 적힌 한국어는 **원작의
// 한국어**다. 번호가 어느 줄인지는 `romText.test.ts`가 따로 잰다 — 여기서 재는
// 것은 「그 줄이 칸까지 채워져 화면 문장이 되는가」다.

const NO_EXTRA: EffectExtra = { num: null, move: null, moveName: null }

/** `move: Protect` → 효과 하나. `sim/protocol`의 `effectRef`와 같은 모양이다 */
const eff = (id: string, kind: EffectRef['kind'] = 'move', num: number | null = null): EffectRef =>
  ({ id, kind, num, name: id })

/** 표에서 도구가 일하는 효과 — 빈칸에 도구 이름이 들어간다 */
const ITEM_EFFECTS = new Set(['focusband', 'leppaberry'])

const activate = (
  id: string,
  o: { actor?: Actor | null; of?: Actor | null; extra?: EffectExtra; kind?: EffectRef['kind'] } = {},
): BattleEvent => ({
  kind: 'activate',
  actor: o.actor === undefined ? MINE : o.actor,
  effect: eff(id, o.kind),
  of: o.of ?? null,
  extra: o.extra ?? NO_EXTRA,
})

withBank('롬의 배틀 글 (PARITY §2.24)', () => {
  it('방어는 쓰는 줄과 막는 줄이 다르다', () => {
    // 원작도 둘을 따로 찍는다. 하나로 합치면 "몸을 지켰다"가 쓰자마자 뜬다
    expect(say({ kind: 'singleturn', actor: MINE, effect: eff('protect', 'other'), of: null }))
      .toBe('모부기는\n방어 태세에 들어갔다!')
    expect(say(activate('protect'))).toBe('모부기는 공격으로부터\n몸을 지켰다!')
    // sim이 낸 `-activate`가 `-block`으로 도착해도 같은 문장이어야 한다
    expect(say({
      kind: 'block', actor: MINE, effect: eff('protect'), of: null, extra: NO_EXTRA,
    })).toBe('모부기는 공격으로부터\n몸을 지켰다!')
  })

  it('모으는 기술 아홉이 저마다 한 줄을 갖는다', () => {
    const prepare = (moveName: string): BattleEvent =>
      ({ kind: 'prepare', actor: FOE, move: null, moveName, target: MINE })
    expect(say(prepare('Fly'))).toBe('야생 팬텀은\n하늘 높이 날아올랐다!')
    expect(say(prepare('Solar Beam'))).toBe('야생 팬텀은\n빛을 흡수했다!')
    // 접기가 이름 그대로가 아니다 — 빈칸과 대소문자를 지우고 찾는다
    expect(say(prepare('Shadow Force'))).toBe('야생 팬텀의 모습이\n일순간에 사라졌다!')
    // ⚠️ 손으로 들 때는 「땅속으로 파고들었다!」였다. 롬은 앞에 한 마디가 더 있다
    expect(say(prepare('Dig'))).toBe('야생 팬텀은\n구멍을 파서 땅속에 파고들었다!')
    // 그리고 로케트박치기는 「머리」가 아니라 「목」이다
    expect(say(prepare('Skull Bash'))).toBe('야생 팬텀은\n목을 움츠렸다!')
    const nine = ['Fly', 'Dig', 'Dive', 'Bounce', 'Razor Wind', 'Skull Bash',
      'Sky Attack', 'Solar Beam', 'Shadow Force']
    const lines = nine.map((m) => say(prepare(m)))
    expect(lines.every((l) => l !== null)).toBe(true)
    // 아홉이 서로 다른 문장이어야 한다 — 같으면 무엇을 모으는지 화면에서 안 보인다
    expect(new Set(lines).size).toBe(9)
    // 모으는 기술이 아닌 것은 조용하다
    expect(say(prepare('Tackle'))).toBeNull()
  })

  it('수를 그대로 옮기는 줄', () => {
    expect(say({ kind: 'hitcount', actor: FOE, count: 3 })).toBe('3번 맞았다!')
    expect(say({ kind: 'hitcount', actor: FOE, count: 1 })).toBe('1번 맞았다!')
    expect(say({ kind: 'notarget', actor: FOE })).toBe('그러나 상대가 없으므로\n실패하고 말았다!')
    expect(say({ kind: 'ohko' })).toBe('일격필살!')
    // 매그니튜드는 굴린 수가 `[number]`로 온다. 못 받으면 조용하다.
    // ⚠️ 느낌표가 **둘**이다 — 손으로 들 때는 하나였다
    expect(say(activate('magnitude', { extra: { ...NO_EXTRA, num: 7 } })))
      .toBe('매그니튜드 7!!')
    expect(say(activate('magnitude'))).toBeNull()
  })

  it('자리가 비어 오는 줄도 문장이 된다', () => {
    // 튀어오르기는 `|-activate||move: Splash`로 온다 — 자리가 없다
    expect(say(activate('splash', { actor: null }))).toBe('그러나 아무 일도 일어나지 않았다')
    expect(say({ kind: 'fieldactivate', effect: eff('perishsong') }))
      .toBe('멸망의노래를 들은 포켓몬은\n3턴 후에 쓰러져 버린다!')
    expect(say({ kind: 'fieldactivate', effect: eff('payday') })).toBe('돈이 주위에 흩어졌다!')
  })

  it('[of]가 가리키는 쪽이 문장에 들어간다', () => {
    // 도우미는 **자리가 뒤집혀 있다** — 자리가 도움을 받는 쪽이고, 롬의 첫 칸은
    // 돕는 쪽이라 둘을 바꿔 넣는다
    expect(say({
      kind: 'singleturn', actor: MINE, effect: eff('helpinghand', 'other'), of: FOE,
    })).toBe('야생 팬텀은 모부기에게\n도우미가 되어주려 한다!')
    expect(say(activate('attract', { of: FOE })))
      .toBe('모부기는\n야생 팬텀에게 헤롱헤롱해 있다!')
    // 롬이 「…로/으로」를 부호로 고른다 — 모부기는 받침이 없으므로 「로」다
    expect(say(activate('lockon', { actor: FOE, of: MINE })))
      .toBe('야생 팬텀은 목표를\n모부기로 결정했다!')
  })

  it('베낀 기술은 한국어 이름으로 나온다', () => {
    expect(say(activate('sketch', { extra: { num: null, move: 33, moveName: 'Tackle' } })))
      .toBe('모부기는\n몸통박치기를 스케치했다!')
    // ⚠️ **번호를 못 찾으면 조용하다.** 다른 자리처럼 영어로 떨어뜨리면 뒤에
    // 조사가 붙어 「Tackle을(를) 스케치했다!」가 화면에 뜬다
    expect(say(activate('sketch', { extra: { num: null, move: null, moveName: 'Tackle' } })))
      .toBeNull()
    // 기술 이름을 아예 못 받아도 조용하다
    expect(say(activate('sketch'))).toBeNull()
  })

  it('파티 전체와 특성이 걷히는 줄', () => {
    expect(say({ kind: 'cureteam', actor: MINE, from: null })).toBe('기분 좋은 향기가 퍼졌다!')
    expect(say({ kind: 'endability', actor: FOE, ability: null, abilityName: '' }))
      .toBe('야생 팬텀은\n특성이 없어졌다!')
  })

  it('길동무는 거는 줄만 글이 있다', () => {
    expect(say({ kind: 'singlemove', actor: MINE, effect: eff('destinybond', 'other') }))
      .toBe('모부기는 상대를\n길동무로 삼으려 하고 있다')
    // ⚠️ **걸린 줄은 비어 있다.** 롬의 그 줄은 이름을 둘 부르는데
    // (「건 쪽는 끌려간 쪽를 길동무로 삼았다!」) sim은 -activate에 자리를 하나만
    // 준다 — 반쪽만 채운 문장을 놓느니 비운다
    expect(say(activate('destinybond'))).toBeNull()
  })

  it('표에 놓은 줄은 빈칸이 하나도 안 남는다', () => {
    // ⚠️ **빈칸이 남으면 화면에 제어 부호가 글자로 뜬다** — 실제로 그렇게 떴다.
    // 이름을 둘 다 주고 표를 통째로 돌려 여는 중괄호가 남는 줄이 없는지 본다
    const both = { of: FOE, extra: { num: 7, move: 33, moveName: 'Tackle' } }
    const lines: (readonly [string, string | null])[] = [
      // 도구가 일한 줄은 도구 이름이 빈칸이다 — 도구 번호를 실어 준다
      ...ACTIVATE_IDS.map((id) => [id, say(ITEM_EFFECTS.has(id)
        ? { ...activate(id, both), effect: eff(id, 'item', 26) } as BattleEvent
        : activate(id, both))] as const),
      ...SINGLE_TURN_IDS.map((id) => [id, say({
        kind: 'singleturn', actor: MINE, effect: eff(id, 'other'), of: FOE,
      })] as const),
      ...SINGLE_MOVE_IDS.map((id) => [id, say({
        kind: 'singlemove', actor: MINE, effect: eff(id, 'other'),
      })] as const),
    ]
    // 표에 있는 것은 다 문장이 된다 — 자리가 모자라 못 놓는 길동무는 애초에
    // 표에 없다 (바로 위 시험이 그 자리가 비는 것을 따로 못박는다)
    expect(lines.filter(([, l]) => l === null).map(([id]) => id)).toEqual([])
    expect(lines.filter(([, l]) => l !== null && l.includes('{')).map(([id]) => id)).toEqual([])
  })

  it('글이 없는 효과는 조용하되 특성은 배너로 떨어진다', () => {
    // 원작은 특성이 일한 자리에서 특성 이름을 먼저 띄운다 — -ability 줄과 같은
    // 문장이라 지어낸 것이 아니다
    expect(say(activate('intimidate', { kind: 'ability' })))
      .toBe('모부기의 intimidate!')
    expect(say({
      kind: 'activate',
      actor: MINE,
      effect: { id: 'intimidate', kind: 'ability', num: 22, name: 'Intimidate' },
      of: null,
      extra: NO_EXTRA,
    })).toBe('모부기의 위협!')
    // 기술은 이렇게 못 한다 — "모부기의 추격!"은 기술을 **쓴** 줄의 문장이다
    expect(say(activate('pursuit'))).toBeNull()
    // ⚠️ 선제공격손톱은 **원작이 말하지 않는다.** `subscript_check_quick_claw`가 손톱이면
    // 연출만 틀고, 「행동이 빨라졌다!」는 애슈열매 갈래에서만 찍는다. 손으로 들 때 지어냈던 자리다
    expect(say(activate('quickclaw', { kind: 'item' }))).toBeNull()
  })

  it('원작에 없는 줄에는 글을 안 놓는다', () => {
    // 다음 턴에 「움직일 수 없다!」를 찍는 것은 cant의 recharge다
    expect(say({ kind: 'mustrecharge', actor: MINE })).toBeNull()
    expect(say({ kind: 'cant', actor: MINE, reason: 'recharge', move: null, moveName: '' })).toBe('공격의 반동으로\n모부기는 움직일 수 없다!')
    // 쇼다운이 사람에게 규칙을 설명하는 줄
    expect(say({ kind: 'hint', text: 'Some effects can force a Pokemon…' })).toBeNull()
  })
})

// ── 트레이너를 **두 칸으로** 받는 줄 (PARITY §2.24) ─────────────────────────
//
// 롬은 분류(「체육관 관장」)와 이름(「동관」)을 따로 받는다. 우리가 한동안
// 「체육관 관장 동관」으로 합쳐 들고 있어서 이 줄들만 손 글이었다.
withBank('트레이너 줄', () => {
  /** 분류와 이름을 가진 상대. 실제 트레이너전의 자리다 */
  const vs: TextContext = {
    ...ctx,
    label: (a) => (a.side === 'p1' ? '모부기' : '상대 팬텀'),
    foeName: '체육관 관장 동관',
    foeClass: '체육관 관장',
    foeTrainer: '동관',
  }
  /** 분류가 없는 상대 — 통신과 배틀팩토리가 이렇다 */
  const link: TextContext = { ...vs, foeClass: null, foeTrainer: null }

  const enter: BattleEvent = {
    kind: 'switch', actor: FOE, species: 94, speciesName: 'Gengar', level: 5,
    gender: 'male', shiny: false, condition: { hp: 20, maxHp: 20, status: 'ok' }, forced: false,
  }

  it('트레이너가 내보내면 「야생」이 아니다', () => {
    // ⚠️ **한동안 상대 쪽 교체가 전부 야생 줄로 떨어졌다** — 체육관 관장이
    // 내보내도 「앗! 야생 팬텀이 튀어나왔다!」가 떴다
    expect(battleText(enter, vs)).toBe('체육관 관장 동관은\n팬텀을 내보냈다!')
    // 분류가 없으면 이름 한 칸짜리 짝으로 떨어진다
    expect(battleText(enter, link)).toBe('체육관 관장 동관은\n팬텀을 내보냈다!')
    // 이름조차 없으면 야생 줄이다 (야생전이 그렇다)
    expect(battleText(enter, ctx)).toBe('앗! 야생 팬텀이 튀어나왔다!')
  })

  it('도구를 쓰면 분류와 이름이 갈려 들어간다', () => {
    const used: BattleEvent = { kind: 'trainerItem', key: 'p2-0', item: 26 }
    expect(battleText(used, vs)).toBe('체육관 관장 동관은\n좋은상처약을 썼다!')
    // ⚠️ **이 줄만은 이름 한 칸짜리 짝이 롬에 없다.** 그래서 우리 말로 떨어진다
    expect(battleText(used, link)).toBe('체육관 관장 동관은 좋은상처약을 썼다!')
  })

  it('시합규칙 교체는 물음까지 한 줄이다', () => {
    // 끝의 `{SCREEN 0}`이 예/아니오 창을 여는 부호다. 화면에는 안 남는다
    expect(battleText({ kind: 'shift', key: 'p2-0' }, vs))
      .toBe('체육관 관장 동관은\n팬텀을 내보내려 하고 있다\n포켓몬을 교체하시겠습니까?')
    expect(battleText({ kind: 'shift', key: 'p2-0' }, vs)).not.toContain('{')
  })

  it('비긴 판은 상대를 알 때만 롬 줄로 간다', () => {
    // ⚠️ **롬이 비긴 판을 말하는 자리는 통신뿐이다** — `LoadResultMessage`가
    // `BATTLE_RESULT_DRAW`를 통신에서만 읽어서 이름 칸이 하나다. 분류·이름
    // 두 칸짜리 짝(961)은 어느 스크립트도 안 가리키므로 안 쓴다
    expect(battleText({ kind: 'tie' }, vs)).toBe('체육관 관장 동관과의\n승부에서 비겼다!')
    expect(battleText({ kind: 'tie' }, link)).toBe('체육관 관장 동관과의\n승부에서 비겼다!')
    // 부를 이름이 없으면 우리 한 줄이다 — 야생전이 그렇다
    expect(battleText({ kind: 'tie' }, ctx)).toBe('무승부다!')
  })
})

// ── 트레이너가 둘 이상인 판 (PARITY §2.2b) ────────────────────────────────────
withBank('첫 등판 한 창 (`leadLines`)', () => {
  const enter = (slot: Actor['slot'], name: string): BattleEvent => ({
    kind: 'switch', actor: { slot, side: slot.startsWith('p1') ? 'p1' : 'p2', name },
    species: 387, speciesName: 'Turtwig', level: 5, gender: 'male', shiny: false,
    condition: { hp: 20, maxHp: 20, status: 'ok' }, forced: false,
  })
  /** 이름 → 트레이너. 키 앞머리가 주인이다 (`aftermath.ownerOfKey`) */
  const trainers: Record<string, { cls: string; name: string }> = {
    p2: { cls: '갤럭시단', name: '마스' },
    p4: { cls: '갤럭시단', name: '쥬피터' },
  }
  const multi: TextContext = {
    ...ctx,
    label: (a) => (a.side === 'p1' ? '모부기' : '상대 팬텀'),
    bare: (key) => (key.startsWith('p3') ? '엠페르트' : key.startsWith('p1') ? '모부기' : '팬텀'),
    trainerOf: (key) => trainers[key.slice(0, 2)] ?? null,
  }

  it('트레이너 둘 — 두 사람이 한 창에서 저마다 내보내고, 편이 먼저 「가랏!」을 잇는다', () => {
    const events: BattleEvent[] = [
      { kind: 'start' },
      enter('p2a', 'p2-0'), enter('p2b', 'p4-0'), enter('p1b', 'p3-0'), enter('p1a', 'p1-0'),
    ]
    const got = leadLines(events, multi, { trainer: true, partner: { cls: '포켓몬 트레이너', name: '라이벌' } })
    // 줄은 **뒤 사건에** 싣는다 — 둘이 다 선 뒤에 한 창이 뜬다 (등판은 몸이 먼저 · 사용자 결정)
    const foe = got.get(events[2]!)!
    // 롬 991번 — 「{분류1} {이름1}은 {포켓몬1}을 내보냈다! / {분류2} {이름2}는 …」
    expect(foe).toContain('마스')
    expect(foe).toContain('쥬피터')
    expect(got.get(events[1]!)).toBeNull()
    // 롬 993번 — 편이 첫 칸이고 내 마리가 「가랏!」 뒤다
    const ours = got.get(events[4]!)!
    expect(ours).toContain('라이벌')
    expect(ours).toContain('엠페르트')
    expect(ours).toContain('가랏! 모부기!')
    expect(got.get(events[3]!)).toBeNull()
  })

  it('⚠️ 분류와 이름이 같은 조무래기 둘도 991이다 — 주인이 다르면 트레이너 둘이다', () => {
    const grunts: TextContext = { ...multi, trainerOf: () => ({ cls: '갤럭시단', name: '조무래기' }) }
    const events: BattleEvent[] = [
      { kind: 'start' },
      enter('p2a', 'p2-0'), enter('p2b', 'p4-0'), enter('p1a', 'p1-0'), enter('p1b', 'p1-1'),
    ]
    const got = leadLines(events, grunts, { trainer: true, partner: null })
    const tag = leadLines(events, multi, { trainer: true, partner: null }).get(events[2]!)!
    const line = got.get(events[2]!)!
    // 991은 이름 칸이 둘이다 — 「조무래기」가 두 번 나온다. 973은 한 번이다
    expect(line.split('조무래기').length - 1).toBe(2)
    // 같은 틀(991)이다 — 이름만 바뀐다
    expect(line.replaceAll('조무래기', 'X')).toBe(tag.replace('마스', 'X').replace('쥬피터', 'X'))
  })

  it('한 사람의 더블은 「{둘}을 내보냈다」 한 줄, 내 둘은 「가랏! {하나}! {둘}!」이다', () => {
    const one: TextContext = { ...multi, trainerOf: () => ({ cls: '쌍둥이', name: '이향&미향' }) }
    const events: BattleEvent[] = [
      { kind: 'start' },
      enter('p2a', 'p2-0'), enter('p2b', 'p2-1'), enter('p1a', 'p1-0'), enter('p1b', 'p1-1'),
    ]
    const got = leadLines(events, one, { trainer: true, partner: null })
    expect(got.get(events[2]!)).toContain('이향&미향')
    expect(got.get(events[1]!)).toBeNull()
    expect(got.get(events[4]!)).toBe('가랏! 모부기! 모부기!')
    expect(got.get(events[3]!)).toBeNull()
  })

  it('야생 둘은 **둘이 선 뒤에** 글이 뜬다 — 줄을 뒤 사건에 싣는다', () => {
    const events: BattleEvent[] = [{ kind: 'start' }, enter('p2a', 'p2-0'), enter('p2b', 'p2-1')]
    const got = leadLines(events, multi, { trainer: false, partner: null })
    expect(got.get(events[1]!)).toBeNull()
    expect(got.get(events[2]!)).toContain('튀어나왔다')
  })

  it('싱글은 손대지 않는다', () => {
    const events: BattleEvent[] = [{ kind: 'start' }, enter('p2a', 'p2-0'), enter('p1a', 'p1-0')]
    expect(leadLines(events, multi, { trainer: true, partner: null }).size).toBe(0)
  })

  it('중간 교체는 **그 마리의 트레이너** 이름으로 부른다', () => {
    const line = battleText(enter('p2b', 'p4-1'), multi)
    expect(line).toContain('쥬피터')
    expect(line).not.toContain('마스')
  })
})

// ── 판 도중 교체 (`battle_display.c` `LoadSendOutMessage` · `LoadRecallMessage`) ──────────
withBank('판 도중 교체의 두 줄', () => {
  const enter = (actor: Actor, foeHpPermille?: number): BattleEvent => ({
    kind: 'switch', actor, species: 387, speciesName: 'Turtwig', level: 5, gender: 'male', shiny: false,
    condition: { hp: 20, maxHp: 20, status: 'ok' }, forced: false,
    ...(foeHpPermille === undefined ? {} : { foeHpPermille }),
  })

  it('싱글 판 도중 「가랏!」은 상대 체력 천분율로 다섯 갈래다', () => {
    // 경계값은 원작 그대로 — 100 · 325 · 550 · 775 미만 (`hpPercent`는 실제로 천분율이다)
    expect(say(enter(MINE, 99))).toBe('상대가 약해져 있어!\n기회다! 모부기!')
    expect(say(enter(MINE, 100))).toBe('앞으로 조금이야!\n힘내! 모부기!')
    expect(say(enter(MINE, 324))).toBe('앞으로 조금이야!\n힘내! 모부기!')
    expect(say(enter(MINE, 549))).toBe('힘내! 모부기!')
    expect(say(enter(MINE, 774))).toBe('널 믿어! 모부기!')
    expect(say(enter(MINE, 775))).toBe('가랏! 모부기!')
    // 상대가 쓰러져 0이면 원작이 1000으로 친다 — 박자가 그 값을 싣는다
    expect(say(enter(MINE, 1000))).toBe('가랏! 모부기!')
    // 값이 없으면(첫 등판·더블) 늘 「가랏!」이다
    expect(say(enter(MINE))).toBe('가랏! 모부기!')
  })

  it('우리 쪽 「돌아와!」는 그 마리가 나온 뒤 상대가 잃은 몫으로 다섯 갈래다', () => {
    // ⚠️ **앞 마리의 체력이 아니다** — `(hpTemp - curHP) * 100 / hpTemp`
    const recall = (percent: number | null): BattleEvent => ({ kind: 'recall', actor: MINE, percent })
    expect(say(recall(0))).toBe('모부기 교대!\n돌아와!')
    expect(say(recall(24))).toBe('모부기\n돌아와!')
    expect(say(recall(25))).toBe('모부기 잘했어!\n돌아와!')
    expect(say(recall(50))).toBe('모부기 좋았어!\n돌아와!')
    expect(say(recall(75))).toBe('모부기 좋아!\n돌아와!')
    // 더블은 갈래 없이 하나다
    expect(say(recall(null))).toBe('모부기\n돌아와!')
  })

  it('상대 트레이너는 「넣어버렸다」로 거둔다', () => {
    const vs: TextContext = {
      ...ctx, label: (a) => (a.side === 'p1' ? '모부기' : '상대 팬텀'),
      foeName: '체육관 관장 동관', foeClass: '체육관 관장', foeTrainer: '동관',
    }
    const recall: BattleEvent = { kind: 'recall', actor: FOE, percent: null }
    expect(battleText(recall, vs)).toBe('체육관 관장 동관은\n팬텀을 넣어버렸다!')
    // 분류가 없는 상대는 이름 한 칸짜리 짝이다
    expect(battleText(recall, { ...vs, foeClass: null, foeTrainer: null }))
      .toBe('체육관 관장 동관은\n팬텀을 넣어버렸다!')
  })
})

// ── 기술을 잊고 배운 뒤 (`SEQ_GET_EXP_ONE_TWO_POOF` 이후) ───────────────────────────
withBank('기술을 잊고 배운 뒤의 줄', () => {
  it('잊으면 넷이 차례로 온다', () => {
    const got = learnResultLines(lines, { who: '모부기', forgot: '몸통박치기', learned: '씨뿌리기' })
    expect(got).toHaveLength(4)
    // `{PAUSE}`·`{CALLBACK}`은 글자로 안 남는다
    expect(got[0]).toMatch(/^1, 2 .*짠!$/)
    expect(got[0]).not.toContain('{')
    expect(got.slice(1)).toEqual([
      '모부기는 몸통박치기를\n깨끗이 잊었다!',
      '그리고!',
      '모부기는 새로\n씨뿌리기를 배웠다!',
    ])
  })

  it('포기하면 한 줄이다', () => {
    expect(learnResultLines(lines, { who: '모부기', declined: '씨뿌리기' }))
      .toEqual(['모부기는 씨뿌리기를\n결국 배우지 않았다!'])
  })

  it('뱅크가 없으면 아무 줄도 안 낸다 — 반쪽 문장을 놓지 않는다', () => {
    expect(learnResultLines([], { who: '모부기', declined: '씨뿌리기' })).toEqual([])
  })
})

// ── 도구와 변신 (PARITY §2.24) ─────────────────────────────────────────────────
//
// 한동안 이 줄들이 `other`로 흘러서 열매를 먹어도 기합의띠로 버텨도 화면이 한 마디도
// 안 했다. 프로토콜 줄을 그대로 넣어 **모양과 글을 한 번에** 잰다
withBank('도구와 변신', () => {
  const line = (raw: string): string | null => {
    const e = parseLine(raw)
    expect(e, raw).not.toBeNull()
    expect(e!.kind, raw).not.toBe('other')
    return say(e!)
  }

  it('도구 이름은 롬 번호로 되짚는다', () => {
    // 롬과 sim의 도구 번호는 체계가 달라 이름으로 잇는다 (`ITEM_IDS`)
    expect(romItem('Sitrus Berry')).toBe(158)
    expect(romItem('Focus Sash')).toBe(275)
    expect(romItem('Leftovers')).toBe(234)
    expect(romItem('Not An Item')).toBeNull()
  })

  it('열매를 먹은 줄은 조용하고, 뒤따르는 회복 줄이 열매를 부른다', () => {
    expect(line('|-enditem|p1a: 모부기|Sitrus Berry|[eat]')).toBeNull()
    expect(line('|-heal|p1a: 모부기|30/40|[from] item: Sitrus Berry'))
      .toBe('모부기는 자뭉열매로\n체력을 회복했다!')
    // 먹다남은음식은 「조금」이다 (`subscript_restore_a_little_hp`)
    expect(line('|-heal|p1a: 모부기|30/40|[from] item: Leftovers'))
      .toBe('모부기는 먹다남은음식으로\n조금 회복했다')
  })

  it('열매가 고친 상태이상은 상태마다 줄이 다르고, 함께 고치면 한 줄이다', () => {
    const cheri = { id: 'cheriberry', num: 149, name: 'Cheri Berry' }
    const lum = { id: 'lumberry', num: 157, name: 'Lum Berry' }
    expect(say({ kind: 'curestatus', actor: MINE, status: 'par', curedBy: { item: cheri, all: false } }))
      .toBe('모부기는 버치열매로\n마비가 풀렸다!')
    // 리샘열매도 하나만 고쳤으면 그 상태의 줄이다 (`HOLD_EFFECT_STATUS_RESTORE`)
    expect(say({ kind: 'curestatus', actor: MINE, status: 'par', curedBy: { item: lum, all: false } }))
      .toBe('모부기는 리샘열매로\n마비가 풀렸다!')
    const all = say({ kind: 'curestatus', actor: MINE, status: 'par', curedBy: { item: lum, all: true } })
    expect(all).toBe('모부기는 리샘열매로\n상태이상이 나았다!')
    // 혼란 쪽도 같은 글이 되어 박자가 한 번만 띄운다
    expect(say({
      kind: 'volatile', actor: MINE, effect: eff('confusion', 'other'), start: false, of: null,
      extra: NO_EXTRA, curedBy: { item: lum, all: true },
    })).toBe(all)
    expect(say({
      kind: 'volatile', actor: MINE, effect: eff('confusion', 'other'), start: false, of: null,
      extra: NO_EXTRA, curedBy: { item: { id: 'persimberry', num: 156, name: 'Persim Berry' }, all: false },
    })).toBe('모부기는 시몬열매로\n혼란이 풀렸다!')
  })

  it('도구가 올린 랭크는 도구가 주어다', () => {
    expect(line('|-boost|p1a: 모부기|atk|1|[from] item: Liechi Berry'))
      .toBe('치리열매로 모부기의\n공격이 올라갔다!')
    // 스타열매만 「크게」다
    expect(line('|-boost|p1a: 모부기|spa|2|[from] item: Starf Berry')).toContain('크게 올라갔다')
  })

  it('기합의띠 · 기합의머리띠는 같은 줄로 버틴다', () => {
    expect(line('|-enditem|p1a: 모부기|Focus Sash')).toBe('모부기는 기합의띠로\n버텼다!')
    expect(line('|-activate|p1a: 모부기|item: Focus Band')).toBe('모부기는 기합의머리띠로\n버텼다!')
  })

  it('탁쳐서떨구기 · 도둑질 · 트릭 · 통찰', () => {
    expect(line('|-enditem|p2a: 팬텀|Leftovers|[from] move: Knock Off|[of] p1a: 모부기'))
      .toBe('모부기는 야생 팬텀의\n먹다남은음식을 탁쳐서 떨구었다!')
    // 빼앗긴 쪽 줄은 쇼다운이 조용히 하라고 단다 — 빼앗은 쪽 줄이 말한다
    expect(line('|-enditem|p2a: 팬텀|Leftovers|[silent]|[from] move: Thief|[of] p1a: 모부기')).toBeNull()
    expect(line('|-item|p1a: 모부기|Leftovers|[from] move: Thief|[of] p2a: 팬텀'))
      .toBe('모부기는 야생 팬텀으로부터\n먹다남은음식을 빼앗았다!')
    expect(line('|-item|p2a: 팬텀|Leftovers|[from] move: Trick'))
      .toBe('야생 팬텀은\n먹다남은음식을 손에 넣었다!')
    // 통찰은 자리가 비어 오고 통찰한 쪽이 `[of]`다
    expect(line('|-item||Leftovers|[from] ability: Frisk|[of] p1a: 모부기'))
      .toBe('모부기는\n먹다남은음식을 통찰했다!')
  })

  it('하양허브는 쓴 줄이 말하고, 랭크를 되돌리는 줄은 조용하다', () => {
    expect(line('|-enditem|p1a: 모부기|White Herb')).toBe('모부기는 하양허브로\n상태를 원래대로 되돌렸다!')
    expect(line('|-clearnegativeboost|p1a: 모부기|[silent]')).toBeNull()
  })

  it('과사열매는 채운 기술을 부른다', () => {
    expect(line('|-activate|p1a: 모부기|item: Leppa Berry|Tackle|[consumed]'))
      .toBe('모부기는 과사열매로\n몸통박치기의 PP를 회복했다!')
  })

  it('구슬과 남의 열매에 다친 줄', () => {
    expect(line('|-status|p1a: 모부기|tox|[from] item: Toxic Orb'))
      .toBe('모부기는\n맹독구슬 때문에\n맹독에 중독됐다!')
    // 생명의구슬은 원작이 말하지 않는다 (`subscript_lose_hp_from_item`)
    expect(line('|-damage|p1a: 모부기|30/40|[from] item: Life Orb')).toBeNull()
    expect(line('|-damage|p2a: 팬텀|30/40|[from] item: Jaboca Berry|[of] p1a: 모부기'))
      .toBe('야생 팬텀은 모부기의\n자보열매 때문에\n데미지를 입었다!')
  })

  it('반감 열매는 막은 기술까지 부른다 — 기술은 박자가 실어 준다', () => {
    const e = parseLine('|-enditem|p1a: 모부기|Occa Berry|[weaken]')!
    expect(e.kind).toBe('enditem')
    const text = say({ ...e, move: 33 } as BattleEvent)
    expect(text).toContain('오카열매')
    expect(text).toContain('몸통박치기')
    expect(text).not.toContain('{')
  })

  it('변신은 따라 한 쪽의 **종 이름**을 부른다', () => {
    const e = parseLine('|-transform|p2a: 팬텀|p1a: 모부기')!
    expect(e).toMatchObject({ kind: 'transform', actor: { slot: 'p2a' }, target: { slot: 'p1a' } })
    const species: string[] = []
    species[387] = '모부기'
    // 종은 박자가 직전 뷰에서 읽어 붙인다(`playback`) — 여기서는 붙인 꼴을 넣는다
    expect(battleText({ ...e, species: 387 } as BattleEvent, { ...ctx, names: { ...names, species } }))
      .toBe('야생 팬텀은\n모부기로 변신했다!')
    // 종을 모르면 조용하다 — 반쪽 문장을 놓지 않는다
    expect(say(e)).toBeNull()
  })
})
